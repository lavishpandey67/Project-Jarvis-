import { dispatchToAgent } from "../agentDispatcher";
import { evaluateTaskResult } from "../eval/evaluator";
import { ModelCaller } from "../intentAnalyzer";
import { JarvisTaskNode, ScopedContext } from "../types";
import {
  DAGExecutionResult,
  TaskExecutionTrace,
  TaskGraph,
  TaskGraphNode,
  TaskStatus,
} from "./types";
import { validateTaskGraph } from "./validator";

export const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["READY", "BLOCKED", "CANCELLED"],
  READY: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCESS", "FAILED", "PARTIAL", "TIMEOUT", "CANCELLED"],
  SUCCESS: [],
  FAILED: ["READY", "FAILED"], // READY if retrying
  PARTIAL: [],
  BLOCKED: [],
  CANCELLED: [],
  TIMEOUT: ["READY", "TIMEOUT"], // READY if retrying
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionTaskStatus(
  node: TaskGraphNode,
  targetStatus: TaskStatus,
): void {
  if (!canTransition(node.status, targetStatus)) {
    throw new Error(
      `Illegal status transition for task '${node.taskId}': '${node.status}' -> '${targetStatus}'`,
    );
  }
  node.status = targetStatus;
}

export interface DAGRunnerOptions {
  maxConcurrency?: number;
  callModelFn?: ModelCaller;
}

