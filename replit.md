# Personal AI Workforce

A mobile-first personal AI workspace where a Companion orchestrates specialized agents, memory, tasks, and reviewable execution.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/personal-ai-workforce` — mobile-friendly web app with Companion, Memory, Agents, Tasks, and Activity views
- `artifacts/api-server/src/lib/workforce.ts` — orchestration loop, provider call boundary, fallback mode, and persistence services
- `artifacts/api-server/src/routes/workforce.ts` — REST routes for the workforce surfaces
- `lib/db/src/schema/workforce.ts` — persistent workforce tables
- `lib/api-spec/openapi.yaml` — source of truth for workforce API contracts

## Architecture decisions

- The Companion is the only orchestration entry point: it inspects context, chooses direct response vs one-agent delegation, reviews delegated output, and persists the activity trail.
- V0 uses one shared Express API, PostgreSQL/Drizzle persistence, and a small React client; no multi-agent framework or external action layer is present.
- Agents are registry records rather than hard-coded UI flows, so adding a future specialist does not require changing the Companion contract.
- Risky external actions are intentionally absent; tasks complete as internal planning/review work only.
- Provider failures are explicit and use a local fallback mode that preserves the orchestration trace without pretending to have performed external research or execution.

## Product

Users can chat with the Companion, switch conversation threads, view persistent memory, inspect the three initial specialist agents, create/update tasks, and review recent execution activity. The Companion can answer directly or delegate to Research Agent, Builder Agent, or Critic Agent and then review the delegated result.

## User preferences

- Keep the architecture simple, cloud-based, and maintainable for mobile-first development.
- Build the hierarchy `USER → COMPANION → SPECIALIZED AGENTS → TOOLS/MEMORY → RESULT → COMPANION REVIEW → USER`.
- Do not add voice, WhatsApp, Gmail, Calendar, GitHub, complex multi-agent frameworks, autonomous external actions, unnecessary animations, or complicated dashboards to V0.

## Gotchas

- `OPENAI_API_KEY` is required for model-generated reasoning. If the provider has no available credits, the API deliberately falls back to a clearly labeled local orchestration mode.
- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before server/client typechecks.
- After changing `lib/db/src/schema/workforce.ts`, run `pnpm --filter @workspace/db run push` in development.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
