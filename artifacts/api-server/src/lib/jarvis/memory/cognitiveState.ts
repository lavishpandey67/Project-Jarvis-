import { CognitiveComplexityLevel, CognitiveMemoryRecord, CognitiveReasoningArtifact, CognitiveStateSnapshot, MemoryConflictRecord } from "./types";

export interface BuildSnapshotParams {
  objective: string;
  intentDomain?: string;
  projectId?: string;
  activePlanSummary?: string;
  activeDAGSummary?: string;
  currentTaskId?: string;
  currentTaskAgentRole?: string;
  relevantMemories?: CognitiveMemoryRecord[];
  evidence?: string[];
  agentOutputsSummary?: string;
  constraints?: string[];
  activeDecisions?: CognitiveMemoryRecord[];
  unresolvedQuestions?: string[];
  conflicts?: MemoryConflictRecord[];
  risks?: string[];
  nextRecommendedAction?: string;
  reasoningArtifact?: CognitiveReasoningArtifact;
}

export class CognitiveStateManager {
  private snapshots: Map<string, CognitiveStateSnapshot> = new Map();
  private artifacts: Map<string, CognitiveReasoningArtifact> = new Map();
  private snapshotCounter = 1;

  /**
   * Create a structured Cognitive Reasoning Artifact
   */
  public createReasoningArtifact(params: {
    objective: string;
    complexityLevel?: CognitiveComplexityLevel;
    knownFacts?: string[];
    unknowns?: string[];
    assumptions?: string[];
    constraints?: string[];
    hypotheses?: Array<{ id: string; statement: string; confidence: number; status: "ACTIVE" | "VERIFIED" | "REJECTED" }>;
    evidence?: Array<{ source: string; content: string; reliability: number }>;
    alternativesEvaluated?: Array<{ option: string; pros: string[]; cons: string[]; decision: "SELECTED" | "REJECTED" | "DEFERRED" }>;
    tradeoffs?: string[];
    contradictionsDetected?: string[];
    decisionsMade?: Array<{ decision: string; rationale: string; reversibility: "reversible" | "irreversible" }>;
    unresolvedQuestions?: string[];
    overallConfidence?: number;
    nextRecommendedAction?: string;
  }): CognitiveReasoningArtifact {
    const id = `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const artifact: CognitiveReasoningArtifact = {
      id,
      objective: params.objective,
      complexityLevel: params.complexityLevel || "LEVEL_3",
      knownFacts: params.knownFacts || [],
      unknowns: params.unknowns || [],
      assumptions: params.assumptions || [],
      constraints: params.constraints || [],
      hypotheses: params.hypotheses || [],
      evidence: params.evidence || [],
      alternativesEvaluated: params.alternativesEvaluated || [],
      tradeoffs: params.tradeoffs || [],
      contradictionsDetected: params.contradictionsDetected || [],
      decisionsMade: params.decisionsMade || [],
      unresolvedQuestions: params.unresolvedQuestions || [],
      overallConfidence: typeof params.overallConfidence === "number" ? params.overallConfidence : 0.85,
      nextRecommendedAction: params.nextRecommendedAction || "Proceed to execute DAG task graph",
      createdAt: new Date().toISOString(),
    };

    this.artifacts.set(id, artifact);
    return artifact;
  }

  /**
   * Create a bounded CognitiveStateSnapshot
   */
  public createSnapshot(params: BuildSnapshotParams): CognitiveStateSnapshot {
    const snapshotId = `state_${Date.now()}_${this.snapshotCounter++}`;

    // Cap sizes to prevent memory bloat
    const boundedMemories = (params.relevantMemories || []).slice(0, 8);
    const boundedEvidence = (params.evidence || []).slice(0, 6);
    const boundedConstraints = (params.constraints || []).slice(0, 10);
    const boundedDecisions = (params.activeDecisions || []).slice(0, 5);
    const boundedQuestions = (params.unresolvedQuestions || []).slice(0, 5);
    const boundedConflicts = (params.conflicts || []).slice(0, 5);
    const boundedRisks = (params.risks || []).slice(0, 5);

    const snapshot: CognitiveStateSnapshot = {
      snapshotId,
      objective: params.objective,
      intentDomain: params.intentDomain,
      projectId: params.projectId,
      activePlanSummary: params.activePlanSummary,
      activeDAGSummary: params.activeDAGSummary,
      currentTaskId: params.currentTaskId,
      currentTaskAgentRole: params.currentTaskAgentRole,
      relevantMemories: boundedMemories,
      currentEvidence: boundedEvidence,
      agentOutputsSummary: params.agentOutputsSummary,
      knownConstraints: boundedConstraints,
      activeDecisions: boundedDecisions,
      unresolvedQuestions: boundedQuestions,
      conflicts: boundedConflicts,
      risks: boundedRisks,
      nextRecommendedAction: params.nextRecommendedAction || "Proceed with current DAG execution",
      reasoningArtifact: params.reasoningArtifact,
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  public getSnapshot(id: string): CognitiveStateSnapshot | undefined {
    return this.snapshots.get(id);
  }

  public getLatestSnapshotForProject(projectId: string): CognitiveStateSnapshot | undefined {
    const projectSnapshots = Array.from(this.snapshots.values()).filter((s) => s.projectId === projectId);
    return projectSnapshots[projectSnapshots.length - 1];
  }
}
