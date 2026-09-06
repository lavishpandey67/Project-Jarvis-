import { CognitiveComplexityLevel, ComplexityConfiguration } from "./complexity";

export type ToolPermission = "READ" | "WRITE" | "EXECUTE" | "DESTRUCTIVE";

export type AgentCapability =
  // Research capabilities
  | "research"
  | "evidence_extraction"
  | "document_analysis"
  | "source_analysis"
  | "factual_grounding"
  // Strategy capabilities
  | "planning"
  | "prioritization"
  | "decision_analysis"
  | "tradeoff_analysis"
  | "resource_allocation"
  // Builder capabilities
  | "code_generation"
  | "implementation"
  | "refactoring"
  | "testing"
  | "debugging"
  | "technical_artifact_creation"
  // Critic capabilities
  | "evaluation"
  | "contradiction_detection"
  | "risk_analysis"
  | "validation"
  | "adversarial_review"
  // Executor capabilities
  | "approved_tool_execution"
  | "workspace_operations"
  | "operational_actions";

export interface AgentContract {
  id: string;
  name: string;
  role: "research" | "strategy" | "builder" | "critic" | "executor" | "generalist_a" | "generalist_b";
  description: string;
  capabilities: AgentCapability[];
  permissions: ToolPermission[];
  status: "active" | "planned" | "disabled";
  version: string;
}

export interface IntentAnalysis {
  requestId: string;
  objective: string;
  domain: string;
  complexity: "low" | "medium" | "high";
  complexityConfig?: ComplexityConfiguration;
  ambiguity: "low" | "medium" | "high";
  requiredCapabilities: AgentCapability[];
  externalImpact: boolean;
  reversibility: "reversible" | "irreversible";
  risk: "low" | "medium" | "high";
  delegationRequired: boolean;
  directResponsePossible: boolean;
  directAnswer?: string;
  confidence: number;
}

export interface ScopedContext {
  conversationId: number;
  recentMessages: Array<{ role: string; content: string }>;
  relevantMemories: Array<{ title: string; content: string; importance: number }>;
  activeTasks: Array<{ id: number; title: string; status: string }>;
  agentPermissions: ToolPermission[];
}

export interface JarvisTaskNode {
  taskId: string;
  objective: string;
  description: string;
  requiredCapabilities: AgentCapability[];
  assignedAgentRole: "research" | "strategy" | "builder" | "critic" | "executor" | "generalist_a" | "generalist_b";
  assignedAgentName: string;
  expectedOutput: string;
  constraints: string[];
  risk: "low" | "medium" | "high";
  status: "queued" | "running" | "completed" | "failed";
}

export interface JarvisPlan {
  planId: string;
  objective: string;
  directResponsePossible: boolean;
  directAnswer?: string;
  tasks: JarvisTaskNode[];
  summary: string;
}

export interface StructuredAgentRequest {
  taskId: string;
  agentRole: "research" | "strategy" | "builder" | "critic" | "executor" | "generalist_a" | "generalist_b";
  agentName: string;
  objective: string;
  brief: string;
  constraints: string[];
  context: ScopedContext;
}

export interface StructuredAgentResponse {
  taskId: string;
  agentRole: string;
  agentName: string;
  status: "success" | "failed" | "partial";
  result: string;
  confidence: number; // 0.0 to 1.0
  evidence: string[];
  warnings: string[];
  errors: string[];
  suggestedNextAction?: string;
  observation?: any;
  observations?: any[];
}

export interface JarvisSynthesis {
  finalAnswer: string;
  summary: string;
  confidence: number;
  warnings: string[];
}
