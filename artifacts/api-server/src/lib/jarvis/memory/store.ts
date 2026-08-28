import {
  CognitiveMemoryRecord,
  CognitiveReasoningArtifact,
  CognitiveStateSnapshot,
  MemoryConflictRecord,
  MemoryScope,
  MemorySource,
  MemoryValidity,
  MemoryType,
  MemoryWriteClassification,
  ToolExecutionTrace,
  UserCognitivePattern,
  filterSecrets,
} from "./types";
import {
  db,
  cognitiveMemoriesTable,
  memoryConflictsTable,
  reasoningArtifactsTable,
  cognitiveStateSnapshotsTable,
  userCognitivePatternsTable,
  toolExecutionTracesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export class CognitiveMemoryStore {
  private static instance: CognitiveMemoryStore;

  public static getInstance(): CognitiveMemoryStore {
    if (!CognitiveMemoryStore.instance) {
      CognitiveMemoryStore.instance = new CognitiveMemoryStore();
    }
    return CognitiveMemoryStore.instance;
  }

  private memories: Map<string, CognitiveMemoryRecord> = new Map();
  private conflicts: Map<string, MemoryConflictRecord> = new Map();
  private userPatterns: Map<string, UserCognitivePattern> = new Map();
  private idCounter = 1;
  public persistenceMode: "DEVELOPMENT_FALLBACK" | "PRODUCTION_PERSISTENCE" = "DEVELOPMENT_FALLBACK";

  constructor() {
    this.hydrateFromDatabase().catch(() => {
      this.persistenceMode = "DEVELOPMENT_FALLBACK";
    });
  }

  /**
   * Hydrate memory store from persistent database
   */
  public async hydrateFromDatabase(): Promise<number> {
    try {
      if (!db) return 0;
      const memRows = await db.select().from(cognitiveMemoriesTable);
      for (const row of memRows) {
        const record: CognitiveMemoryRecord = {
          id: row.id,
          memoryType: (row.memoryType as MemoryType) || "WORKING",
          projectId: row.projectId || undefined,
          conversationId: row.conversationId || undefined,
          taskId: row.taskId || undefined,
          agentRole: row.agentRole || undefined,
          source: (row.source as MemorySource) || "SYSTEM",
          title: row.title,
          content: row.content,
          summary: row.summary || undefined,
          confidence: (row.confidence || 80) / 100,
          importance: row.importance || 3,
          validity: (row.validity as MemoryValidity) || "FACT",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
          lastAccessedAt: row.lastAccessedAt ? new Date(row.lastAccessedAt).toISOString() : undefined,
          lastReinforcedAt: row.lastReinforcedAt ? new Date(row.lastReinforcedAt).toISOString() : undefined,
          supersededBy: row.supersededBy || undefined,
          relatedMemoryIds: row.relatedMemoryIds ? JSON.parse(row.relatedMemoryIds) : [],
          relatedTaskIds: row.relatedTaskIds ? JSON.parse(row.relatedTaskIds) : [],
          relatedDecisionIds: row.relatedDecisionIds ? JSON.parse(row.relatedDecisionIds) : [],
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        };
        this.memories.set(record.id, record);
      }

      const conflictRows = await db.select().from(memoryConflictsTable);
      for (const row of conflictRows) {
        const conflict: MemoryConflictRecord = {
          id: row.id,
          existingMemoryId: row.existingMemoryId,
          conflictingMemoryId: row.conflictingMemoryId || undefined,
          description: row.description,
          status: (row.status as any) || "ACTIVE",
          resolutionNote: row.resolutionNote || undefined,
          detectedAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        };
        this.conflicts.set(conflict.id, conflict);
      }

      const patternRows = await db.select().from(userCognitivePatternsTable);
      for (const row of patternRows) {
        const pattern: UserCognitivePattern = {
          id: row.id,
          patternType: row.patternType as any,
          title: row.title,
          description: row.description,
          evidence: row.evidence ? JSON.parse(row.evidence) : [],
          confidence: row.confidence || 50,
          occurrences: row.occurrences || 1,
          source: row.source || "OBSERVED_INTERACTION",
          projectId: row.projectId || undefined,
          validationStatus: (row.validationStatus as any) || "CANDIDATE",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
          lastObservedAt: row.lastObservedAt ? new Date(row.lastObservedAt).toISOString() : new Date().toISOString(),
        };
        this.userPatterns.set(pattern.id, pattern);
      }

      this.persistenceMode = "PRODUCTION_PERSISTENCE";
      return memRows.length;
    } catch (err) {
      this.persistenceMode = "DEVELOPMENT_FALLBACK";
      return 0;
    }
  }

  /**
   * Classify memory content for write gating
   */
  public classifyMemoryWrite(
    content: string,
    context: { source: MemorySource; role?: string; isPassedEvaluation?: boolean; isDecision?: boolean; isLesson?: boolean },
  ): MemoryWriteClassification {
    if (!content || content.trim().length === 0) {
      return "DISCARD";
    }

    const lower = content.toLowerCase();

    if (lower === "ok" || lower === "thanks" || lower === "hello" || lower === "bye") {
      return "DISCARD";
    }

    if (context.isDecision || lower.includes("decision:") || lower.includes("we decided to")) {
      return "DECISION";
    }

    if (context.isLesson || lower.includes("lesson learned:") || lower.includes("self-correction")) {
      return context.isPassedEvaluation ? "LESSON_CANDIDATE" : "WORKING_ONLY";
    }

    if (context.source === "DAG_RUNNER") {
      return "EPISODIC";
    }

    if (context.isPassedEvaluation && (lower.includes("benchmark") || lower.includes("verified") || lower.includes("fact"))) {
      return "SEMANTIC_CANDIDATE";
    }

    if (lower.includes("project") || lower.includes("workspace") || lower.includes("config")) {
      return "PROJECT";
    }

    return "WORKING_ONLY";
  }

  /**
   * Add a new memory record with secret scrubbing, scoping, and database persistence
   */
  public async addMemory(record: Partial<CognitiveMemoryRecord>): Promise<CognitiveMemoryRecord> {
    const rawContent = record.content || "";
    const { sanitizedText, secretsMasked } = filterSecrets(rawContent);

    const id = record.id || `mem_${Date.now()}_${this.idCounter++}`;
    const now = new Date().toISOString();

    const fullRecord: CognitiveMemoryRecord = {
      id,
      memoryType: record.memoryType || "WORKING",
      projectId: record.projectId,
      conversationId: record.conversationId,
      taskId: record.taskId,
      agentRole: record.agentRole,
      source: record.source || "SYSTEM",
      title: record.title || "Untitled Memory",
      content: sanitizedText,
      summary: record.summary,
      confidence: typeof record.confidence === "number" ? record.confidence : 0.8,
      importance: record.importance || 3,
      validity: record.validity || (record.memoryType === "SEMANTIC" ? "UNVERIFIED" : "FACT"),
      supersededBy: record.supersededBy,
      createdAt: record.createdAt || now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      relatedMemoryIds: record.relatedMemoryIds || [],
      relatedTaskIds: record.relatedTaskIds || [],
      relatedDecisionIds: record.relatedDecisionIds || [],
      metadata: { ...(record.metadata || {}), secretsMasked },
    };

    this.memories.set(id, fullRecord);

    if (db) {
      try {
        await db
          .insert(cognitiveMemoriesTable)
          .values({
            id: fullRecord.id,
            memoryType: fullRecord.memoryType,
            projectId: fullRecord.projectId || null,
            conversationId: fullRecord.conversationId || null,
            taskId: fullRecord.taskId || null,
            agentRole: fullRecord.agentRole || null,
            source: fullRecord.source,
            title: fullRecord.title,
            content: fullRecord.content,
            summary: fullRecord.summary || null,
            confidence: Math.round(fullRecord.confidence * 100),
            importance: fullRecord.importance,
            validity: fullRecord.validity,
            supersededBy: fullRecord.supersededBy || null,
            relatedMemoryIds: JSON.stringify(fullRecord.relatedMemoryIds || []),
            relatedTaskIds: JSON.stringify(fullRecord.relatedTaskIds || []),
            relatedDecisionIds: JSON.stringify(fullRecord.relatedDecisionIds || []),
            metadata: JSON.stringify(fullRecord.metadata || {}),
          })
          .onConflictDoUpdate({
            target: cognitiveMemoriesTable.id,
            set: {
              content: fullRecord.content,
              validity: fullRecord.validity,
              confidence: Math.round(fullRecord.confidence * 100),
              importance: fullRecord.importance,
              supersededBy: fullRecord.supersededBy || null,
              updatedAt: new Date(),
            },
          });
        this.persistenceMode = "PRODUCTION_PERSISTENCE";
      } catch (err) {
        this.persistenceMode = "DEVELOPMENT_FALLBACK";
      }
    }

    return fullRecord;
  }

  /**
   * Retrieve a single memory by ID
   */
  public async getMemory(id: string): Promise<CognitiveMemoryRecord | null> {
    let record = this.memories.get(id);

    if (!record && db) {
      try {
        const rows = await db.select().from(cognitiveMemoriesTable).where(eq(cognitiveMemoriesTable.id, id));
        if (rows.length > 0) {
          const row = rows[0];
          record = {
            id: row.id,
            memoryType: (row.memoryType as MemoryType) || "WORKING",
            projectId: row.projectId || undefined,
            conversationId: row.conversationId || undefined,
            taskId: row.taskId || undefined,
            agentRole: row.agentRole || undefined,
            source: (row.source as MemorySource) || "SYSTEM",
            title: row.title,
            content: row.content,
            summary: row.summary || undefined,
            confidence: (row.confidence || 80) / 100,
            importance: row.importance || 3,
            validity: (row.validity as MemoryValidity) || "FACT",
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            supersededBy: row.supersededBy || undefined,
            relatedMemoryIds: row.relatedMemoryIds ? JSON.parse(row.relatedMemoryIds) : [],
            relatedTaskIds: row.relatedTaskIds ? JSON.parse(row.relatedTaskIds) : [],
            relatedDecisionIds: row.relatedDecisionIds ? JSON.parse(row.relatedDecisionIds) : [],
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          };
          this.memories.set(record.id, record);
        }
      } catch (err) {
        this.persistenceMode = "DEVELOPMENT_FALLBACK";
      }
    }

    if (!record) return null;
    record.lastAccessedAt = new Date().toISOString();
    record.accessCount = (record.accessCount || 0) + 1;
    return record;
  }

  /**
   * Query memories respecting scope and project isolation
   */
  public async queryMemories(
    scope: MemoryScope,
    filter?: {
      layer?: MemoryType;
      validity?: MemoryValidity;
      minConfidence?: number;
      includeInvalidated?: boolean;
    },
  ): Promise<CognitiveMemoryRecord[]> {
    const results: CognitiveMemoryRecord[] = [];

    for (const record of this.memories.values()) {
      if (scope.projectId && record.projectId) {
        if (scope.projectId !== record.projectId && !scope.allowCrossProject) {
          continue;
        }
      }

      if (scope.conversationId && record.conversationId) {
        if (scope.conversationId !== record.conversationId && record.memoryType === "WORKING") {
          continue;
        }
      }

      if (filter?.layer && record.memoryType !== filter.layer) {
        continue;
      }

      if (filter?.validity && record.validity !== filter.validity) {
        continue;
      }

      if (!filter?.includeInvalidated && record.validity === "INVALIDATED") {
        continue;
      }

      if (typeof filter?.minConfidence === "number" && record.confidence < filter.minConfidence) {
        continue;
      }

      results.push(record);
    }

    return results;
  }

  /**
   * Mark memory conflict
   */
  public async markConflicted(
    existingMemoryId: string,
    description: string,
    conflictingMemoryId?: string,
  ): Promise<MemoryConflictRecord> {
    const existing = this.memories.get(existingMemoryId);
    if (existing) {
      existing.validity = "CONFLICTED";
      existing.updatedAt = new Date().toISOString();
      await this.addMemory(existing);
    }

    if (conflictingMemoryId) {
      const conflicting = this.memories.get(conflictingMemoryId);
      if (conflicting) {
        conflicting.validity = "CONFLICTED";
        conflicting.updatedAt = new Date().toISOString();
        await this.addMemory(conflicting);
      }
    }

    const conflictId = `conflict_${Date.now()}_${this.idCounter++}`;
    const conflictRecord: MemoryConflictRecord = {
      id: conflictId,
      existingMemoryId,
      conflictingMemoryId,
      description,
      detectedAt: new Date().toISOString(),
      status: "ACTIVE",
    };

    this.conflicts.set(conflictId, conflictRecord);

    if (db) {
      try {
        await db.insert(memoryConflictsTable).values({
          id: conflictRecord.id,
          existingMemoryId: conflictRecord.existingMemoryId,
          conflictingMemoryId: conflictRecord.conflictingMemoryId || null,
          description: conflictRecord.description,
          status: conflictRecord.status,
        });
      } catch (err) {
        this.persistenceMode = "DEVELOPMENT_FALLBACK";
      }
    }

    return conflictRecord;
  }

  /**
   * Resolve conflict & invalidate superseded memory
   */
  public async resolveConflict(
    conflictId: string,
    resolutionNote: string,
    supersedingMemoryId?: string,
  ): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;

    conflict.status = "RESOLVED";
    conflict.resolutionNote = resolutionNote;

    const existing = this.memories.get(conflict.existingMemoryId);
    if (existing) {
      if (supersedingMemoryId && supersedingMemoryId !== existing.id) {
        existing.validity = "INVALIDATED";
        existing.supersededBy = supersedingMemoryId;
      } else {
        existing.validity = "FACT";
      }
      existing.updatedAt = new Date().toISOString();
      await this.addMemory(existing);
    }

    if (conflict.conflictingMemoryId) {
      const conflicting = this.memories.get(conflict.conflictingMemoryId);
      if (conflicting) {
        if (supersedingMemoryId && supersedingMemoryId === conflicting.id) {
          conflicting.validity = "FACT";
        } else if (supersedingMemoryId && supersedingMemoryId !== conflicting.id) {
          conflicting.validity = "INVALIDATED";
          conflicting.supersededBy = supersedingMemoryId;
        }
        conflicting.updatedAt = new Date().toISOString();
        await this.addMemory(conflicting);
      }
    }

    if (db) {
      try {
        await db
          .update(memoryConflictsTable)
          .set({ status: "RESOLVED", resolutionNote })
          .where(eq(memoryConflictsTable.id, conflictId));
      } catch (err) {
        this.persistenceMode = "DEVELOPMENT_FALLBACK";
      }
    }
  }

  /**
   * Validate candidate memory (promotes UNVERIFIED candidate to FACT or LESSON)
   */
  public async validateMemoryCandidate(id: string, targetValidity: MemoryValidity = "FACT"): Promise<boolean> {
    const record = this.memories.get(id);
    if (!record) return false;
    record.validity = targetValidity;
    record.confidence = Math.min(1.0, record.confidence + 0.15);
    record.lastReinforcedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    await this.addMemory(record);
    return true;
  }

  /**
   * Persist Cognitive Reasoning Artifact
   */
  public async persistReasoningArtifact(artifact: CognitiveReasoningArtifact, projectId?: string): Promise<void> {
    if (!db) return;
    try {
      await db.insert(reasoningArtifactsTable).values({
        id: artifact.id,
        objective: artifact.objective,
        complexityLevel: artifact.complexityLevel,
        knownFacts: JSON.stringify(artifact.knownFacts || []),
        unknowns: JSON.stringify(artifact.unknowns || []),
        assumptions: JSON.stringify(artifact.assumptions || []),
        constraints: JSON.stringify(artifact.constraints || []),
        hypotheses: JSON.stringify(artifact.hypotheses || []),
        evidence: JSON.stringify(artifact.evidence || []),
        alternativesEvaluated: JSON.stringify(artifact.alternativesEvaluated || []),
        tradeoffs: JSON.stringify(artifact.tradeoffs || []),
        contradictionsDetected: JSON.stringify(artifact.contradictionsDetected || []),
        decisionsMade: JSON.stringify(artifact.decisionsMade || []),
        unresolvedQuestions: JSON.stringify(artifact.unresolvedQuestions || []),
        overallConfidence: Math.round(artifact.overallConfidence * 100),
        nextRecommendedAction: artifact.nextRecommendedAction,
        projectId: projectId || null,
      });
      this.persistenceMode = "PRODUCTION_PERSISTENCE";
    } catch (err) {
      this.persistenceMode = "DEVELOPMENT_FALLBACK";
    }
  }

  /**
   * Persist Cognitive State Snapshot
   */
  public async persistCognitiveStateSnapshot(snapshot: CognitiveStateSnapshot): Promise<void> {
    if (!db) return;
    try {
      await db.insert(cognitiveStateSnapshotsTable).values({
        snapshotId: snapshot.snapshotId,
        objective: snapshot.objective,
        intentDomain: snapshot.intentDomain || null,
        projectId: snapshot.projectId || null,
        activePlanSummary: snapshot.activePlanSummary || null,
        activeDAGSummary: snapshot.activeDAGSummary || null,
        currentTaskId: snapshot.currentTaskId || null,
        currentTaskAgentRole: snapshot.currentTaskAgentRole || null,
        relevantMemories: JSON.stringify(snapshot.relevantMemories || []),
        currentEvidence: JSON.stringify(snapshot.currentEvidence || []),
        agentOutputsSummary: snapshot.agentOutputsSummary || null,
        knownConstraints: JSON.stringify(snapshot.knownConstraints || []),
        activeDecisions: JSON.stringify(snapshot.activeDecisions || []),
        unresolvedQuestions: JSON.stringify(snapshot.unresolvedQuestions || []),
        conflicts: JSON.stringify(snapshot.conflicts || []),
        risks: JSON.stringify(snapshot.risks || []),
        nextRecommendedAction: snapshot.nextRecommendedAction,
        reasoningArtifactId: snapshot.reasoningArtifact?.id || null,
      });
      this.persistenceMode = "PRODUCTION_PERSISTENCE";
    } catch (err) {
      this.persistenceMode = "DEVELOPMENT_FALLBACK";
    }
  }

  /**
   * Persist User Personal Cognitive Pattern
   */
  public async persistUserCognitivePattern(pattern: UserCognitivePattern): Promise<UserCognitivePattern> {
    this.userPatterns.set(pattern.id, pattern);

    if (db) {
      try {
        await db
          .insert(userCognitivePatternsTable)
          .values({
            id: pattern.id,
            patternType: pattern.patternType,
            title: pattern.title,
            description: pattern.description,
            evidence: JSON.stringify(pattern.evidence || []),
            confidence: pattern.confidence,
            occurrences: pattern.occurrences,
            source: pattern.source,
            projectId: pattern.projectId || null,
            validationStatus: pattern.validationStatus,
          })
          .onConflictDoUpdate({
            target: userCognitivePatternsTable.id,
            set: {
              confidence: pattern.confidence,
              occurrences: pattern.occurrences,
              evidence: JSON.stringify(pattern.evidence || []),
              validationStatus: pattern.validationStatus,
              lastObservedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        this.persistenceMode = "PRODUCTION_PERSISTENCE";
      } catch (err) {
        this.persistenceMode = "DEVELOPMENT_FALLBACK";
      }
    }

    return pattern;
  }

  /**
   * Load User Personal Cognitive Patterns respecting Scope
   */
  public async loadUserCognitivePatterns(scope: MemoryScope): Promise<UserCognitivePattern[]> {
    const results: UserCognitivePattern[] = [];
    for (const pattern of this.userPatterns.values()) {
      if (scope.projectId && pattern.projectId) {
        if (scope.projectId !== pattern.projectId && !scope.allowCrossProject) {
          continue;
        }
      }
      results.push(pattern);
    }
    return results;
  }

  /**
   * Persist Tool Execution Trace
   */
  public async persistToolExecutionTrace(trace: ToolExecutionTrace): Promise<void> {
    if (!db) return;
    try {
      await db.insert(toolExecutionTracesTable).values({
        id: trace.id,
        toolId: trace.toolId,
        toolName: trace.toolName,
        agentRole: trace.agentRole || null,
        taskId: trace.taskId || null,
        input: JSON.stringify(trace.input || {}),
        output: JSON.stringify(trace.output || {}),
        success: trace.success ? 1 : 0,
        error: trace.error || null,
        executionTimeMs: trace.executionTimeMs,
        permissionClass: trace.permissionClass,
        riskLevel: trace.riskLevel,
      });
      this.persistenceMode = "PRODUCTION_PERSISTENCE";
    } catch (err) {
      this.persistenceMode = "DEVELOPMENT_FALLBACK";
    }
  }

  /**
   * Clear transient working memory for task
   */
  public async clearWorkingMemory(taskId?: string, conversationId?: number): Promise<number> {
    let clearedCount = 0;
    for (const [id, record] of Array.from(this.memories.entries())) {
      if (record.memoryType === "WORKING") {
        if ((taskId && record.taskId === taskId) || (conversationId && record.conversationId === conversationId) || (!taskId && !conversationId)) {
          this.memories.delete(id);
          clearedCount++;
        }
      }
    }
    return clearedCount;
  }

  /**
   * Get active conflicts for scope
   */
  public async getActiveConflicts(): Promise<MemoryConflictRecord[]> {
    return Array.from(this.conflicts.values()).filter((c) => c.status === "ACTIVE");
  }

  /**
   * Synchronize database memory records deterministically to prevent duplicate accumulation or unbounded memory growth
   */
  public async syncDbMemories(
    dbRows: Array<{ id: number; title: string; content: string; kind?: string; importance: number }>,
    conversationId: number,
  ): Promise<number> {
    const activeDbIds = new Set(dbRows.map((r) => `mem_db_${r.id}`));

    for (const [id, rec] of Array.from(this.memories.entries())) {
      if (id.startsWith("mem_db_") && (rec.conversationId === conversationId || !rec.conversationId)) {
        if (!activeDbIds.has(id)) {
          this.memories.delete(id);
        }
      }
    }

    for (const m of dbRows) {
      const memId = `mem_db_${m.id}`;
      await this.addMemory({
        id: memId,
        memoryType: (m.kind || "DECISION").toUpperCase() as any,
        title: m.title,
        content: m.content,
        importance: m.importance,
        conversationId,
        source: "USER",
        validity: "FACT",
        confidence: 0.9,
      });
    }

    return activeDbIds.size;
  }

  /**
   * Clear all memories (for test resetting)
   */
  public clearAll(): void {
    this.memories.clear();
    this.conflicts.clear();
    this.userPatterns.clear();
  }
}
