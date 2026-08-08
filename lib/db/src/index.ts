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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
  `);
}

export * from "./schema";
