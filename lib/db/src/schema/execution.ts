import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const executionJournalsTable = pgTable("jarvis_execution_journals", {
  executionId: text("execution_id").primaryKey(),
  requestId: text("request_id").notNull(),
  conversationId: integer("conversation_id"),
  objective: text("objective").notNull(),
  state: text("state").notNull(),
  graphId: text("graph_id"),
  currentNodeId: text("current_node_id"),
  finalOutput: text("final_output"),
  failure: text("failure"),
  resumeCount: integer("resume_count").notNull().default(0),
  ...timestamps,
});

export const executionGraphsTable = pgTable("jarvis_execution_graphs", {
  graphId: text("graph_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  requestId: text("request_id").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const executionStatesTable = pgTable("jarvis_execution_states", {
  stateRecordId: text("state_record_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  state: text("state").notNull(),
  isCurrent: integer("is_current").notNull().default(1),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
});

export const executionGraphNodesTable = pgTable(
  "jarvis_execution_graph_nodes",
  {
    nodeRecordId: text("node_record_id").primaryKey(),
    executionId: text("execution_id").notNull(),
    graphId: text("graph_id").notNull(),
    nodeId: text("node_id").notNull(),
    state: text("state").notNull(),
    assignedAgentRole: text("assigned_agent_role"),
    assignedAgentName: text("assigned_agent_name"),
    dependencies: text("dependencies"),
    input: text("input"),
    output: text("output"),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    executionNodeUnique: uniqueIndex("jarvis_execution_graph_nodes_execution_node_idx").on(
      table.executionId,
      table.nodeId,
    ),
  }),
);

export const executionEventsTable = pgTable(
  "jarvis_execution_events",
  {
    eventId: text("event_id").primaryKey(),
    executionId: text("execution_id").notNull(),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    nodeId: text("node_id"),
    payload: text("payload"),
    ...timestamps,
  },
  (table) => ({
    executionSequenceUnique: uniqueIndex("jarvis_execution_events_execution_sequence_idx").on(
      table.executionId,
      table.sequence,
    ),
  }),
);

export const executionActionsTable = pgTable("jarvis_execution_actions", {
  actionId: text("action_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  nodeId: text("node_id"),
  actionType: text("action_type").notNull(),
  status: text("status").notNull(),
  input: text("input"),
  authorizedBy: text("authorized_by"),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  ...timestamps,
});

export const executionToolExecutionsTable = pgTable("jarvis_execution_tool_executions", {
  toolExecutionId: text("tool_execution_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  actionId: text("action_id"),
  nodeId: text("node_id"),
  toolId: text("tool_id").notNull(),
  toolName: text("tool_name").notNull(),
  input: text("input"),
  output: text("output"),
  success: integer("success").notNull().default(1),
  error: text("error"),
  executionTimeMs: integer("execution_time_ms").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const executionAttemptsTable = pgTable("jarvis_execution_attempts", {
  attemptId: text("attempt_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  nodeId: text("node_id"),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  error: text("error"),
});

export const executionObservationsTable = pgTable("jarvis_execution_observations", {
  observationId: text("observation_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  actionId: text("action_id"),
  nodeId: text("node_id"),
  source: text("source").notNull(),
  success: integer("success").notNull().default(1),
  data: text("data"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionEvaluationsTable = pgTable("jarvis_execution_evaluations", {
  evaluationId: text("evaluation_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  nodeId: text("node_id"),
  verdict: text("verdict").notNull(),
  score: text("score"),
  reasons: text("reasons"),
  evidence: text("evidence"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionRecoveriesTable = pgTable("jarvis_execution_recoveries", {
  recoveryId: text("recovery_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  nodeId: text("node_id"),
  attemptNumber: integer("attempt_number").notNull(),
  classification: text("classification").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  observationId: text("observation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionLessonsTable = pgTable("jarvis_execution_lessons", {
  lessonId: text("lesson_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  retrievalKey: text("retrieval_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});