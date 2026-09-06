import { dispatchToAgent } from "../agentDispatcher";
import { evaluateTaskResult } from "../eval/evaluator";
import { EvaluationResult, EvaluationVerdict } from "../eval/types";
import { ModelCaller } from "../intentAnalyzer";
import { CognitiveMemoryStore } from "../memory/store";
import { adaptGeneralistRole, getAgentByRole } from "../registry";
import { globalRecoveryController } from "../recoveryController";
import { globalBudgetController } from "../budgetController";
import { globalApprovalGuard } from "../approvalGuard";
import { globalToolRegistry } from "../tools/registry";
import { ToolPermissionClass } from "../memory/types";
import { JarvisTaskNode, ScopedContext, StructuredAgentResponse } from "../types";
import {
  DAGExecutionResult,
  TaskExecutionTrace,
  TaskGraph,
  TaskGraphNode,
  TaskStatus,
  KernelLifecycleStage,
  StructuredObservation,
  NodeTransitionRecord,
} from "./types";
import { validateTaskGraph } from "./validator";

export const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["READY", "BLOCKED", "CANCELLED"],
  READY: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCESS", "FAILED", "PARTIAL", "TIMEOUT", "CANCELLED", "READY"],
  SUCCESS: [],
  FAILED: ["READY", "FAILED"], // READY if retrying
  PARTIAL: [],
  BLOCKED: [],
  CANCELLED: [],
  TIMEOUT: ["READY", "TIMEOUT"], // READY if retrying
};

