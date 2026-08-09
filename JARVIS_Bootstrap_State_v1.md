# JARVIS BRAIN — BOOTSTRAP STATE / ACTIVATION PACK
Version: 1.0
Purpose: Restore project context in a fresh AI Studio Build workspace without replaying the entire conversation.

## 1. SOURCE OF TRUTH

The imported GitHub repository is the primary source of truth.
This document is a compact orientation layer, NOT a replacement for inspecting the code.

A ZIP backup was also reviewed. It contains the current TypeScript/React workspace, Python intelligence layer, Jarvis orchestration, memory, tools, polyglot routing, and code-intelligence modules.

Rules:
- Inspect existing implementation before changing it.
- Never recreate an existing subsystem merely because it is listed here.
- Never call a subsystem production-ready merely because tests pass.
- Distinguish REAL implementation, FALLBACK/SIMULATION, PARTIAL implementation, and MISSING integration.
- Preserve working architecture and regression-test every change.

## 2. CURRENT JARVIS FOUNDATION

### Control / orchestration
- TypeScript / Node.js control plane.
- Express API.
- Intent analysis and cognitive-complexity classification.
- Planner + DAG execution.
- Agent dispatcher and workforce registry.
- Critic/evaluation and revision loop.
- Synthesis and execution tracing.
- Tool registry with READ / WRITE / EXECUTE / DESTRUCTIVE permission classes.
- Human approval gate for destructive tools.

### Workforce
Seven intended agents:
1. Research specialist
2. Strategy specialist
3. Builder specialist
4. Critic specialist
5. Executor specialist
6. Adaptive Generalist A
7. Adaptive Generalist B

Generalists can receive scoped task profiles rather than permanently changing identity.

### Cognitive memory
Six memory layers:
- WORKING
- EPISODIC
- PROJECT
- SEMANTIC
- DECISION
- LESSON

Also present:
- project isolation
- conflict detection
- supersession/invalidation
- cognitive-state snapshots
- reasoning artifacts
- personal cognitive-pattern tracking
- secret scrubbing
- prompt-injection suppression
- persistent-store readiness / PGlite/PostgreSQL path

### Intelligence layer
Python service exists as a computational layer alongside TypeScript.

Implemented foundations include:
- embedding abstraction
- deterministic feature-hashing fallback vectors
- cosine similarity
- semantic retrieval
- multi-factor reranking
- claim/constraint evaluation
- softmax
- Shannon entropy
- confidence calibration abstraction
- task-difficulty/routing predictor abstractions
- TypeScript ↔ Python bridge with fallback behavior

### Polyglot engineering layer
Technology registry/routing covers major categories:
- TypeScript / JavaScript
- Python
- Java / Kotlin
- Rust
- C / C++
- Go
- Swift
- SQL / Bash
- React / React Native / Flutter
- Node.js / Python services / Java / Go / Rust
- PostgreSQL / SQL / MySQL / MongoDB / Redis / pgvector abstractions
- AI/ML / embeddings / RAG / retrieval / reranking
- Linux / Docker / CI/CD / Git / GitHub / AWS / GCP / deployment / monitoring

Technology radar tracks knowledge status/freshness.

### Code intelligence
Current foundation includes:
- codebase graph
- cross-language boundary tracing
- code context synthesis
- debugging analysis
- impact scoring
- structural refactoring pipeline
- code-quality analysis
- AST-like structural parsing for several languages

IMPORTANT: the current parser is largely pattern/line based for supported languages; it is NOT yet a full compiler-grade multi-language AST system.

## 3. CURRENT REALITY — DO NOT OVERCLAIM

The repository is a strong architecture foundation, but several components are still development-grade.

### Embeddings
Current Python embedding implementation is deterministic feature hashing.
It is NOT a genuine neural semantic embedding model yet.

The TypeScript Gemini embedding provider currently falls back to the deterministic implementation rather than actually calling a remote embedding model.

### RAG
A retrieval/reranking foundation exists.
Production-grade RAG still requires:
- real semantic embedding provider
- persistent vector index
- chunking strategy
- metadata filtering
- hybrid lexical + vector retrieval
- retrieval evaluation dataset
- citation/evidence linkage
- freshness/update pipeline
- context compression
- recall/precision measurement

### Code intelligence
The current structural parser uses source-text pattern matching for several languages.
Compiler/parser-backed AST adapters are still needed for serious multi-file refactoring.

### Refactoring
The current refactoring engine contains validation/simulation behavior.
Do NOT assume it safely modifies and validates arbitrary real repositories until actual file mutation + tests + rollback are verified.

