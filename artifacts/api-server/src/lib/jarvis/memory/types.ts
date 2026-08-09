import { AgentCapability, ToolPermission } from "../types";

export type MemoryType = "WORKING" | "EPISODIC" | "PROJECT" | "SEMANTIC" | "DECISION" | "LESSON";

export type MemoryValidity =
  | "FACT"
  | "INFERENCE"
  | "USER_PREFERENCE"
  | "DECISION"
  | "LESSON"
  | "UNVERIFIED"
  | "CONFLICTED"
  | "INVALIDATED";

export type MemorySource = "USER" | "AGENT" | "DAG_RUNNER" | "CRITIC" | "SYSTEM";

export type MemoryWriteClassification =
  | "DISCARD"
  | "WORKING_ONLY"
  | "EPISODIC"
  | "PROJECT"
  | "SEMANTIC_CANDIDATE"
  | "DECISION"
  | "LESSON_CANDIDATE";

export interface CognitiveMemoryRecord {
  id: string;
  memoryType: MemoryType;
  projectId?: string;
  conversationId?: number;
  taskId?: string;
  agentRole?: string;
  source: MemorySource;
  title: string;
  content: string;
  summary?: string;
  confidence: number; // 0.0 to 1.0
  importance: number; // 1 to 5
  validity: MemoryValidity;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  lastReinforcedAt?: string;
  accessCount?: number;
  supersededBy?: string;
  relatedMemoryIds?: string[];
  relatedTaskIds?: string[];
  relatedDecisionIds?: string[];
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface MemoryScope {
  userId?: string;
  projectId?: string;
  conversationId?: number;
  taskId?: string;
  agentRole?: string;
  allowCrossProject?: boolean;
}

export interface ContextBudget {
  maxTotalItems: number; // e.g. 10
  maxTokensApprox: number; // e.g. 2000
  maxPerLayer?: Partial<Record<MemoryType, number>>;
}

export interface ContextRetrievalMetadata {
  candidatesRetrieved: number;
  itemsSelected: number;
  layerBreakdown: Record<MemoryType, number>;
  contextSizeChars: number;
  retrievalLatencyMs: number;
  conflictsDetectedCount: number;
  secretsMaskedCount: number;
}

export interface MemoryConflictRecord {
  id: string;
  existingMemoryId: string;
  conflictingMemoryId?: string;
  description: string;
  detectedAt: string;
  status: "ACTIVE" | "RESOLVED" | "SUPERSEDED";
  resolutionNote?: string;
}

export interface CognitiveStateSnapshot {
  snapshotId: string;
  objective: string;
  intentDomain?: string;
  projectId?: string;
  activePlanSummary?: string;
  activeDAGSummary?: string;
  currentTaskId?: string;
  currentTaskAgentRole?: string;
  relevantMemories: CognitiveMemoryRecord[];
  currentEvidence: string[];
  agentOutputsSummary?: string;
  knownConstraints: string[];
  activeDecisions: CognitiveMemoryRecord[];
  unresolvedQuestions: string[];
  conflicts: MemoryConflictRecord[];
  risks: string[];
  nextRecommendedAction: string;
  reasoningArtifact?: CognitiveReasoningArtifact;
  createdAt: string;
}

/**
 * 6-Level Cognitive Complexity Classification
 */
export type CognitiveComplexityLevel =
  | "LEVEL_0" // Direct / Instant answer (No DAG, min context, no delegation)
  | "LEVEL_1" // Single operation (Single agent task, light context)
  | "LEVEL_2" // Multi-step operation (2-step linear DAG)
  | "LEVEL_3" // Multi-agent task (Standard multi-agent DAG)
  | "LEVEL_4" // Complex DAG (DAG + Critic gate + Revision loop)
  | "LEVEL_5"; // Strategic / Open-ended (Deep deliberation, cognitive state snapshots, strict evaluation)

/**
 * Structured Cognitive Reasoning Artifact
 */
export interface CognitiveReasoningArtifact {
  id: string;
  objective: string;
  complexityLevel: CognitiveComplexityLevel;
  knownFacts: string[];
  unknowns: string[];
  assumptions: string[];
  constraints: string[];
  hypotheses: Array<{ id: string; statement: string; confidence: number; status: "ACTIVE" | "VERIFIED" | "REJECTED" }>;
  evidence: Array<{ source: string; content: string; reliability: number }>;
  alternativesEvaluated: Array<{ option: string; pros: string[]; cons: string[]; decision: "SELECTED" | "REJECTED" | "DEFERRED" }>;
  tradeoffs: string[];
  contradictionsDetected: string[];
  decisionsMade: Array<{ decision: string; rationale: string; reversibility: "reversible" | "irreversible" }>;
  unresolvedQuestions: string[];
  overallConfidence: number; // 0.0 - 1.0
  nextRecommendedAction: string;
  createdAt: string;
}

/**
 * Internal Tool Foundation Types
 */
export type ToolPermissionClass = "READ" | "WRITE" | "EXECUTE" | "DESTRUCTIVE";
export type ToolFailurePolicy = "STOP_ON_FAILURE" | "RETRY" | "CONTINUE_WITH_WARNING";

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  permissionClass: ToolPermissionClass;
  riskLevel: "low" | "medium" | "high";
  isReversible: boolean;
  sandboxed: boolean;
  resourceCost: number; // 1 to 5
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  allowedAgentRoles?: string[];
  externalImpact?: boolean;
  executionTimeoutMs?: number;
  failurePolicy?: ToolFailurePolicy;
  execute: (input: any, context?: any) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  logs?: string[];
  executionTimeMs: number;
}

