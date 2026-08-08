import { findBestAgentForCapabilities, getAgentByRole } from "../registry";
import { AgentCapability, IntentAnalysis } from "../types";
import { TaskGraph, TaskGraphNode } from "./types";

export function createDAGFromIntent(intent: IntentAnalysis): TaskGraph {
  const graphId = `graph_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = new Date().toISOString();

  if (intent.directResponsePossible && !intent.delegationRequired) {
    return {
      graphId,
      requestId: intent.requestId,
      objective: intent.objective,
      nodes: [],
      createdAt,
      status: "COMPLETED",
    };
  }

  const nodes: TaskGraphNode[] = [];
  const requiredCaps = intent.requiredCapabilities;

  // Determine which domain roles are implied
  const needsResearch = requiredCaps.some((c) =>
    ["research", "evidence_extraction", "document_analysis", "factual_grounding"].includes(c),
  ) || intent.domain === "research";

  const needsStrategy = requiredCaps.some((c) =>
    ["planning", "prioritization", "decision_analysis", "tradeoff_analysis"].includes(c),
  ) || intent.domain === "strategy";

  const needsBuilder = requiredCaps.some((c) =>
    ["code_generation", "implementation", "refactoring", "debugging"].includes(c),
  ) || intent.domain === "engineering";

  const needsCritic = requiredCaps.some((c) =>
    ["evaluation", "contradiction_detection", "risk_analysis", "adversarial_review"].includes(c),
  ) || intent.domain === "review";

  const needsExecutor = requiredCaps.some((c) =>
    ["approved_tool_execution", "workspace_operations", "operational_actions"].includes(c),
  ) || intent.domain === "operations";

  // Build DAG Nodes based on capability workflow
  let lastTaskId: string | null = null;

  if (needsResearch) {
    const researchAgent = getAgentByRole("research")!;
    const taskId = `task_${Date.now()}_res`;
    nodes.push({
      taskId,
      graphId,
      description: `Gather facts, sources, and evidence for: ${intent.objective}`,
      assignedAgentRole: "research",
      assignedAgentName: researchAgent.name,
      requiredCapabilities: ["research", "evidence_extraction"],
      dependencies: [],
      constraints: ["Strict factual grounding", "Source-aware evidence"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
    lastTaskId = taskId;
  }

  if (needsStrategy) {
    const strategyAgent = getAgentByRole("strategy")!;
    const taskId = `task_${Date.now()}_strat`;
    nodes.push({
      taskId,
      graphId,
      description: `Analyze trade-offs and strategic options for: ${intent.objective}`,
      assignedAgentRole: "strategy",
      assignedAgentName: strategyAgent.name,
      requiredCapabilities: ["planning", "prioritization", "decision_analysis"],
      dependencies: lastTaskId ? [lastTaskId] : [],
      constraints: ["Explicit trade-off matrices", "Prioritized action roadmap"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
    lastTaskId = taskId;
  }

  if (needsBuilder) {
    const builderAgent = getAgentByRole("builder")!;
    const taskId = `task_${Date.now()}_build`;
    nodes.push({
      taskId,
      graphId,
      description: `Generate technical implementations or architecture code for: ${intent.objective}`,
      assignedAgentRole: "builder",
      assignedAgentName: builderAgent.name,
      requiredCapabilities: ["code_generation", "implementation"],
      dependencies: lastTaskId ? [lastTaskId] : [],
      constraints: ["Executable technical artifacts", "Strict type safety"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
    lastTaskId = taskId;
  }

  if (needsCritic) {
    const criticAgent = getAgentByRole("critic")!;
    const taskId = `task_${Date.now()}_crit`;
    nodes.push({
      taskId,
      graphId,
      description: `Stress-test and evaluate outputs for risk or flaws in: ${intent.objective}`,
      assignedAgentRole: "critic",
      assignedAgentName: criticAgent.name,
      requiredCapabilities: ["evaluation", "risk_analysis"],
      dependencies: lastTaskId ? [lastTaskId] : [],
      constraints: ["Adversarial check", "Identify risk factors and gaps"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
    lastTaskId = taskId;
  }

  if (needsExecutor) {
    const executorAgent = getAgentByRole("executor")!;
    const taskId = `task_${Date.now()}_exec`;
    nodes.push({
      taskId,
      graphId,
      description: `Execute approved operational step for: ${intent.objective}`,
      assignedAgentRole: "executor",
      assignedAgentName: executorAgent.name,
      requiredCapabilities: ["approved_tool_execution", "workspace_operations"],
      dependencies: lastTaskId ? [lastTaskId] : [],
      constraints: ["Operate within strict permission bounds"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
  }

  // Fallback: If no specific capability matched, create single primary task
  if (nodes.length === 0) {
    const matchedAgent = findBestAgentForCapabilities(requiredCaps);
    const taskId = `task_${Date.now()}_1`;
    nodes.push({
      taskId,
      graphId,
      description: intent.objective,
      assignedAgentRole: matchedAgent.role,
      assignedAgentName: matchedAgent.name,
      requiredCapabilities: requiredCaps,
      dependencies: [],
      constraints: ["Standard execution guidelines"],
      status: "PENDING",
      retryCount: 0,
      maxRetries: 2,
      timeoutMs: 30000,
    });
  }

  return {
    graphId,
    requestId: intent.requestId,
    objective: intent.objective,
    nodes,
    createdAt,
    status: "PENDING",
  };
}
