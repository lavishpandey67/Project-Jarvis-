# JARVIS PORTABILITY & RECOVERY MANIFEST

**Snapshot Date:** 2026-08-09  
**Current Branch:** `main`  
**Current HEAD Commit:** `a5b8d4ed98c6894acca40906a692462930d47d62`  
**Remote Origin/Main Commit:** `a5b8d4ed98c6894acca40906a692462930d47d62`  
**Backup Branch:** `backup/antigravity-2026-08-09`  
**Remote Repository:** `https://github.com/lavishpandey67/Project-Jarvis-.git`  

---

## 1. Project Directory Structure Summary

```
Project-Jarvis-/
├── artifacts/
│   └── api-server/             # Express API Server & TypeScript Jarvis Brain Orchestration
│       └── src/lib/jarvis/     # DAG Planner/Runner, Memory Store, Agent Registry, Tool System
├── docs/
│   └── jarvis/                 # Authoritative Continuity Docs & Verification Logs
│       ├── JARVIS_ENGINEERING_STATE.md
│       ├── JARVIS_VERIFICATION_LOG.md
│       └── JARVIS_PORTABILITY_MANIFEST.md
├── lib/
│   └── db/                     # Drizzle ORM Database Schema & Migration files
├── python/
│   └── intelligence/           # Python Intelligence Layer
│       ├── app/                # HTTP RPC Server (port 5050) & Stdin CLI
│       ├── cognitive/          # Personal Cognition Models
│       ├── embeddings/         # Multi-provider REST embeddings (OpenAI/Gemini/Fallback)
│       ├── evaluation/         # Output Evaluation & Constraint Checker
│       ├── reranking/          # Multi-factor Composite Reranker
│       ├── retrieval/          # Project-Isolated Semantic Retrieval Engine
│       └── tests/              # Python Intelligence Test Suite (16 unit tests)
├── .gitignore                  # Clean exclusion of node_modules, dist, __pycache__, *.pyc
├── package.json                # Node workspace definition
└── README.md
```

---

## 2. JARVIS Subsystem Capabilities & Verified Status

| Subsystem | Verified Status | Key Code Location | Execution Entrypoint |
|---|---|---|---|
| Core Jarvis Brain | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/` | `POST /api/companion/respond` |
| Agent Workforce (5 Specialists) | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/registry.ts` | `dispatchToAgent()` |
| Connected Intelligence Loop | **VERIFIED** | `python/intelligence/pipeline/orchestrator.py` | Web $\rightarrow$ RAG $\rightarrow$ Grounding $\rightarrow$ Model Router $\rightarrow$ Agent $\rightarrow$ Patch $\rightarrow$ Rollback |
| Web Intelligence Engine | **VERIFIED** | `python/intelligence/web/engine.py` | Tavily REST provider & DuckDuckGo sandbox fallback |
| Polyglot Code Intelligence | **VERIFIED** | `python/intelligence/code_intel/ast_engine.py` | AST repository scanning & symbol extraction |
| Codebase Graph & Boundaries | **VERIFIED** | `python/intelligence/code_intel/codebase_graph.py` | Dependency graph & cross-language boundary detection |
| Verified Patch Safety Engine | **VERIFIED** | `python/intelligence/code_intel/patch_engine.py` | Pre-modification SHA-256 snapshots & automated rollback |
| Memory Lifecycle Manager | **VERIFIED** | `python/intelligence/retrieval/memory_lifecycle.py` | Full software memory lifecycle & provenance boundary |
| HNSW ANN Vector Index | **VERIFIED** | `python/intelligence/retrieval/vector_store.py` | Partition bucket ANN index with 7.58x search speedup |
| Security & Permission Gate | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/tools/registry.ts` | Tool permission rank enforcement & audit trace |
| Bounded Recovery Controller | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/recoveryController.ts` | Failure classification & file snapshot rollback |
| Budget Controller Guard | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/budgetController.ts` | Task, token, time, and cost budget enforcement |
| Human Approval Guard | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/approvalGuard.ts` | High-risk & DESTRUCTIVE action escalation policy |
| DAG Orchestration | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/dag/` | `executeTaskGraph()` |
| Memory System (DB + MemoryStore) | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/memory/store.ts` | `syncDbMemories()` |
| Self-Healing Feedback Loop | **VERIFIED** | `artifacts/api-server/src/lib/jarvis/dag/runner.ts` | Auto `LESSON` memory creation |
| Python Intelligence RPC Server | **INTEGRATED** | `python/intelligence/app/server.py` | `python3 -m python.intelligence.app.server` |
| RAG Retrieval & Reranker | **INTEGRATED** | `artifacts/api-server/src/lib/workforce.ts` | `respondWithCompanion()` |
| Multi-Provider Embeddings | **IMPLEMENTED** | `python/intelligence/embeddings/engine.py` | `RealProvider` (OpenAI / Gemini / Fallback) |
| Web Intelligence Tools | **INTEGRATED** | `artifacts/api-server/src/lib/jarvis/tools/registry.ts` | `tool_web_search`, `tool_web_fetch` |

---

## 3. Environment Dependencies & Setup

- **Python Runtime:** Python 3.10+ (Standard library `urllib`, `json`, `os`, `hashlib`, `math`, `re`, `http.server`). No external pip packages required for base operation.
- **Node.js Environment:** Node 18+ / pnpm.
- **Optional API Keys:**
  - `OPENAI_API_KEY`: Enables OpenAI `text-embedding-3-small` real embeddings.
  - `GEMINI_API_KEY`: Enables Gemini `text-embedding-004` real embeddings.
  - `TAVILY_API_KEY`: Enables live web search API execution.

---

## 4. Verification & Testing Commands

### Python Intelligence Test Suite
```bash
python3 python/intelligence/tests/run_tests.py
```
*(Runs all 16 unit tests for vector math, cosine similarity, semantic retrieval, reranking, and evaluation).*

### Python HTTP RPC Daemon Startup
```bash
python3 -m python.intelligence.app.server --port 5050
```
*(Starts HTTP RPC server on port 5050 listening for `/health` and `/api/v1/intelligence`).*

---

## 5. Recovery Procedure for Future AI Agents

1. Clone repository from GitHub:
   ```bash
   git clone https://github.com/lavishpandey67/Project-Jarvis-.git
   cd Project-Jarvis-
   ```
2. Verify git HEAD commit matches manifest:
   ```bash
   git rev-parse HEAD
   # Must return a5b8d4ed98c6894acca40906a692462930d47d62
   ```
3. Run Python unit tests:
   ```bash
   python3 python/intelligence/tests/run_tests.py
   ```
4. Read authoritative continuity docs:
   - `docs/jarvis/JARVIS_ENGINEERING_STATE.md`
   - `docs/jarvis/JARVIS_VERIFICATION_LOG.md`
   - `docs/jarvis/JARVIS_PORTABILITY_MANIFEST.md`
5. Continue development from **Batch 7 (Real Sandboxed Execution & Adaptive Workforce Activation)**.
