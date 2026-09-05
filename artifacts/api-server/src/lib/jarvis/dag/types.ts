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
}

export interface TaskExecutionTrace {
  graphId: string;
  taskId: string;
  agentRole: string;
  agentName: string;
  startTime: string;
  endTime?: string;
  status: TaskStatus;
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
}

export interface DAGExecutionResult {
  graph: TaskGraph;
  traces: TaskExecutionTrace[];
  succeededNodeCount: number;
  failedNodeCount: number;
  blockedNodeCount: number;
  totalDurationMs: number;
}
