import { ToolPermission } from "../types";
import { RelevanceScorer, ScoringConfig } from "./scorer";
import { CognitiveMemoryStore } from "./store";
import {
  CognitiveMemoryRecord,
  ContextBudget,
  ContextRetrievalMetadata,
  MemoryScope,
  MemoryType,
  ScopedContextPackage,
  sanitizeMemoryForPrompt,
} from "./types";

export interface ContextEngineOptions {
  store: CognitiveMemoryStore;
  scorer?: RelevanceScorer;
  defaultBudget?: ContextBudget;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxTotalItems: 10,
  maxTokensApprox: 2000,
  maxPerLayer: {
    WORKING: 4,
    EPISODIC: 3,
    PROJECT: 4,
    SEMANTIC: 3,
    DECISION: 3,
    LESSON: 3,
  },
};

export class ContextRetrievalEngine {
  private store: CognitiveMemoryStore;
  private scorer: RelevanceScorer;
  private defaultBudget: ContextBudget;

  constructor(options: ContextEngineOptions) {
    this.store = options.store;
    this.scorer = options.scorer || new RelevanceScorer();
    this.defaultBudget = options.defaultBudget || DEFAULT_CONTEXT_BUDGET;
  }

  /**
   * Build a scoped, ranked, budget-enforced Context Package for an agent/task
   */
  public async buildScopedContextPackage(params: {
    objective: string;
    conversationId: number;
    projectId?: string;
    agentRole?: "research" | "strategy" | "builder" | "critic" | "executor";
    requiredCapabilities?: string[];
    constraints?: string[];
    recentMessages?: Array<{ role: string; content: string }>;
    activeTasks?: Array<{ id: number; title: string; status: string }>;
    taskState?: { taskId: string; status: string; revisionCount: number };
    scope?: Partial<MemoryScope>;
    budget?: Partial<ContextBudget>;
  }): Promise<ScopedContextPackage> {
    const startTime = Date.now();
    const role = params.agentRole || "builder";
    const budget = { ...this.defaultBudget, ...(params.budget || {}) };
    const scope: MemoryScope = {
      conversationId: params.conversationId,
      projectId: params.projectId,
      agentRole: role,
      allowCrossProject: params.scope?.allowCrossProject ?? false,
      ...params.scope,
    };

    // 1. Candidate Retrieval across all layers
    const candidates = await this.store.queryMemories(scope, {
      includeInvalidated: false,
    });

    const candidatesRetrieved = candidates.length;

    // 2. Score Candidates
    const scoredCandidates: Array<{ record: CognitiveMemoryRecord; score: number }> = [];
    for (const record of candidates) {
      const score = await this.scorer.scoreRecord(record, params.objective, scope, {
        taskDescription: params.objective,
        requiredCapabilities: params.requiredCapabilities,
        agentRole: role,
      });

      if (score > 0) {
        scoredCandidates.push({ record, score });
      }
    }

    // 3. Deduplicate Memories
    const uniqueCandidates: Array<{ record: CognitiveMemoryRecord; score: number }> = [];
    const seenContent = new Set<string>();

    for (const item of scoredCandidates.sort((a, b) => b.score - a.score)) {
      const norm = item.record.content.trim().toLowerCase();
      if (!seenContent.has(norm)) {
        seenContent.add(norm);
        uniqueCandidates.push(item);
      }
    }

    // 4. Role-Based Layer Prioritization & Tailoring
    const layerScores: Record<MemoryType, number> = {
      WORKING: 0,
      EPISODIC: 0,
      PROJECT: 0,
      SEMANTIC: 0,
      DECISION: 0,
      LESSON: 0,
    };

    const roleMultipliers: Record<string, Partial<Record<MemoryType, number>>> = {
      research: { SEMANTIC: 1.4, PROJECT: 1.2, EPISODIC: 1.0, DECISION: 0.8 },
      strategy: { DECISION: 1.5, LESSON: 1.4, PROJECT: 1.2, SEMANTIC: 1.0 },
      builder: { PROJECT: 1.4, WORKING: 1.3, DECISION: 1.1, SEMANTIC: 1.0 },
      critic: { LESSON: 1.4, DECISION: 1.3, SEMANTIC: 1.2, EPISODIC: 1.1 },
      executor: { WORKING: 1.5, PROJECT: 1.3, DECISION: 1.1, LESSON: 1.0 },
    };

    const multipliers = roleMultipliers[role] || {};

    const adjustedCandidates = uniqueCandidates.map(({ record, score }) => {
      const mult = multipliers[record.memoryType] || 1.0;
      return { record, score: score * mult };
    });

    adjustedCandidates.sort((a, b) => b.score - a.score);

    // 5. Budget Enforcement (Total Items + Max Per Layer + Approx Token Cap)
    const selectedMemories: CognitiveMemoryRecord[] = [];
    const layerCounts: Record<MemoryType, number> = {
      WORKING: 0,
      EPISODIC: 0,
      PROJECT: 0,
      SEMANTIC: 0,
      DECISION: 0,
      LESSON: 0,
    };

    let currentChars = 0;
    const maxCharsApprox = budget.maxTokensApprox * 4;

    for (const { record } of adjustedCandidates) {
      if (selectedMemories.length >= budget.maxTotalItems) break;

      const layerMax = budget.maxPerLayer?.[record.memoryType] ?? 4;
      if (layerCounts[record.memoryType] >= layerMax) continue;

      const recordLength = (record.title + record.content).length;
      if (currentChars + recordLength > maxCharsApprox && selectedMemories.length > 0) {
        continue;
      }

      selectedMemories.push(record);
      layerCounts[record.memoryType]++;
      currentChars += recordLength;
    }

    // 6. Partition Selected Memories into Category Collections
    const relevantMemories: Array<{ title: string; content: string; importance: number }> = [];
    const importantEvidence: string[] = [];
    const applicableDecisions: CognitiveMemoryRecord[] = [];
    const relevantLessons: CognitiveMemoryRecord[] = [];
    const episodicTraces: CognitiveMemoryRecord[] = [];

    for (const mem of selectedMemories) {
      const sanitizedContent = sanitizeMemoryForPrompt(mem.content);
      const sanitizedTitle = sanitizeMemoryForPrompt(mem.title);

      relevantMemories.push({
        title: sanitizedTitle,
        content: sanitizedContent,
        importance: mem.importance,
      });

      if (mem.memoryType === "SEMANTIC" || mem.memoryType === "PROJECT") {
        importantEvidence.push(`[${mem.memoryType}] ${sanitizedTitle}: ${sanitizedContent}`);
      } else if (mem.memoryType === "DECISION") {
        applicableDecisions.push(mem);
      } else if (mem.memoryType === "LESSON") {
        relevantLessons.push(mem);
      } else if (mem.memoryType === "EPISODIC") {
        episodicTraces.push(mem);
      }
    }

    // 7. Unresolved Conflicts
    const conflicts = await this.store.getActiveConflicts();

    // 8. Permissions based on role
    const defaultPermissions: ToolPermission[] =
      role === "executor" ? ["READ", "WRITE", "EXECUTE"] : ["READ"];

    const metadata: ContextRetrievalMetadata = {
      candidatesRetrieved,
      itemsSelected: selectedMemories.length,
      layerBreakdown: layerCounts,
      contextSizeChars: currentChars,
      retrievalLatencyMs: Date.now() - startTime,
      conflictsDetectedCount: conflicts.length,
      secretsMaskedCount: selectedMemories.reduce((acc, m) => acc + (m.metadata?.secretsMasked || 0), 0),
    };

    return {
      conversationId: params.conversationId,
      projectId: params.projectId,
      scope,
      recentMessages: (params.recentMessages || []).slice(-6),
      relevantMemories,
      importantEvidence,
      applicableDecisions,
      relevantLessons,
      episodicTraces,
      activeTasks: params.activeTasks || [],
      agentPermissions: defaultPermissions,
      currentTaskState: params.taskState,
      unresolvedConflicts: conflicts,
      constraints: params.constraints || [],
      retrievalMetadata: metadata,
    };
  }
}