export const LEGAL_STAGE_TRANSITIONS: Record<KernelLifecycleStage, KernelLifecycleStage[]> = {
  OBJECTIVE: ["UNDERSTAND", "PLAN", "FAILED"],
  UNDERSTAND: ["PLAN", "FAILED"],
  PLAN: ["AUTHORIZE", "FAILED"],
  AUTHORIZE: ["EXECUTE", "FAILED"],
  EXECUTE: ["OBSERVE", "FAILED"],
  OBSERVE: ["EVALUATE", "FAILED"],
  EVALUATE: ["COMPLETE", "RECOVER", "FAILED"],
  RECOVER: ["EXECUTE", "PLAN", "COMPLETE", "FAILED"],
  COMPLETE: [],
  FAILED: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionStage(from?: KernelLifecycleStage, to?: KernelLifecycleStage): boolean {
  if (!from || !to || from === to) return true;
  return (LEGAL_STAGE_TRANSITIONS[from] as any)?.includes(to) ?? true;
}

export function transitionNode(
  node: TaskGraphNode,
  targetStatus: TaskStatus,
  targetStage: KernelLifecycleStage,
  reason?: string,
): void {
  if (!canTransition(node.status, targetStatus)) {
    throw new Error(
      `Illegal status transition for task '${node.taskId}': '${node.status}' -> '${targetStatus}'`,
    );
  }
  const fromStatus = node.status;
  const fromStage = node.stage;
  node.status = targetStatus;
  node.stage = targetStage;
  node.transitionHistory = node.transitionHistory || [];
  node.transitionHistory.push({
    fromStatus,
    toStatus: targetStatus,
    fromStage,
    toStage: targetStage,
    timestamp: new Date().toISOString(),
    reason,
  });
}

export function transitionTaskStatus(
  node: TaskGraphNode,
  targetStatus: TaskStatus,
): void {
  const defaultStage: KernelLifecycleStage =
    targetStatus === "SUCCESS" || targetStatus === "PARTIAL"
      ? "COMPLETE"
      : targetStatus === "FAILED" || targetStatus === "TIMEOUT"
      ? "FAILED"
      : targetStatus === "RUNNING"
      ? "EXECUTE"
      : targetStatus === "READY"
      ? "PLAN"
      : "PLAN";

  transitionNode(node, targetStatus, node.stage || defaultStage);
}

function extractTargetFilesFromNode(node: TaskGraphNode): string[] {
  const files: string[] = [];
  if (node.inputs?.filePath) files.push(String(node.inputs.filePath));
  if (node.inputs?.sourceFile) files.push(String(node.inputs.sourceFile));
  if (node.inputs?.targetPath) files.push(String(node.inputs.targetPath));
  const text = `${node.description || ""} ${node.expectedOutputs || ""}`;
  const match = text.match(/(?:file|path|in|to)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i);
  if (match && match[1] && !match[1].startsWith("http")) {
    files.push(match[1]);
  }
  return Array.from(new Set(files));
}

function getPermissionsForRole(role: string): ToolPermissionClass[] {
  const agent = getAgentByRole(role);
  if (agent && agent.permissions) {
    return agent.permissions as ToolPermissionClass[];
  }
  if (role === "builder" || role === "executor" || role === "generalist_a" || role === "generalist_b") {
    return ["READ", "WRITE", "EXECUTE"];
  }
  if (role === "strategy") {
    return ["READ", "WRITE"];
  }
  return ["READ"];
}

export interface DAGRunnerOptions {
  maxConcurrency?: number;
  callModelFn?: ModelCaller;
  customDispatcher?: (
    task: JarvisTaskNode,
    context: ScopedContext,
    callModelFn?: ModelCaller,
  ) => Promise<Partial<StructuredAgentResponse>>;
  customEvaluator?: (
    node: TaskGraphNode,
    result: string,
    context: ScopedContext,
    observations?: StructuredObservation[],
  ) => Partial<EvaluationResult> & { verdict: EvaluationVerdict };
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

  // Stage 1: OBJECTIVE
  graph.stage = "OBJECTIVE";
  graph.transitionHistory = graph.transitionHistory || [];
  graph.transitionHistory.push({
    stage: "OBJECTIVE",
    status: graph.status,
    timestamp: new Date().toISOString(),
    reason: `Objective initialized: ${graph.objective}`,
  });

  // Stage 2: UNDERSTAND
  graph.stage = "UNDERSTAND";
  graph.transitionHistory.push({
    stage: "UNDERSTAND",
    status: graph.status,
    timestamp: new Date().toISOString(),
    reason: "Scoped context and workforce capability requirements verified",
  });

  // Stage 3: PLAN & Validate Graph
  graph.stage = "PLAN";
  graph.transitionHistory.push({
    stage: "PLAN",
    status: graph.status,
    timestamp: new Date().toISOString(),
    reason: "Validating TaskGraph acyclic topology and constraints",
  });

  const validation = validateTaskGraph(graph);
  if (!validation.valid) {
    graph.status = "FAILED";
    graph.stage = "FAILED";
    graph.transitionHistory.push({
      stage: "FAILED",
      status: "FAILED",
      timestamp: new Date().toISOString(),
      reason: `TaskGraph validation failed: ${validation.errors.join("; ")}`,
    });
    throw new Error(
      `TaskGraph validation failed for graph '${graph.graphId}': ${validation.errors.join("; ")}`,
    );
  }

  graph.status = "RUNNING";
  graph.stage = "EXECUTE";
  const nodeMap = new Map<string, TaskGraphNode>();
  for (const node of graph.nodes) {
    node.observations = node.observations || [];
    node.transitionHistory = node.transitionHistory || [];
    node.stage = node.stage || "PLAN";
    nodeMap.set(node.taskId, node);
  }

  // Helper to evaluate dependencies for PENDING tasks
  function updatePendingNodesStatus(): void {
    for (const node of graph.nodes) {
      if (node.status !== "PENDING") continue;

      if (node.dependencies.length === 0) {
        transitionNode(node, "READY", "PLAN", "No dependencies required");
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
        transitionNode(node, "BLOCKED", "FAILED", "Blocked due to dependency failure or block");
        node.error = "Blocked due to dependency failure or block.";
      } else if (allSucceeded) {
        transitionNode(node, "READY", "PLAN", "All dependencies completed successfully");
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
      stage: "AUTHORIZE",
      retryCount: node.retryCount,
      revisionCycle: node.revisionCount,
    };

    try {
      // Stage 4: AUTHORIZE
      transitionNode(node, "RUNNING", "AUTHORIZE", "Evaluating execution budget and permission boundaries");

      // 1. Budget Controller Guard Check
      const budgetCheck = globalBudgetController.checkBudget(graph.graphId, { taskNodesCount: 1 });
      if (!budgetCheck.allowed) {
        node.error = budgetCheck.breachedLimit || "Execution budget exhausted";
        node.authorizationVerdict = {
          approved: false,
          status: "REJECTED",
          reason: node.error,
        };
        transitionNode(node, "FAILED", "FAILED", node.error);
        return;
      }

      // 2. Human Approval Guard Check
      const approvalVerdict = globalApprovalGuard.evaluateOperation({
        taskId: node.taskId,
        agentId: node.assignedAgentName,
        agentRole: node.assignedAgentRole,
        operationName: `Task execution: ${node.description}`,
        permissionClass: (node.risk === "critical" || node.risk === "high") ? "DESTRUCTIVE" : "READ",
        riskLevel: (node.risk || "low").toUpperCase() as any,
        targetResource: node.taskId,
        description: node.description,
        userApprovalGranted: false,
      });

      node.authorizationVerdict = {
        approved: approvalVerdict.approved,
        status: approvalVerdict.status,
        reason: approvalVerdict.reason,
      };

      if (!approvalVerdict.approved && approvalVerdict.status === "ESCALATE") {
        node.error = approvalVerdict.reason;
        transitionNode(node, "FAILED", "FAILED", approvalVerdict.reason);
        return;
      }

      let currentObjective = node.description;
      let executionSuccess = false;

      while (!executionSuccess) {
        // Stage 5: EXECUTE
        transitionNode(node, "RUNNING", "EXECUTE", `Commencing execution cycle ${node.revisionCount}`);
        const executionAttemptStartTime = Date.now();

        // Transactional Pre-Modification File Snapshots
        const targetFiles = extractTargetFilesFromNode(node);
        if (node.inputs?.filePath) targetFiles.push(String(node.inputs.filePath));
        if (node.inputs?.sourceFile) targetFiles.push(String(node.inputs.sourceFile));
        if (node.inputs?.targetPath) targetFiles.push(String(node.inputs.targetPath));
        if (node.inputs?.args?.filePath) targetFiles.push(String(node.inputs.args.filePath));
        if (node.inputs?.args?.sourceFile) targetFiles.push(String(node.inputs.args.sourceFile));
        if (node.inputs?.args?.targetPath) targetFiles.push(String(node.inputs.args.targetPath));

        const uniqueTargetFiles = Array.from(new Set(targetFiles));
        if (uniqueTargetFiles.length > 0) {
          try {
            globalRecoveryController.createPreModificationSnapshot(node.taskId, uniqueTargetFiles);
          } catch (_e) {
            // Snapshot may fail if file doesn't exist yet
          }
        }

        let rawResponse: Partial<StructuredAgentResponse>;

        // Check if node has direct tool invocation specified
        if (node.inputs && typeof node.inputs.tool === "string") {
          const toolId = node.inputs.tool;
          const toolArgs = node.inputs.args || node.inputs;
          const toolExec = await globalToolRegistry.executeTool(
            toolId,
            toolArgs,
            {
              permissions: getPermissionsForRole(node.assignedAgentRole),
              agentRole: node.assignedAgentRole,
              taskId: node.taskId,
              isSandboxed: true,
            },
          );

          const toolObs: StructuredObservation = toolExec.observation || {
            action: toolId,
            tool: toolId,
            inputs: toolArgs,
            target: toolArgs.filePath || toolArgs.targetPath || toolArgs.testCommand,
            success: toolExec.success,
            status: toolExec.success ? "SUCCESS" : "FAILED",
            exitCode: toolExec.output?.exitCode ?? (toolExec.success ? 0 : 1),
            stdout: toolExec.output?.stdout || (typeof toolExec.output === "string" ? toolExec.output : ""),
            stderr: toolExec.output?.stderr || toolExec.error || "",
            before: toolExec.output?.bytesBefore !== undefined ? {
              sizeBytes: toolExec.output.bytesBefore,
              hash: toolExec.output.hashBefore,
            } : undefined,
            after: toolExec.output?.bytesAfter !== undefined ? {
              sizeBytes: toolExec.output.bytesAfter,
              hash: toolExec.output.hashAfter,
            } : undefined,
            error: toolExec.error,
            timestamp: new Date().toISOString(),
            durationMs: toolExec.executionTimeMs,
          };

          rawResponse = {
            taskId: node.taskId,
            agentRole: node.assignedAgentRole,
            agentName: node.assignedAgentName,
            result: toolExec.success
              ? (typeof toolExec.output === "string"
                  ? toolExec.output
                  : `[Tool Execution: ${toolId} PASS] Output: ${JSON.stringify(toolExec.output ?? { success: true })}${toolArgs.content ? `\nCode Content:\n${String(toolArgs.content).slice(0, 1000)}` : ""}`)
              : `Tool ${toolId} execution failed: ${toolExec.error || "Unknown error"}`,
            confidence: toolExec.success ? 1.0 : 0.2,
            observation: toolObs,
            observations: [toolObs],
            errors: toolExec.error ? [toolExec.error] : [],
          };
        } else {
          // Adapt TaskGraphNode to JarvisTaskNode for dispatcher
          const taskAdapter: JarvisTaskNode = {
            taskId: node.taskId,
            objective: currentObjective,
            description: currentObjective,
            requiredCapabilities: node.requiredCapabilities || [],
            assignedAgentRole: node.assignedAgentRole,
            assignedAgentName: node.assignedAgentName,
            expectedOutput: node.expectedOutputs || "",
            constraints: node.constraints || [],
            risk: "low",
            status: "running",
          };

          let timeoutTimer: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(
              () => reject(new Error(`Task timed out after ${node.timeoutMs}ms`)),
              node.timeoutMs,
            );
            if (timeoutTimer.unref) {
              timeoutTimer.unref();
            }
          });

          const dispatcher = options.customDispatcher ?? dispatchToAgent;
          try {
            rawResponse = await Promise.race([
              dispatcher(taskAdapter, context, callModelFn),
              timeoutPromise,
            ]);
          } finally {
            if (timeoutTimer) {
              clearTimeout(timeoutTimer);
            }
          }
        }

        const response: StructuredAgentResponse = {
          taskId: node.taskId,
          agentRole: node.assignedAgentRole,
          agentName: node.assignedAgentName,
          status: rawResponse.status || "success",
          result: rawResponse.result || "",
          confidence: rawResponse.confidence ?? 1,
          warnings: rawResponse.warnings || [],
          errors: rawResponse.errors || [],
          evidence: rawResponse.evidence || [],
          ...rawResponse,
        };

        // Stage 6: OBSERVE
        transitionNode(node, "RUNNING", "OBSERVE", "Gathering structured execution observations");
        node.observations = node.observations || [];

        if (response.observations && Array.isArray(response.observations)) {
          for (const obs of response.observations) {
            node.observations.push(obs);
          }
        } else if (response.observation) {
          node.observations.push(response.observation);
        } else {
          node.observations.push({
            action: `dispatch_${node.assignedAgentRole}`,
            tool: undefined,
            inputs: node.inputs,
            success: response.status === "success" && (!response.errors || response.errors.length === 0),
            status: response.status === "success" ? "SUCCESS" : "FAILED",
            stdout: typeof response.result === "string" ? response.result.slice(0, 1000) : "",
            stderr: response.errors?.join("; ") || "",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - executionAttemptStartTime,
          });
        }

        node.completedAt = new Date().toISOString();
        node.result = response.result;
        node.confidence = response.confidence;

        // Stage 7: EVALUATE
        transitionNode(node, "RUNNING", "EVALUATE", "Evaluating node execution results and observations against criteria");

        const evaluator = options.customEvaluator ?? evaluateTaskResult;
        const rawEval = evaluator(node, response.result, context, node.observations);
        const evalRes: EvaluationResult = {
          taskId: node.taskId,
          evaluator: rawEval.evaluator || "critic",
          schemaScore: rawEval.schemaScore ?? 1,
          goalScore: rawEval.goalScore ?? (rawEval.verdict === "PASS" ? 1 : 0),
          constraintScore: rawEval.constraintScore ?? 1,
          groundingScore: rawEval.groundingScore ?? 1,
          criticScore: rawEval.criticScore ?? 1,
          confidenceScore: rawEval.confidenceScore ?? 1,
          overallScore: rawEval.overallScore ?? (rawEval.verdict === "PASS" ? 1 : 0.1),
          verdict: rawEval.verdict,
          failureReasons: rawEval.failureReasons || [],
          requiredCorrections: rawEval.requiredCorrections || [],
          evaluatedAt: rawEval.evaluatedAt || new Date().toISOString(),
        };
        node.latestEvaluation = evalRes;
        node.evaluationHistory.push(evalRes);

        trace.evaluator = evalRes.evaluator;
        trace.verdict = evalRes.verdict;
        trace.failureReasons = evalRes.failureReasons;
        trace.evaluationResult = evalRes;

        // Stage 8: DECISION & RECOVERY
        if (evalRes.verdict === "PASS") {
          globalRecoveryController.clearSnapshots(node.taskId);
          transitionNode(node, "SUCCESS", "COMPLETE", "Evaluation passed successfully");
          executionSuccess = true;
        } else if (evalRes.verdict === "PARTIAL") {
          globalRecoveryController.clearSnapshots(node.taskId);
          transitionNode(node, "PARTIAL", "COMPLETE", "Evaluation accepted partial output");
          executionSuccess = true;
        } else if (evalRes.verdict === "REVISE") {
          transitionNode(node, "RUNNING", "RECOVER", `Evaluation requested revision: ${evalRes.failureReasons.join("; ")}`);

          // Record self-healing lesson memory
          try {
            const memoryStore = CognitiveMemoryStore.getInstance();
            await memoryStore.addMemory({
              id: `lesson_${node.taskId}_${Date.now()}`,
              memoryType: "LESSON",
              title: `Lesson Learned: ${node.assignedAgentName} Task Revision`,
              content: `Task '${node.taskId}' revision cycle ${node.revisionCount + 1}: ${evalRes.failureReasons.join("; ")}. Corrections: ${evalRes.requiredCorrections.join("; ")}`,
              source: "SYSTEM",
              confidence: 0.95,
              importance: 4,
            });
          } catch (_memErr) {
            // Ignored
          }

          if (node.revisionCount < node.maxRevisionCycles) {
            node.revisionCount += 1;
            trace.revisionCycle = node.revisionCount;

            // Optional repair hook for devLoop mechanics
            if (typeof node.inputs?.repairHook === "function") {
              try {
                await node.inputs.repairHook(node, evalRes, context);
              } catch (_repHookErr) {
                // Handled in next cycle
              }
            }

            // Build self-correction feedback prompt for next cycle
            currentObjective = `[REVISION CYCLE ${node.revisionCount} / ${node.maxRevisionCycles}]
Original Task: ${node.description}
Evaluation Failure Reasons: ${evalRes.failureReasons.join("; ")}
Required Corrections: ${evalRes.requiredCorrections.join("; ")}
Please revise and improve your output to strictly address these corrections.`;
          } else {
            // Exceeded max revision cycles -> ESCALATE / FAIL with transactional rollback
            evalRes.verdict = "ESCALATE";
            trace.verdict = "ESCALATE";
            node.error = `Exceeded maximum revision cycles (${node.maxRevisionCycles}). Escalating task failure: ${evalRes.failureReasons.join("; ")}`;
            const modifiedFiles = globalRecoveryController.getSnapshottedFiles(node.taskId);
            const rollbackRes = globalRecoveryController.rollbackTaskModifications(node.taskId);
            trace.targetFiles = modifiedFiles;
            transitionNode(node, "FAILED", "FAILED", node.error);
            executionSuccess = true;
          }
        } else {
          // FAIL or ESCALATE: Trigger Adaptive Recovery Controller & Transactional Rollback
          transitionNode(node, "FAILED", "RECOVER", `Evaluation failure / escalate: ${evalRes.failureReasons.join("; ")}`);
          const failureClass = globalRecoveryController.classifyFailure(evalRes.failureReasons.join("; "));
          const adaptiveAgent = failureClass === "PERMISSION_DENIED" || failureClass === "UNKNOWN" ? "agent_generalist_b" : "agent_generalist_a";
          const adaptiveRole = failureClass === "PERMISSION_DENIED" ? "SECURITY"
                             : failureClass === "TIMEOUT" ? "DEVOPS"
                             : failureClass === "SYNTAX_ERROR" || failureClass === "BUILD_FAILURE" || failureClass === "TEST_FAILURE" ? "DEBUGGER"
                             : "RECOVERY";

          adaptGeneralistRole(adaptiveAgent, adaptiveRole, { taskId: node.taskId });

          const modifiedFiles = globalRecoveryController.getSnapshottedFiles(node.taskId);
          const rollbackRes = globalRecoveryController.rollbackTaskModifications(node.taskId);

          globalRecoveryController.recordRecoveryTrace({
            attemptId: `rec_${node.taskId}_${Date.now()}`,
            taskId: node.taskId,
            assignedAgentId: adaptiveAgent,
            assignedRole: adaptiveRole,
            failureType: failureClass,
            hypothesis: `Failure classified as ${failureClass}. Assigned ${adaptiveAgent} in ${adaptiveRole} mode.`,
            proposedPatchAction: `Apply targeted patch for ${evalRes.failureReasons.join("; ")}`,
            targetFiles: modifiedFiles,
            verificationResult: "FAILED",
            rolledBack: rollbackRes.success,
            timestamp: new Date().toISOString(),
          });

          if (node.retryCount < node.maxRetries) {
            node.retryCount += 1;
            transitionNode(node, "READY", "PLAN", `Retrying node (${node.retryCount}/${node.maxRetries})`);
            return;
          } else {
            const isMaxRev = node.revisionCount >= node.maxRevisionCycles;
            node.error = isMaxRev
              ? `Exceeded maximum revision cycles (${node.maxRevisionCycles}). Escalating task failure: ${evalRes.failureReasons.join("; ")}`
              : evalRes.failureReasons.join("; ") || "Task failed evaluation";
            transitionNode(node, "FAILED", "FAILED", node.error);
            executionSuccess = true;
          }
        }
      }
    } catch (err: any) {
      const isTimeout = err.message?.includes("timed out");
      const errMessage = err.message || "Execution error";
      node.error = errMessage;
      transitionNode(node, isTimeout ? "TIMEOUT" : "FAILED", "RECOVER", `Exception during execution: ${errMessage}`);

      const failureClass = globalRecoveryController.classifyFailure(errMessage);
      const modifiedFiles = globalRecoveryController.getSnapshottedFiles(node.taskId);
      let rolledBack = false;

      if (node.retryCount < node.maxRetries) {
        node.retryCount += 1;
        transitionNode(node, "READY", "PLAN", `Retrying node after exception (${node.retryCount}/${node.maxRetries})`);
      } else {
        const rollbackRes = globalRecoveryController.rollbackTaskModifications(node.taskId);
        rolledBack = rollbackRes.success;
        node.completedAt = new Date().toISOString();
        transitionNode(node, isTimeout ? "TIMEOUT" : "FAILED", "FAILED", errMessage);
      }

      globalRecoveryController.recordRecoveryTrace({
        attemptId: `rec_err_${node.taskId}_${Date.now()}`,
        taskId: node.taskId,
        assignedAgentId: "agent_generalist_b",
        assignedRole: "RECOVERY",
        failureType: failureClass,
        hypothesis: `Unhandled exception: ${errMessage}`,
        proposedPatchAction: "Retry node execution within task retry budget",
        targetFiles: modifiedFiles,
        verificationResult: "FAILED",
        rolledBack,
        timestamp: new Date().toISOString(),
      });
    } finally {
      const latencyMs = Date.now() - taskStartTime;
      trace.endTime = node.completedAt || new Date().toISOString();
      trace.status = node.status;
      trace.stage = node.stage;
      trace.observations = [...(node.observations || [])];
      trace.transitionHistory = [...(node.transitionHistory || [])];
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

  // Final graph status and lifecycle stage determination
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
    graph.stage = "COMPLETE";
    graph.transitionHistory.push({
      stage: "COMPLETE",
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
      reason: "All graph tasks completed successfully",
    });
  } else if (succeededNodeCount > 0) {
    graph.status = "PARTIAL";
    graph.stage = "COMPLETE";
    graph.transitionHistory.push({
      stage: "COMPLETE",
      status: "PARTIAL",
      timestamp: new Date().toISOString(),
      reason: "Graph completed with partial node success",
    });
  } else {
    graph.status = "FAILED";
    graph.stage = "FAILED";
    graph.transitionHistory.push({
      stage: "FAILED",
      status: "FAILED",
      timestamp: new Date().toISOString(),
      reason: "Graph execution failed with no successful nodes",
    });
  }

  // Flatten all observations from all nodes for easy consumption
  const allObservations: StructuredObservation[] = [];
  for (const node of graph.nodes) {
    if (node.observations && node.observations.length > 0) {
      allObservations.push(...node.observations);
    }
  }

  return {
    graph,
    traces,
    observations: allObservations,
    succeededNodeCount,
    failedNodeCount,
    blockedNodeCount,
    totalDurationMs: Date.now() - startTime,
  };
}