export interface ToolExecutionTrace {
  id: string;
  toolId: string;
  toolName: string;
  agentRole?: string;
  taskId?: string;
  input: any;
  output: any;
  success: boolean;
  error?: string;
  executionTimeMs: number;
  permissionClass: ToolPermissionClass;
  riskLevel: string;
  createdAt: string;
}

/**
 * User Personal Cognitive Pattern Modeling Types
 */
export type CognitivePatternType =
  | "RECURRING_GOAL"
  | "DECISION_CRITERIA"
  | "REASONING_APPROACH"
  | "USER_CORRECTION"
  | "STABLE_PREFERENCE"
  | "PROJECT_RELATIONSHIP"
  | "SUCCESSFUL_STRATEGY";

export interface PatternEvidenceItem {
  interactionId?: string;
  timestamp: string;
  observation: string;
}

export interface UserCognitivePattern {
  id: string;
  patternType: CognitivePatternType;
  title: string;
  description: string;
  evidence: PatternEvidenceItem[];
  confidence: number; // 0 to 100
  occurrences: number;
  source: string;
  projectId?: string;
  validationStatus: "CANDIDATE" | "VALIDATED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  lastObservedAt: string;
}

/**
 * Cognitive Challenge & Counterfactual Types
 */
export interface CognitiveChallengeReport {
  triggered: boolean;
  score: number; // 0 to 100
  rationale: string;
  assumptionsIdentified: string[];
  unsupportedClaims: string[];
  contradictionsDetected: string[];
  alternativeHypotheses: string[];
  alternativeStrategies: Array<{ strategy: string; tradeoffs: string; riskLevel: string }>;
  secondOrderConsequences: string[];
  counterfactualScenarios: Array<{ scenario: string; potentialOutcome: string }>;
  reversibilityAssessment: "reversible" | "partially_reversible" | "irreversible";
  confidenceScore: number; // 0.0 to 1.0
  createdAt: string;
}

/**
 * Adaptive Generalist Role Profile
 */
export interface TaskRoleProfile {
  profileId: string;
  agentId: "agent_generalist_a" | "agent_generalist_b";
  temporaryRoleName: string; // e.g., "DEBUGGER", "SECURITY", "DEVOPS", "RECOVERY", "INTEGRATOR", "VERIFIER"
  description: string;
  capabilities: AgentCapability[];
  authorizedToolIds: string[];
  permissionBoundary: ToolPermissionClass[];
  expiryTime: string; // ISO date string after which profile automatically expires
  createdAt: string;
  taskId?: string;
  projectId?: string;
  allowedPaths?: string[];
}

export interface ScopedContextPackage {
  conversationId: number;
  projectId?: string;
  scope: MemoryScope;
  recentMessages: Array<{ role: string; content: string }>;
  relevantMemories: Array<{ title: string; content: string; importance: number }>;
  importantEvidence: string[];
  applicableDecisions: CognitiveMemoryRecord[];
  relevantLessons: CognitiveMemoryRecord[];
  episodicTraces: CognitiveMemoryRecord[];
  userCognitivePatterns?: UserCognitivePattern[];
  activeTasks: Array<{ id: number; title: string; status: string }>;
  agentPermissions: ToolPermission[];
  currentTaskState?: { taskId: string; status: string; revisionCount: number };
  unresolvedConflicts: MemoryConflictRecord[];
  constraints: string[];
  cognitiveStateSnapshot?: CognitiveStateSnapshot;
  cognitiveChallengeReport?: CognitiveChallengeReport;
  retrievalMetadata: ContextRetrievalMetadata;
}

/**
 * Secret Filtering Utility
 */
export function filterSecrets(text: string): { sanitizedText: string; secretsMasked: number } {
  if (!text) return { sanitizedText: "", secretsMasked: 0 };
  let maskedCount = 0;
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/g,
    /AIzaSy[a-zA-Z0-9_-]{33}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
    /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    /(password|secret|api[_-]?key)\s*[:=]\s*["']?[a-zA-Z0-9_.-]{8,}["']?/gi,
  ];

  let sanitized = text;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, () => {
      maskedCount++;
      return "[REDACTED_SECRET]";
    });
  }

  return { sanitizedText: sanitized, secretsMasked: maskedCount };
}

/**
 * Prompt Injection Protection
 */
export function sanitizeMemoryForPrompt(text: string): string {
  if (!text) return "";
  // Strip injection triggers that attempt to override system prompts
  return text
    .replace(/SYSTEM\s*:\s*/gi, "SYSTEM_NOTE: ")
    .replace(/IGNORE PREVIOUS INSTRUCTIONS/gi, "[SUPPRESSED_INJECTION_ATTEMPT]")
    .replace(/<\|im_start\|>system/gi, "[SUPPRESSED_SYSTEM_TAG]");
}
