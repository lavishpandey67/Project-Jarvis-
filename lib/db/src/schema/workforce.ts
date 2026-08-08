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