export async function executeTaskGraph(
  graph: TaskGraph,
  context: ScopedContext,
  options: DAGRunnerOptions = {},
): Promise<DAGExecutionResult> {
  const maxConcurrency = options.maxConcurrency ?? 3;
  const callModelFn = options.callModelFn;
  const startTime = Date.now();
  const traces: TaskExecutionTrace[] = [];

  // Validate Graph before execution
  const validation = validateTaskGraph(graph);
  if (!validation.valid) {
    graph.status = "FAILED";
    throw new Error(
      `TaskGraph validation failed for graph '${graph.graphId}': ${validation.errors.join("; ")}`,
    );
  }

  graph.status = "RUNNING";
  const nodeMap = new Map<string, TaskGraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.taskId, node);
  }

  // Helper to evaluate dependencies for PENDING tasks
  function updatePendingNodesStatus(): void {
    for (const node of graph.nodes) {
      if (node.status !== "PENDING") continue;

      if (node.dependencies.length === 0) {
        transitionTaskStatus(node, "READY");
        continue;
      }

      let allSucceeded = true;
      let hasTerminalFailure = false;

      for (const depId of node.dependencies) {
        const depNode = nodeMap.get(depId)!;
        if (
          depNode.status === "FAILED" ||
          depNode.status === "BLOCKED" ||
          depNode.status === "TIMEOUT" ||
          depNode.status === "CANCELLED"
        ) {
          hasTerminalFailure = true;
          break;
        }

        if (depNode.status === "PARTIAL") {
          if (!node.allowPartialDependency) {
            hasTerminalFailure = true;
            break;
          }
        } else if (depNode.status !== "SUCCESS") {
          allSucceeded = false;
        }
      }

      if (hasTerminalFailure) {
        transitionTaskStatus(node, "BLOCKED");
        node.error = "Blocked due to dependency failure or block.";
      } else if (allSucceeded) {
        transitionTaskStatus(node, "READY");
      }
    }
  }

  // Active execution loop
  const runningPromises = new Map<string, Promise<void>>();

  async function executeSingleNode(node: TaskGraphNode): Promise<void> {
    if (node.status !== "RUNNING") {
      transitionTaskStatus(node, "RUNNING");
    }
    node.startedAt = new Date().toISOString();
    node.revisionCount = node.revisionCount || 0;
    node.maxRevisionCycles = node.maxRevisionCycles ?? 2;
    node.evaluationHistory = node.evaluationHistory || [];

    const taskStartTime = Date.now();

    const trace: TaskExecutionTrace = {
      graphId: graph.graphId,
      taskId: node.taskId,
      agentRole: node.assignedAgentRole,
      agentName: node.assignedAgentName,
      startTime: node.startedAt,
      status: "RUNNING",
      retryCount: node.retryCount,
      revisionCycle: node.revisionCount,
    };

    try {
      let currentObjective = node.description;
      let executionSuccess = false;

      while (!executionSuccess) {
        // Adapt TaskGraphNode to JarvisTaskNode for dispatcher
        const taskAdapter: JarvisTaskNode = {
          taskId: node.taskId,
          objective: currentObjective,
          description: currentObjective,
          requiredCapabilities: node.requiredCapabilities,
          assignedAgentRole: node.assignedAgentRole,
          assignedAgentName: node.assignedAgentName,
          expectedOutput: node.expectedOutputs || "",
          constraints: node.constraints,
          risk: "low",
          status: "running",
        };

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Task timed out after ${node.timeoutMs}ms`)),
            node.timeoutMs,
          );
        });

        const response = await Promise.race([
          dispatchToAgent(taskAdapter, context, callModelFn),
          timeoutPromise,
        ]);

        node.completedAt = new Date().toISOString();
        node.result = response.result;
        node.confidence = response.confidence;

        // Perform Evaluation & Critic Gate
        const evalRes = evaluateTaskResult(node, response.result, context);
        node.latestEvaluation = evalRes;
        node.evaluationHistory.push(evalRes);

        trace.evaluator = evalRes.evaluator;
        trace.verdict = evalRes.verdict;
        trace.failureReasons = evalRes.failureReasons;
        trace.evaluationResult = evalRes;

        if (evalRes.verdict === "PASS") {
          transitionTaskStatus(node, "SUCCESS");
          executionSuccess = true;
        } else if (evalRes.verdict === "PARTIAL") {
          transitionTaskStatus(node, "PARTIAL");
          executionSuccess = true;
        } else if (evalRes.verdict === "REVISE") {
          if (node.revisionCount < node.maxRevisionCycles) {
            node.revisionCount += 1;
            trace.revisionCycle = node.revisionCount;
            // Build self-correction feedback prompt
            currentObjective = `[REVISION CYCLE ${node.revisionCount} / ${node.maxRevisionCycles}]
Original Task: ${node.description}
Evaluation Failure Reasons: ${evalRes.failureReasons.join("; ")}
Required Corrections: ${evalRes.requiredCorrections.join("; ")}
Please revise and improve your output to strictly address these corrections.`;
          } else {
            // Exceeded max revision cycles -> ESCALATE / FAIL
            evalRes.verdict = "ESCALATE";
            trace.verdict = "ESCALATE";
            node.error = `Exceeded maximum revision cycles (${node.maxRevisionCycles}). Escalating task failure: ${evalRes.failureReasons.join("; ")}`;
            transitionTaskStatus(node, "FAILED");
            executionSuccess = true;
          }
        } else {
          // FAIL or ESCALATE
          const isMaxRev = node.revisionCount >= node.maxRevisionCycles;
          node.error = isMaxRev
            ? `Exceeded maximum revision cycles (${node.maxRevisionCycles}). Escalating task failure: ${evalRes.failureReasons.join("; ")}`
            : evalRes.failureReasons.join("; ") || "Task failed evaluation";
          transitionTaskStatus(node, "FAILED");
          executionSuccess = true;
        }
      }
    } catch (err: any) {
      const isTimeout = err.message?.includes("timed out");
      const errMessage = err.message || "Execution error";
      node.error = errMessage;

      if (node.retryCount < node.maxRetries) {
        node.retryCount += 1;
        // Reset to READY for retry
        transitionTaskStatus(node, isTimeout ? "TIMEOUT" : "FAILED");
        transitionTaskStatus(node, "READY");
      } else {
        node.completedAt = new Date().toISOString();
        transitionTaskStatus(node, isTimeout ? "TIMEOUT" : "FAILED");
      }
    } finally {
      const latencyMs = Date.now() - taskStartTime;
      trace.endTime = node.completedAt || new Date().toISOString();
      trace.status = node.status;
      trace.latencyMs = latencyMs;
      trace.confidence = node.confidence;
      trace.error = node.error;
      trace.retryCount = node.retryCount;
      traces.push(trace);
    }
  }

  // Main Loop
  while (true) {
    updatePendingNodesStatus();

    const readyNodes = graph.nodes.filter((n) => n.status === "READY");
    const runningCount = runningPromises.size;

    if (readyNodes.length === 0 && runningCount === 0) {
      break; // No ready work left and nothing running
    }

    // Dispatch available ready tasks up to concurrency capacity
    const availableSlots = maxConcurrency - runningCount;
    if (availableSlots > 0 && readyNodes.length > 0) {
      const nodesToDispatch = readyNodes.slice(0, availableSlots);
      for (const node of nodesToDispatch) {
        // Prevent re-dispatching same node
        node.status = "RUNNING";
        const promise = executeSingleNode(node).finally(() => {
          runningPromises.delete(node.taskId);
        });
        runningPromises.set(node.taskId, promise);
      }
    }

    if (runningPromises.size > 0) {
      // Wait for at least one running task to complete before next loop iteration
      await Promise.race(Array.from(runningPromises.values()));
    }
  }

  // Final evaluation of remaining pending tasks after loop completion
  updatePendingNodesStatus();

  // Final graph status determination
  let succeededNodeCount = 0;
  let failedNodeCount = 0;
  let blockedNodeCount = 0;

  for (const node of graph.nodes) {
    if (node.status === "SUCCESS") succeededNodeCount++;
    else if (node.status === "FAILED" || node.status === "TIMEOUT") failedNodeCount++;
    else if (node.status === "BLOCKED") blockedNodeCount++;
  }

  if (failedNodeCount === 0 && blockedNodeCount === 0) {
    graph.status = "COMPLETED";
  } else if (succeededNodeCount > 0) {
    graph.status = "PARTIAL";
  } else {
    graph.status = "FAILED";
  }

  return {
    graph,
    traces,
    succeededNodeCount,
    failedNodeCount,
    blockedNodeCount,
    totalDurationMs: Date.now() - startTime,
  };
}
