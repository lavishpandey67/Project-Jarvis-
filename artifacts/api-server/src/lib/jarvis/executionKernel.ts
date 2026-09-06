import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  executionActionsTable,
  executionAttemptsTable,
  executionEvaluationsTable,
  executionEventsTable,
  executionGraphsTable,
  executionGraphNodesTable,
  executionJournalsTable,
  executionLessonsTable,
  executionObservationsTable,
  executionRecoveriesTable,
  executionStatesTable,
  executionToolExecutionsTable,
  toolExecutionTracesTable,
} from "@workspace/db";
import { CognitiveMemoryStore } from "./memory/store";
import type { JarvisExecutionResult } from "./index";

export type KernelState =
  | "PROPOSED"
  | "AUTHORIZED"
  | "EXECUTED"
  | "OBSERVED"
  | "EVALUATED"
  | "COMPLETED"
  | "FAILED"
  | "RECOVERING"
  | "ESCALATED";

const terminalStates = new Set<KernelState>(["COMPLETED", "FAILED", "ESCALATED"]);

const legalTransitions: Record<KernelState, KernelState[]> = {
  PROPOSED: ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["EXECUTED", "FAILED", "RECOVERING"],
  EXECUTED: ["OBSERVED", "FAILED", "RECOVERING"],
  OBSERVED: ["EVALUATED", "FAILED", "RECOVERING"],
  EVALUATED: ["COMPLETED", "FAILED", "RECOVERING", "ESCALATED"],
  COMPLETED: [],
  FAILED: ["RECOVERING"],
  RECOVERING: ["AUTHORIZED", "EXECUTED", "FAILED", "ESCALATED"],
  ESCALATED: [],
};

export interface ExecutionTrace {
  journal: Record<string, unknown> | null;
  graphs: Record<string, unknown>[];
  graph: Record<string, unknown>[];
  events: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  attempts: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  evaluations: Record<string, unknown>[];
  recoveries: Record<string, unknown>[];
  lessons: Record<string, unknown>[];
}

