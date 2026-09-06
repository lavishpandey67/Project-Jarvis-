import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | undefined = undefined;
export let db: any;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNodePg(pool, { schema });
} else {
  console.warn(
    "[AI Studio] DATABASE_URL is not set. Initializing in-memory PGlite database.",
  );
  const pglite = new PGlite();
  db = drizzlePglite(pglite, { schema });

  // Initialize schema tables synchronously/top-level for PGlite
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS workforce_conversations (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_memories (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'decision',
      importance INT NOT NULL DEFAULT 3,
      embedding TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE workforce_memories ADD COLUMN IF NOT EXISTS embedding TEXT;
    CREATE TABLE IF NOT EXISTS workforce_agents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS workforce_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      agent_id INT,
      conversation_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_activities (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      agent_id INT,
      task_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_cognitive_memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      project_id TEXT,
      conversation_id INT,
      task_id TEXT,
      agent_role TEXT,
      source TEXT NOT NULL DEFAULT 'SYSTEM',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      confidence INT NOT NULL DEFAULT 80,
      importance INT NOT NULL DEFAULT 3,
      validity TEXT NOT NULL DEFAULT 'UNVERIFIED',
      superseded_by TEXT,
      related_memory_ids TEXT,
      related_task_ids TEXT,
      related_decision_ids TEXT,
      metadata TEXT,
      embedding TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_accessed_at TIMESTAMPTZ,
      last_reinforced_at TIMESTAMPTZ
    );
    ALTER TABLE workforce_cognitive_memories ADD COLUMN IF NOT EXISTS embedding TEXT;
    CREATE TABLE IF NOT EXISTS workforce_memory_conflicts (
      id TEXT PRIMARY KEY,
      existing_memory_id TEXT NOT NULL,
      conflicting_memory_id TEXT,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      resolution_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_reasoning_artifacts (
      id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      complexity_level TEXT NOT NULL,
      known_facts TEXT,
      unknowns TEXT,
      assumptions TEXT,
      constraints TEXT,
      hypotheses TEXT,
      evidence TEXT,
      alternatives_evaluated TEXT,
      tradeoffs TEXT,
      contradictions_detected TEXT,
      decisions_made TEXT,
      unresolved_questions TEXT,
      overall_confidence INT NOT NULL DEFAULT 85,
      next_recommended_action TEXT,
      project_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_cognitive_state_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      intent_domain TEXT,
      project_id TEXT,
      active_plan_summary TEXT,
      active_dag_summary TEXT,
      current_task_id TEXT,
      current_task_agent_role TEXT,
      relevant_memories TEXT,
      current_evidence TEXT,
      agent_outputs_summary TEXT,
      known_constraints TEXT,
      active_decisions TEXT,
      unresolved_questions TEXT,
      conflicts TEXT,
      risks TEXT,
      next_recommended_action TEXT,
      reasoning_artifact_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_user_cognitive_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT NOT NULL,
      confidence INT NOT NULL DEFAULT 50,
      occurrences INT NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'OBSERVED_INTERACTION',
      project_id TEXT,
      validation_status TEXT NOT NULL DEFAULT 'CANDIDATE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS workforce_tool_execution_traces (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      agent_role TEXT,
      task_id TEXT,
      input TEXT,
      output TEXT,
      success INT NOT NULL DEFAULT 1,
      error TEXT,
      execution_time_ms INT NOT NULL DEFAULT 0,
      permission_class TEXT NOT NULL DEFAULT 'READ',
      risk_level TEXT NOT NULL DEFAULT 'low',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_journals (
      execution_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      conversation_id INT,
      objective TEXT NOT NULL,
      state TEXT NOT NULL,
      graph_id TEXT,
      current_node_id TEXT,
      final_output TEXT,
      failure TEXT,
      resume_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_graphs (
      graph_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_states (
      state_record_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      state TEXT NOT NULL,
      is_current INT NOT NULL DEFAULT 1,
      entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      exited_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_graph_nodes (
      node_record_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      graph_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      state TEXT NOT NULL,
      assigned_agent_role TEXT,
      assigned_agent_name TEXT,
      dependencies TEXT,
      input TEXT,
      output TEXT,
      error TEXT,
      retry_count INT NOT NULL DEFAULT 0,
      max_retries INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS jarvis_execution_graph_nodes_execution_node_idx
      ON jarvis_execution_graph_nodes (execution_id, node_id);
    CREATE TABLE IF NOT EXISTS jarvis_execution_events (
      event_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      sequence INT NOT NULL,
      kind TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT,
      node_id TEXT,
      payload TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS jarvis_execution_events_execution_sequence_idx
      ON jarvis_execution_events (execution_id, sequence);
    CREATE TABLE IF NOT EXISTS jarvis_execution_actions (
      action_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      node_id TEXT,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT,
      authorized_by TEXT,
      authorized_at TIMESTAMPTZ,
      executed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_tool_executions (
      tool_execution_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      action_id TEXT,
      node_id TEXT,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input TEXT,
      output TEXT,
      success INT NOT NULL DEFAULT 1,
      error TEXT,
      execution_time_ms INT NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_attempts (
      attempt_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      node_id TEXT,
      attempt_number INT NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_observations (
      observation_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      action_id TEXT,
      node_id TEXT,
      source TEXT NOT NULL,
      success INT NOT NULL DEFAULT 1,
      data TEXT,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_evaluations (
      evaluation_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      node_id TEXT,
      verdict TEXT NOT NULL,
      score TEXT,
      reasons TEXT,
      evidence TEXT,
      evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_recoveries (
      recovery_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      node_id TEXT,
      attempt_number INT NOT NULL,
      classification TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      observation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jarvis_execution_lessons (
      lesson_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      retrieval_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export * from "./schema";
