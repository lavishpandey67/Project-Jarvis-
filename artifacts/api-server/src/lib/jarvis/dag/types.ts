import { AgentCapability, ScopedContext } from "../types";
import { EvaluationResult, EvaluationVerdict } from "../eval/types";

export type TaskStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "PARTIAL"
  | "BLOCKED"
  | "CANCELLED"
  | "TIMEOUT";

export type KernelLifecycleStage =
  | "OBJECTIVE"
  | "UNDERSTAND"
  | "PLAN"
  | "AUTHORIZE"
  | "EXECUTE"
  | "OBSERVE"
  | "EVALUATE"
  | "RECOVER"
  | "COMPLETE"
  | "FAILED";

export interface StructuredObservation {
  action: string;
  tool?: string;
  inputs?: Record<string, any>;
  target?: string;
  success: boolean;
  status: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  before?: {
    sizeBytes?: number;
    hash?: string | null;
    content?: string;
  };
  after?: {
    sizeBytes?: number;
    hash?: string;
    content?: string;
  };
  error?: string;
  timestamp: string;
  durationMs?: number;
  degraded?: boolean;
  metadata?: Record<string, any>;
}

export interface NodeTransitionRecord {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  fromStage?: KernelLifecycleStage;
  toStage: KernelLifecycleStage;
  timestamp: string;
  reason?: string;
}

export interface TaskGraphNode {
  taskId: string;
  graphId: string;
  description: string;
  assignedAgentRole: "research" | "strategy" | "builder" | "critic" | "executor" | "generalist_a" | "generalist_b";
  assignedAgentName: string;
  requiredCapabilities: AgentCapability[];
  dependencies: string[]; // List of parent taskId dependencies
  inputs?: Record<string, any>;
  expectedOutputs?: string;
  constraints: string[];
  status: TaskStatus;
  stage?: KernelLifecycleStage;
  observations?: StructuredObservation[];
  transitionHistory?: NodeTransitionRecord[];
  authorizationVerdict?: {
    approved: boolean;
    status: "APPROVED" | "ESCALATE" | "REJECTED";
    reason: string;
  };
  recoveryHistory?: any[];
  allowPartialDependency?: boolean; // If true, can run even if a dependency is PARTIAL
  retryCount: number;
  maxRetries: number;
  revisionCount?: number;
  maxRevisionCycles?: number;
  evaluationHistory?: EvaluationResult[];
  latestEvaluation?: EvaluationResult;
  timeoutMs: number;
  confidence?: number;
  risk?: string;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskGraph {
  graphId: string;
  requestId: string;
  objective: string;
  nodes: TaskGraphNode[];
  createdAt: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";
  stage?: KernelLifecycleStage;
  transitionHistory?: Array<{
    stage: KernelLifecycleStage;
    status: TaskGraph["status"];
    timestamp: string;
    reason?: string;
  }>;
}

export interface TaskExecutionTrace {
  graphId: string;
  taskId: string;
  agentRole: string;
  agentName: string;
  startTime: string;
  endTime?: string;
  status: TaskStatus;
  stage?: KernelLifecycleStage;
  retryCount: number;
  revisionCycle?: number;
  evaluator?: string;
  verdict?: EvaluationVerdict;
  failureReasons?: string[];
  evaluationResult?: EvaluationResult;
  latencyMs?: number;
  confidence?: number;
  targetFiles?: string[];
  error?: string;
  observations?: StructuredObservation[];
  transitionHistory?: NodeTransitionRecord[];
}

export interface DAGExecutionResult {
  graph: TaskGraph;
  traces: TaskExecutionTrace[];
  observations?: StructuredObservation[];
  succeededNodeCount: number;
  failedNodeCount: number;
  blockedNodeCount: number;
  totalDurationMs: number;
}