### Technology radar
Current technology knowledge is registry-backed and freshness-aware.
It is NOT yet a continuously live web-research/update system.

### Autonomous/self-healing
Foundations exist for agents, tools, evaluation, and adaptive generalists.
A true autonomous repair loop still needs bounded diagnosis → patch → test → rollback → re-diagnosis execution against real failures.

### DevOps
Deployment/CI/CD/monitoring are not yet a complete autonomous engineering control plane.

### External tools / MCP
Keep MCP/tool-protocol expansion later.
Do not let integration work destabilize the brain foundation.

## 4. PERSONAL JARVIS GOAL

The target is a personal cognitive assistant, not a generic SaaS product.

Two knowledge domains must remain distinct:

A. WORLD / EXTERNAL KNOWLEDGE
- web search
- current technology information
- documents and external sources
- research
- freshness and evidence

B. USER / PERSONAL KNOWLEDGE
- user's projects
- decisions
- preferences
- working patterns
- long-term goals
- interaction history
- validated cognitive patterns

The system must never blindly mix these domains.

## 5. DEVELOPMENT PHILOSOPHY

Use compound development rather than serial feature dumping.

Every batch follows:

AUDIT
→ SELECT HIGHEST-LEVERAGE BOTTLENECK
→ PLAN
→ IMPLEMENT
→ INTEGRATE
→ TEST
→ FAILURE INJECTION
→ REGRESSION TEST
→ MEASURE
→ RECORD LESSON
→ UPDATE STATE
→ SELECT NEXT BOTTLENECK

Each completed batch must improve multiple connected capabilities where possible.

Do not optimize for number of files created.
Optimize for verified capability gained per model/token/tool cost.

## 6. NEW AI STUDIO BOOTSTRAP PROCEDURE

After importing the repository into a fresh AI Studio workspace:

PHASE 0 — ORIENT
1. Read this state document.
2. Inspect the repository.
3. Compare this document against actual code.
4. Produce a CURRENT_STATE_DIFF.
5. Do NOT implement anything yet.

PHASE 1 — FORENSIC AUDIT
For every major subsystem classify:
- REAL
- FALLBACK
- PARTIAL
- SIMULATED
- MISSING
- BROKEN
- UNTESTED

Also identify:
- integration gaps
- hidden dependencies
- security risks
- runtime bottlenecks
- duplicate systems
- misleading "production-ready" claims

PHASE 2 — CONVERGENCE PLAN
Produce only:
1. top 10 remaining capability gaps
2. top 5 architectural risks
3. highest-leverage next batch
4. exact files/modules affected
5. expected measurable outcome
6. tests required
7. rollback strategy
8. estimated model/tool cost

STOP.

Do not start implementing until the user approves the next batch.

## 7. COST / TOKEN CONTROL

Default behavior:
- Inspect before generating.
- Reuse existing code.
- Read only relevant files.
- Prefer local/static checks before model calls.
- Parallelize independent analysis.
- Never repeat the whole architecture in every prompt.
- Store state in repository documents instead of conversation history.
- Use one canonical state document.
- Use short batch prompts referencing the state document.
- Never run an open-ended improvement loop without a stopping criterion.

## 8. REQUIRED VERIFICATION STANDARD

A feature can only move to VERIFIED when:
- implementation exists
- runtime path is connected
- positive test exists
- negative/failure test exists
- regression suite passes
- fallback behavior is explicit
- limitations are documented

A green unit test is evidence of the tested behavior, not proof of production readiness.

## 9. LONG-TERM TARGET ORDER

1. Stabilize current runtime.
2. Real semantic embeddings.
3. Production vector store/index.
4. Production RAG + chunking + hybrid retrieval + evidence.
5. External web/knowledge retrieval with freshness and provenance.
6. Stronger statistical/ML learning layer.
7. Compiler-grade multi-language AST and code graph.
8. Real autonomous debugging/refactoring with test/rollback loop.
9. DevOps: Git, branches, commits, CI/CD, containers, deployment, monitoring, approval gates.
10. Security/audit/secret/isolation hardening.
11. Autonomous bounded self-healing.
12. External tool protocol integration (MCP when justified).
13. Personal identity and long-term cognitive adaptation.
14. Real-world project execution and artifact generation.
15. Mobile/OS body integration as the final interface layer.

## 10. MASTER RULE

JARVIS should become more capable by compounding verified capabilities, not by accumulating claims.

For every next step ask:

"What new capability becomes possible because of the capabilities already built?"

If the answer is only "another feature exists", reject the batch.

If the answer is "existing memory + retrieval + planning + agents + tools + evaluation now produce a new reliable behavior", prioritize it.
