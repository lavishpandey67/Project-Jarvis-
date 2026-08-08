import {
  CognitiveMemoryRecord,
  MemoryConflictRecord,
  MemoryScope,
  MemorySource,
  MemoryValidity,
  MemoryType,
  MemoryWriteClassification,
  filterSecrets,
} from "./types";

export class CognitiveMemoryStore {
  private memories: Map<string, CognitiveMemoryRecord> = new Map();
  private conflicts: Map<string, MemoryConflictRecord> = new Map();
  private idCounter = 1;

  constructor() {}

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

    // Check for trivial chatter
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
   * Add a new memory record with secret scrubbing and scoping
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
    return fullRecord;
  }

  /**
   * Retrieve a single memory by ID
   */
  public async getMemory(id: string): Promise<CognitiveMemoryRecord | null> {
    const record = this.memories.get(id);
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
      // 1. Project Isolation Check
      if (scope.projectId && record.projectId) {
        if (scope.projectId !== record.projectId && !scope.allowCrossProject) {
          continue; // Strict project boundary
        }
      }

      // 2. Conversation Check (if scoped to conversation)
      if (scope.conversationId && record.conversationId) {
        if (scope.conversationId !== record.conversationId && record.memoryType === "WORKING") {
          continue;
        }
      }

      // 3. Layer Filter
      if (filter?.layer && record.memoryType !== filter.layer) {
        continue;
      }

      // 4. Validity Filter
      if (filter?.validity && record.validity !== filter.validity) {
        continue;
      }

      // 5. Invalidation Check
      if (!filter?.includeInvalidated && record.validity === "INVALIDATED") {
        continue;
      }

      // 6. Confidence Filter
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
    }

    if (conflictingMemoryId) {
      const conflicting = this.memories.get(conflictingMemoryId);
      if (conflicting) {
        conflicting.validity = "CONFLICTED";
        conflicting.updatedAt = new Date().toISOString();
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
    return true;
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
   * Clear all memories (for test resetting)
   */
  public clearAll(): void {
    this.memories.clear();
    this.conflicts.clear();
  }
}
