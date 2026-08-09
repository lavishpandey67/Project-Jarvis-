import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const conversationsTable = pgTable("workforce_conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  ...timestamps,
});

export const messagesTable = pgTable("workforce_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  agentId: integer("agent_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memoriesTable = pgTable("workforce_memories", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  kind: text("kind").notNull().default("decision"),
  importance: integer("importance").notNull().default(3),
  embedding: text("embedding"),
  ...timestamps,
});

export const cognitiveMemoriesTable = pgTable("workforce_cognitive_memories", {
  id: text("id").primaryKey(),
  memoryType: text("memory_type").notNull(),
  projectId: text("project_id"),
  conversationId: integer("conversation_id"),
  taskId: text("task_id"),
  agentRole: text("agent_role"),
  source: text("source").notNull().default("SYSTEM"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  confidence: integer("confidence").notNull().default(80),
  importance: integer("importance").notNull().default(3),
  validity: text("validity").notNull().default("UNVERIFIED"),
  supersededBy: text("superseded_by"),
  relatedMemoryIds: text("related_memory_ids"),
  relatedTaskIds: text("related_task_ids"),
  relatedDecisionIds: text("related_decision_ids"),
  metadata: text("metadata"),
  embedding: text("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  lastReinforcedAt: timestamp("last_reinforced_at", { withTimezone: true }),
});

export const memoryConflictsTable = pgTable("workforce_memory_conflicts", {
  id: text("id").primaryKey(),
  existingMemoryId: text("existing_memory_id").notNull(),
  conflictingMemoryId: text("conflicting_memory_id"),
  description: text("description").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentsTable = pgTable("workforce_agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"),
});

export const tasksTable = pgTable("workforce_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("queued"),
  agentId: integer("agent_id"),
  conversationId: integer("conversation_id"),
  ...timestamps,
});

export const activitiesTable = pgTable("workforce_activities", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  agentId: integer("agent_id"),
  taskId: integer("task_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reasoningArtifactsTable = pgTable("workforce_reasoning_artifacts", {
  id: text("id").primaryKey(),
  objective: text("objective").notNull(),
  complexityLevel: text("complexity_level").notNull(),
  knownFacts: text("known_facts"),
  unknowns: text("unknowns"),
  assumptions: text("assumptions"),
  constraints: text("constraints"),
  hypotheses: text("hypotheses"),
  evidence: text("evidence"),
  alternativesEvaluated: text("alternatives_evaluated"),
  tradeoffs: text("tradeoffs"),
  contradictionsDetected: text("contradictions_detected"),
  decisionsMade: text("decisions_made"),
  unresolvedQuestions: text("unresolved_questions"),
  overallConfidence: integer("overall_confidence").notNull().default(85),
  nextRecommendedAction: text("next_recommended_action"),
  projectId: text("project_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cognitiveStateSnapshotsTable = pgTable("workforce_cognitive_state_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  objective: text("objective").notNull(),
  intentDomain: text("intent_domain"),
  projectId: text("project_id"),
  activePlanSummary: text("active_plan_summary"),
  activeDAGSummary: text("active_dag_summary"),
  currentTaskId: text("current_task_id"),
  currentTaskAgentRole: text("current_task_agent_role"),
  relevantMemories: text("relevant_memories"),
  currentEvidence: text("current_evidence"),
  agentOutputsSummary: text("agent_outputs_summary"),
  knownConstraints: text("known_constraints"),
  activeDecisions: text("active_decisions"),
  unresolvedQuestions: text("unresolved_questions"),
  conflicts: text("conflicts"),
  risks: text("risks"),
  nextRecommendedAction: text("next_recommended_action"),
  reasoningArtifactId: text("reasoning_artifact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userCognitivePatternsTable = pgTable("workforce_user_cognitive_patterns", {
  id: text("id").primaryKey(),
  patternType: text("pattern_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence").notNull(),
  confidence: integer("confidence").notNull().default(50),
  occurrences: integer("occurrences").notNull().default(1),
  source: text("source").notNull().default("OBSERVED_INTERACTION"),
  projectId: text("project_id"),
  validationStatus: text("validation_status").notNull().default("CANDIDATE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const toolExecutionTracesTable = pgTable("workforce_tool_execution_traces", {
  id: text("id").primaryKey(),
  toolId: text("tool_id").notNull(),
  toolName: text("tool_name").notNull(),
  agentRole: text("agent_role"),
  taskId: text("task_id"),
  input: text("input"),
  output: text("output"),
  success: integer("success").notNull().default(1),
  error: text("error"),
  executionTimeMs: integer("execution_time_ms").notNull().default(0),
  permissionClass: text("permission_class").notNull().default("READ"),
  riskLevel: text("risk_level").notNull().default("low"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(
  conversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema & z.ZodTypeAny>;
export type Conversation = typeof conversationsTable.$inferSelect;

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema & z.ZodTypeAny>;
export type Message = typeof messagesTable.$inferSelect;

export const insertMemorySchema = createInsertSchema(memoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMemory = z.infer<typeof insertMemorySchema & z.ZodTypeAny>;
export type Memory = typeof memoriesTable.$inferSelect;

export const insertAgentSchema = createInsertSchema(agentsTable).omit({
  id: true,
});
export type InsertAgent = z.infer<typeof insertAgentSchema & z.ZodTypeAny>;
export type Agent = typeof agentsTable.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema & z.ZodTypeAny>;
export type Task = typeof tasksTable.$inferSelect;

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema & z.ZodTypeAny>;
export type Activity = typeof activitiesTable.$inferSelect;