export interface ExecutionStartInput {
  executionId: string;
  requestId: string;
  conversationId?: number;
  objective: string;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parse(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function now(): Date {
  return new Date();
}

async function currentJournal(executionId: string) {
  const [row] = await db
    .select()
    .from(executionJournalsTable)
    .where(eq(executionJournalsTable.executionId, executionId))
    .limit(1);
  return row;
}

async function appendEvent(
  executionId: string,
  input: {
    kind: string;
    fromState?: KernelState | null;
    toState?: KernelState | null;
    nodeId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  const [last] = await db
    .select({ sequence: executionEventsTable.sequence })
    .from(executionEventsTable)
    .where(eq(executionEventsTable.executionId, executionId))
    .orderBy(desc(executionEventsTable.sequence))
    .limit(1);

  await db.insert(executionEventsTable).values({
    eventId: `${executionId}:event:${(last?.sequence ?? 0) + 1}`,
    executionId,
    sequence: (last?.sequence ?? 0) + 1,
    kind: input.kind,
    fromState: input.fromState ?? null,
    toState: input.toState ?? null,
    nodeId: input.nodeId ?? null,
    payload: input.payload === undefined ? null : json(input.payload),
  });
}

export async function startOrResumeExecution(input: ExecutionStartInput) {
  const existing = await currentJournal(input.executionId);
  if (!existing) {
    await db.insert(executionJournalsTable).values({
      executionId: input.executionId,
      requestId: input.requestId,
      conversationId: input.conversationId ?? null,
      objective: input.objective,
      state: "PROPOSED",
    });
    await db.insert(executionStatesTable).values({
      stateRecordId: `${input.executionId}:state:1`,
      executionId: input.executionId,
      state: "PROPOSED",
      isCurrent: 1,
    });
    await appendEvent(input.executionId, {
      kind: "EXECUTION_PROPOSED",
      toState: "PROPOSED",
      payload: { objective: input.objective },
    });
    return input.executionId;
  }

  if (terminalStates.has(existing.state as KernelState)) {
    return input.executionId;
  }

  await db
    .update(executionStatesTable)
    .set({ isCurrent: 0, exitedAt: now() })
    .where(
      and(
        eq(executionStatesTable.executionId, input.executionId),
        eq(executionStatesTable.isCurrent, 1),
      ),
    );
  await db.insert(executionStatesTable).values({
    stateRecordId: `${input.executionId}:state:resume:${Date.now()}`,
    executionId: input.executionId,
    state: "RECOVERING",
    isCurrent: 1,
  });
  await db
    .update(executionJournalsTable)
    .set({ resumeCount: (existing.resumeCount ?? 0) + 1, updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, input.executionId));
  await appendEvent(input.executionId, {
    kind: "EXECUTION_RESUMED",
    fromState: existing.state as KernelState,
    toState: "RECOVERING",
    payload: { resumeCount: (existing.resumeCount ?? 0) + 1 },
  });
  await db
    .update(executionJournalsTable)
    .set({ state: "RECOVERING", updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, input.executionId));
  return input.executionId;
}

export async function transitionExecution(
  executionId: string,
  target: KernelState,
  payload?: unknown,
): Promise<void> {
  const journal = await currentJournal(executionId);
  if (!journal) throw new Error(`Execution '${executionId}' was not found.`);
  const from = journal.state as KernelState;
  if (from === target) return;
  if (!legalTransitions[from]?.includes(target)) {
    throw new Error(`Illegal execution transition '${from}' -> '${target}'.`);
  }

  await db
    .update(executionStatesTable)
    .set({ isCurrent: 0, exitedAt: now() })
    .where(
      and(
        eq(executionStatesTable.executionId, executionId),
        eq(executionStatesTable.isCurrent, 1),
      ),
    );
  await db.insert(executionStatesTable).values({
    stateRecordId: `${executionId}:state:${Date.now()}:${target}`,
    executionId,
    state: target,
    isCurrent: 1,
  });
  await db
    .update(executionJournalsTable)
    .set({ state: target, updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, executionId));
  await appendEvent(executionId, {
    kind: "STATE_TRANSITION",
    fromState: from,
    toState: target,
    payload,
  });
}

export async function authorizeExecution(executionId: string): Promise<string> {
  const actionId = `${executionId}:authorize:${Date.now()}`;
  await db.insert(executionActionsTable).values({
    actionId,
    executionId,
    actionType: "ORCHESTRATION_AUTHORIZATION",
    status: "AUTHORIZED",
    authorizedBy: "jarvis-policy",
    authorizedAt: now(),
  });
  await transitionExecution(executionId, "AUTHORIZED", {
    actionId,
    authority: "deterministic-kernel",
  });
  return actionId;
}

export async function beginExecutionAttempt(executionId: string, nodeId?: string): Promise<string> {
  const [last] = await db
    .select({ attemptNumber: executionAttemptsTable.attemptNumber })
    .from(executionAttemptsTable)
    .where(eq(executionAttemptsTable.executionId, executionId))
    .orderBy(desc(executionAttemptsTable.attemptNumber))
    .limit(1);
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;
  const attemptId = `${executionId}:attempt:${attemptNumber}`;
  await db.insert(executionAttemptsTable).values({
    attemptId,
    executionId,
    nodeId: nodeId ?? null,
    attemptNumber,
    status: "RUNNING",
  });
  await appendEvent(executionId, {
    kind: "ATTEMPT_STARTED",
    nodeId,
    payload: { attemptId, attemptNumber },
  });
  return attemptId;
}

export async function completeExecutionAttempt(
  attemptId: string,
  status: "SUCCEEDED" | "FAILED",
  error?: string,
): Promise<void> {
  await db
    .update(executionAttemptsTable)
    .set({ status, endedAt: now(), error: error ?? null })
    .where(eq(executionAttemptsTable.attemptId, attemptId));
}

export async function persistExecutionGraph(
  executionId: string,
  result: JarvisExecutionResult,
): Promise<void> {
  const graph = result.taskGraph;
  if (!graph) return;

  await db
    .update(executionJournalsTable)
    .set({ graphId: graph.graphId, updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, executionId));
  await db
    .insert(executionGraphsTable)
    .values({
      graphId: graph.graphId,
      executionId,
      requestId: graph.requestId,
      objective: graph.objective,
      status: graph.status,
    })
    .onConflictDoUpdate({
      target: executionGraphsTable.graphId,
      set: { status: graph.status, updatedAt: now() },
    });

  for (const node of graph.nodes) {
    await db
      .insert(executionGraphNodesTable)
      .values({
        nodeRecordId: `${executionId}:${node.taskId}`,
        executionId,
        graphId: graph.graphId,
        nodeId: node.taskId,
        state: node.status,
        assignedAgentRole: node.assignedAgentRole,
        assignedAgentName: node.assignedAgentName,
        dependencies: json(node.dependencies),
        input: json({
          description: node.description,
          constraints: node.constraints,
          inputs: node.inputs ?? {},
        }),
        output: node.result ? json({ result: node.result }) : null,
        error: node.error ?? null,
        retryCount: node.retryCount,
        maxRetries: node.maxRetries,
      })
      .onConflictDoUpdate({
        target: executionGraphNodesTable.nodeRecordId,
        set: {
          state: node.status,
          output: node.result ? json({ result: node.result }) : null,
          error: node.error ?? null,
          retryCount: node.retryCount,
          updatedAt: now(),
        },
      });

    await db
      .update(executionJournalsTable)
      .set({ currentNodeId: node.taskId, updatedAt: now() })
      .where(eq(executionJournalsTable.executionId, executionId));

    await appendEvent(executionId, {
      kind: "GRAPH_NODE_RECORDED",
      nodeId: node.taskId,
      payload: {
        state: node.status,
        retryCount: node.retryCount,
        error: node.error,
      },
    });
  }
}

export async function recordObservation(
  executionId: string,
  input: {
    source: string;
    nodeId?: string;
    actionId?: string;
    success: boolean;
    data: unknown;
  },
): Promise<string> {
  const observationId = `${executionId}:observation:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(executionObservationsTable).values({
    observationId,
    executionId,
    actionId: input.actionId ?? null,
    nodeId: input.nodeId ?? null,
    source: input.source,
    success: input.success ? 1 : 0,
    data: json(input.data),
  });
  await appendEvent(executionId, {
    kind: "OBSERVATION_RECORDED",
    nodeId: input.nodeId,
    payload: { observationId, source: input.source, success: input.success },
  });
  return observationId;
}

export async function recordEvaluation(
  executionId: string,
  input: {
    nodeId?: string;
    verdict: string;
    score?: number;
    reasons?: string[];
    evidence?: unknown;
  },
): Promise<string> {
  const evaluationId = `${executionId}:evaluation:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(executionEvaluationsTable).values({
    evaluationId,
    executionId,
    nodeId: input.nodeId ?? null,
    verdict: input.verdict,
    score: input.score === undefined ? null : String(input.score),
    reasons: json(input.reasons ?? []),
    evidence: json(input.evidence ?? null),
  });
  await appendEvent(executionId, {
    kind: "EVALUATION_RECORDED",
    nodeId: input.nodeId,
    payload: { evaluationId, verdict: input.verdict, score: input.score },
  });
  return evaluationId;
}

export async function recordRecovery(
  executionId: string,
  input: {
    nodeId?: string;
    attemptNumber: number;
    classification: string;
    action: string;
    status: string;
    observationId?: string;
  },
): Promise<string> {
  const recoveryId = `${executionId}:recovery:${input.attemptNumber}:${Date.now()}`;
  await db.insert(executionRecoveriesTable).values({
    recoveryId,
    executionId,
    nodeId: input.nodeId ?? null,
    attemptNumber: input.attemptNumber,
    classification: input.classification,
    action: input.action,
    status: input.status,
    observationId: input.observationId ?? null,
  });
  await appendEvent(executionId, {
    kind: "RECOVERY_RECORDED",
    nodeId: input.nodeId,
    payload: { recoveryId, classification: input.classification, status: input.status },
  });
  return recoveryId;
}

async function persistToolEvidence(executionId: string, taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const traces = await db
    .select()
    .from(toolExecutionTracesTable)
    .where(inArray(toolExecutionTracesTable.taskId, taskIds));

  for (const trace of traces) {
    const actionId = `${executionId}:tool:${trace.id}`;
    await db
      .insert(executionActionsTable)
      .values({
        actionId,
        executionId,
        nodeId: trace.taskId,
        actionType: trace.toolId,
        status: trace.success ? "EXECUTED" : "FAILED",
        input: trace.input,
        executedAt: trace.createdAt,
      })
      .onConflictDoNothing();
    await db
      .insert(executionToolExecutionsTable)
      .values({
        toolExecutionId: `${executionId}:tool-execution:${trace.id}`,
        executionId,
        actionId,
        nodeId: trace.taskId,
        toolId: trace.toolId,
        toolName: trace.toolName,
        input: trace.input,
        output: trace.output,
        success: trace.success ? 1 : 0,
        error: trace.error,
        executionTimeMs: trace.executionTimeMs,
        endedAt: trace.createdAt,
      })
      .onConflictDoNothing();
    await recordObservation(executionId, {
      source: `tool:${trace.toolName}`,
      nodeId: trace.taskId ?? undefined,
      actionId,
      success: Boolean(trace.success),
      data: {
        output: parse(trace.output),
        error: trace.error,
        executionTimeMs: trace.executionTimeMs,
        permissionClass: trace.permissionClass,
        riskLevel: trace.riskLevel,
      },
    });
  }
}

export async function recordLesson(
  executionId: string,
  input: { objective: string; content: string; retrievalKey?: string },
): Promise<string> {
  const lessonId = `${executionId}:lesson`;
  const retrievalKey = input.retrievalKey ?? input.objective.toLowerCase().slice(0, 160);
  await db
    .insert(executionLessonsTable)
    .values({
      lessonId,
      executionId,
      title: `Execution lesson: ${input.objective.slice(0, 100)}`,
      content: input.content,
      retrievalKey,
    })
    .onConflictDoUpdate({
      target: executionLessonsTable.lessonId,
      set: { content: input.content, retrievalKey },
    });

  await CognitiveMemoryStore.getInstance().addMemory({
    id: lessonId,
    memoryType: "LESSON",
    title: `Execution lesson: ${input.objective.slice(0, 100)}`,
    content: input.content,
    source: "DAG_RUNNER",
    confidence: 1,
    importance: 4,
    validity: "FACT",
    metadata: { executionId, retrievalKey },
  });
  await appendEvent(executionId, { kind: "LESSON_RECORDED", payload: { lessonId, retrievalKey } });
  return lessonId;
}

export async function finalizeExecution(
  executionId: string,
  result: JarvisExecutionResult,
): Promise<ExecutionTrace> {
  await persistExecutionGraph(executionId, result);
  const graph = result.taskGraph;
  const traces = result.dagResult?.traces ?? [];
  const taskIds = traces.map((trace) => trace.taskId);
  await persistToolEvidence(executionId, taskIds);

  for (const trace of traces) {
    const observationId = await recordObservation(executionId, {
      source: `dag:${trace.taskId}`,
      nodeId: trace.taskId,
      success: trace.status === "SUCCESS",
      data: trace,
    });
    if (trace.evaluationResult) {
      await recordEvaluation(executionId, {
        nodeId: trace.taskId,
        verdict: trace.evaluationResult.verdict,
        score: trace.evaluationResult.overallScore,
        reasons: trace.evaluationResult.failureReasons,
        evidence: trace.evaluationResult,
      });
    }
    if (trace.retryCount > 0 || trace.status === "FAILED" || trace.status === "TIMEOUT") {
      await recordRecovery(executionId, {
        nodeId: trace.taskId,
        attemptNumber: trace.retryCount,
        classification: trace.error ? "EXECUTION_FAILURE" : "EVALUATION_REVISION",
        action: "Bounded retry/re-evaluation through the existing DAG runner",
        status: trace.status === "SUCCESS" ? "SUCCEEDED" : "RECORDED",
        observationId,
      });
    }
  }

  const graphEvaluation = result.graphEvaluation;
  await recordEvaluation(executionId, {
    verdict: graphEvaluation?.overallVerdict ?? "PASS",
    score: graphEvaluation?.overallScore ?? 1,
    reasons: graphEvaluation?.unresolvedRisks ?? [],
    evidence: graphEvaluation ?? { directResponse: true },
  });

  await transitionExecution(executionId, "OBSERVED", {
    graphId: graph?.graphId,
    nodeCount: graph?.nodes.length ?? 0,
  });
  await transitionExecution(executionId, "EVALUATED", {
    verdict: graphEvaluation?.overallVerdict ?? "PASS",
  });

  const passed = !graphEvaluation || graphEvaluation.objectiveSatisfied;
  if (!passed) {
    await transitionExecution(executionId, "RECOVERING", {
      unresolvedRisks: graphEvaluation?.unresolvedRisks ?? [],
    });
    await transitionExecution(executionId, "ESCALATED", {
      reason: "Existing DAG/evaluator reported unresolved execution risk.",
    });
  } else {
    await transitionExecution(executionId, "COMPLETED", {
      evidence: "DAG and evaluator completed without unresolved risks.",
    });
  }

  if (passed) {
    await recordLesson(executionId, {
      objective: result.intent.objective,
      content: `Objective completed with persisted graph, observation, and evaluation evidence. Final synthesis: ${result.synthesis.finalAnswer}`,
    });
  }

  await db
    .update(executionJournalsTable)
    .set({ finalOutput: result.synthesis.finalAnswer, updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, executionId));

  return getExecutionTrace(executionId);
}

export async function failExecution(executionId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await recordObservation(executionId, {
    source: "kernel",
    success: false,
    data: { error: message },
  });
  const journal = await currentJournal(executionId);
  if (journal && !terminalStates.has(journal.state as KernelState)) {
    await transitionExecution(executionId, "FAILED", { error: message });
  }
  await db
    .update(executionJournalsTable)
    .set({ failure: message, updatedAt: now() })
    .where(eq(executionJournalsTable.executionId, executionId));
}

export async function getExecutionTrace(executionId: string): Promise<ExecutionTrace> {
  const [journal] = await db
    .select()
    .from(executionJournalsTable)
    .where(eq(executionJournalsTable.executionId, executionId))
    .limit(1);
  const [graphs, graph, events, actions, attempts, observations, evaluations, recoveries, lessons] =
    await Promise.all([
      db.select().from(executionGraphsTable).where(eq(executionGraphsTable.executionId, executionId)),
      db.select().from(executionGraphNodesTable).where(eq(executionGraphNodesTable.executionId, executionId)),
      db.select().from(executionEventsTable).where(eq(executionEventsTable.executionId, executionId)).orderBy(executionEventsTable.sequence),
      db.select().from(executionActionsTable).where(eq(executionActionsTable.executionId, executionId)),
      db.select().from(executionAttemptsTable).where(eq(executionAttemptsTable.executionId, executionId)),
      db.select().from(executionObservationsTable).where(eq(executionObservationsTable.executionId, executionId)),
      db.select().from(executionEvaluationsTable).where(eq(executionEvaluationsTable.executionId, executionId)),
      db.select().from(executionRecoveriesTable).where(eq(executionRecoveriesTable.executionId, executionId)),
      db.select().from(executionLessonsTable).where(eq(executionLessonsTable.executionId, executionId)),
    ]);

  return {
    journal: journal
      ? { ...journal, finalOutput: journal.finalOutput, state: journal.state }
      : null,
    graphs: graphs.map((row: any) => ({ ...row })),
    graph: graph.map((row: any) => ({ ...row, dependencies: parse(row.dependencies), input: parse(row.input), output: parse(row.output) })),
    events: events.map((row: any) => ({ ...row, payload: parse(row.payload) })),
    actions: actions.map((row: any) => ({ ...row, input: parse(row.input) })),
    attempts: attempts.map((row: any) => ({ ...row })),
    observations: observations.map((row: any) => ({ ...row, data: parse(row.data) })),
    evaluations: evaluations.map((row: any) => ({ ...row, reasons: parse(row.reasons), evidence: parse(row.evidence) })),
    recoveries: recoveries.map((row: any) => ({ ...row })),
    lessons: lessons.map((row: any) => ({ ...row })),
  };
}

export async function listRelevantLessons(objective: string, limit = 5) {
  const key = objective.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  const rows = await db.select().from(executionLessonsTable).orderBy(desc(executionLessonsTable.createdAt)).limit(50);
  return rows
    .filter((row: any) => key.some((term) => row.retrievalKey.toLowerCase().includes(term) || row.content.toLowerCase().includes(term)))
    .slice(0, limit);
}