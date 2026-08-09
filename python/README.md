# Jarvis Brain — Python Intelligence Layer (Batch 3.5)

## Overview & Architecture

Jarvis is a **polyglot AI orchestration system** where:

- **TypeScript (Node.js)** serves as the **Control & Orchestration Plane**:
  - Handles HTTP/WebSocket API routes, UI state, and database persistence.
  - Controls DAG planning, step execution, and agent dispatcher.
  - Enforces tool permissions, sandboxing, and security policy gates.
  - Manages context scoping, budget enforcement, and memory persistence.

- **Python** serves as the **Computational Intelligence Layer**:
  - **Embedding Engine**: Model-independent vector embeddings with deterministic feature hashing fallback (`DEVELOPMENT_FALLBACK` vs `REAL_PROVIDER`).
  - **Semantic Retrieval**: Candidate retrieval, similarity scoring, and strict project-isolation filtering.
  - **Multi-Factor Reranking**: Combines semantic similarity, task relevance, memory confidence, importance, recency decay, and project relevance.
  - **Evaluation Engine**: Claim extraction, evidence grounding verification, and constraint violation checks.
  - **Statistical & Probabilistic Layer**: Softmax normalization, Shannon entropy uncertainty estimation, and Platt calibrated confidence scoring.
  - **Cognitive Model Abstractions**: Predictors for task complexity (`LEVEL_1`..`LEVEL_6`), failure risk probability, user preference, and agent routing.

---

## Directory Structure

```
python/intelligence/
├── app/
│   ├── contract.py          # Type-safe versioned request/response contract
│   └── server.py            # Lightweight HTTP JSON RPC & CLI server (port 5050)
├── embeddings/
│   └── engine.py            # Vector embedding abstraction & cosine similarity
├── retrieval/
│   └── semantic.py          # RAG & candidate semantic retrieval engine
├── reranking/
│   └── reranker.py          # Multi-factor composite reranking engine
├── evaluation/
│   └── evaluator.py         # Claim extraction & constraint evaluator
├── statistical/
│   └── probabilistic.py    # Softmax, entropy, and Platt calibration
├── cognitive/
│   └── models.py           # Task difficulty & routing predictor models
└── tests/
    ├── test_embeddings.py
    ├── test_retrieval.py
    ├── test_evaluator.py
    ├── test_contract.py
    └── run_tests.py         # Complete Python test suite runner
```

---

## Type-Safe Cross-Language API Contract

### Request Payload (`IntelligenceRequest`)
```json
{
  "requestId": "req_12345",
  "taskId": "task_456",
  "projectId": "proj_lead_ops",
  "operation": "SEMANTIC_RETRIEVAL",
  "inputData": {
    "query": "Lead deduplication prior to AI enrichment",
    "candidates": [...],
    "limit": 10
  },
  "metadata": {},
  "options": {}
}
```

### Response Payload (`IntelligenceResponse`)
```json
{
  "requestId": "req_12345",
  "operation": "SEMANTIC_RETRIEVAL",
  "status": "success",
  "output": {
    "itemsRetrieved": 2,
    "itemsReturned": 1,
    "scoredItems": [...]
  },
  "confidence": 0.95,
  "latencyMs": 4.12,
  "error": null,
  "modelInfo": {
    "provider": "RealProvider",
    "vector_dim": 384,
    "mode": "DEVELOPMENT_FALLBACK"
  }
}
```

---

## Real Jarvis Integration Path

The Python Intelligence Service is directly integrated into the existing **Jarvis Context Retrieval Engine** (`artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts`):

1. **Jarvis Brain** receives task objective.
2. **ContextRetrievalEngine** queries memory store for candidate memories.
3. Candidates are dispatched to **Python Intelligence Service** via `PythonIntelligenceClient` (`pythonBridge/client.ts`).
4. **Python RAG & Reranker** computes 384-dimensional vector embeddings, applies project isolation, and ranks results using the multi-factor scoring formula.
5. **Ranked context package** is returned to TypeScript for agent prompt construction and DAG execution.
6. **Graceful Fallback**: If the Python service is offline or times out, the system automatically falls back to local TypeScript scoring without failing the workflow.
