import os
import time
from typing import List, Dict, Any, Optional

from python.intelligence.web.engine import WebIntelligenceEngine, WebEvidence
from python.intelligence.retrieval.ingestion import IngestionPipeline, DocumentChunker, IngestionChunk
from python.intelligence.retrieval.memory_lifecycle import MemoryLifecycleManager, CognitiveMemoryRecord, MemoryType, MemoryProvenance
from python.intelligence.retrieval.vector_store import HNSWSimulatedIndexVectorStore, VectorRecord
from python.intelligence.embeddings.engine import RealProvider, DevelopmentFallbackProvider
from python.intelligence.reranking.reranker import RerankingEngine
from python.intelligence.evaluation.grounding import GroundingEngine, EvidenceState
from python.intelligence.code_intel.ast_engine import PolyglotASTEngine
from python.intelligence.code_intel.codebase_graph import CodebaseGraph
from python.intelligence.code_intel.patch_engine import VerifiedPatchSafetyEngine, PatchProposal

class EndToEndIntelligenceOrchestrator:
    """
    Connected JARVIS Intelligence Pipeline:
    WEB -> WORLD KNOWLEDGE RAG -> RERANKING -> GROUNDING -> MODEL ROUTER -> AGENT DISPATCH -> SAFETY PATCH -> ROLLBACK
    """

    def __init__(self, vector_dim: int = 384):
        self.vector_dim = vector_dim
        self.web_engine = WebIntelligenceEngine()
        self.chunker = DocumentChunker(chunk_size=300, chunk_overlap=30)
        self.ingestion_pipeline = IngestionPipeline(chunker=self.chunker)
        self.memory_lifecycle = MemoryLifecycleManager()
        self.vector_store = HNSWSimulatedIndexVectorStore(vector_dim=vector_dim, num_buckets=16)
        self.embedding_provider = RealProvider(vector_dim=vector_dim)
        self.reranker = RerankingEngine()
        self.grounding_engine = GroundingEngine()
        self.ast_engine = PolyglotASTEngine()
        self.codebase_graph = CodebaseGraph()
        self.patch_safety_engine = VerifiedPatchSafetyEngine()

    def process_web_to_knowledge_rag(self, query: str, project_id: str) -> Dict[str, Any]:
        """Searches web, ingests into WORLD_KNOWLEDGE memory, embeds, retrieves, reranks, and evaluates grounding."""
        t0 = time.time()

        # 1. Web Search
        web_results = self.web_engine.search(query, top_k=3)
        web_search_ms = (time.time() - t0) * 1000

        # 2. Ingest into World Knowledge Memory & Vector Store
        t1 = time.time()
        ingested_count = 0
        for ev in web_results:
            # Memory Ingestion
            mem_rec = CognitiveMemoryRecord(
                memory_id=f"mem_web_{hash(ev.url)}",
                memory_type=MemoryType.WORLD_KNOWLEDGE,
                title=ev.title,
                content=ev.content,
                project_id=project_id,
                source=ev.provider,
                provenance=MemoryProvenance.WORLD_KNOWLEDGE,
                confidence=ev.confidence
            )
            ok, msg, _ = self.memory_lifecycle.ingest_memory(mem_rec)
            if ok:
                # Vector Ingestion
                vec = self.embedding_provider.embed_text(ev.content)
                rec = VectorRecord(
                    record_id=mem_rec.memory_id,
                    vector=vec,
                    payload={"title": ev.title, "content": ev.content, "url": ev.url},
                    project_id=project_id,
                    provenance=MemoryProvenance.WORLD_KNOWLEDGE
                )
                self.vector_store.upsert([rec])
                ingested_count += 1

        ingest_ms = (time.time() - t1) * 1000

        # 3. Vector Retrieval (ANN Search)
        t2 = time.time()
        query_vec = self.embedding_provider.embed_text(query)
        candidates = self.vector_store.similarity_search(query_vec, top_k=5, project_id=project_id)
        retrieval_ms = (time.time() - t2) * 1000

        # 4. Reranking
        t3 = time.time()
        ranked = []
        for cand in candidates:
            scored = self.reranker.score_candidate(query, cand["payload"], cand["score"], target_project_id=project_id)
            ranked.append(scored)
        ranked.sort(key=lambda x: x["compositeScore"], reverse=True)
        rerank_ms = (time.time() - t3) * 1000

        # 5. Grounding Evaluation
        grounding_res = self.grounding_engine.evaluate_grounding(query, ranked[:3])

        total_ms = (time.time() - t0) * 1000

        return {
            "query": query,
            "projectId": project_id,
            "webEvidenceRetrieved": len(web_results),
            "memoriesIngested": ingested_count,
            "vectorCandidatesRetrieved": len(candidates),
            "topRankedScore": ranked[0]["compositeScore"] if ranked else 0.0,
            "groundingState": grounding_res["state"],
            "refusalNotice": grounding_res.get("refusalNotice"),
            "latencyMetrics": {
                "webSearchMs": round(web_search_ms, 2),
                "ingestMs": round(ingest_ms, 2),
                "retrievalMs": round(retrieval_ms, 2),
                "rerankMs": round(rerank_ms, 2),
                "totalPipelineMs": round(total_ms, 2),
            }
        }

    def execute_verified_patch_workflow(
        self,
        snapshot_id: str,
        proposal: PatchProposal,
        allowed_paths: List[str],
        test_passed: bool
    ) -> Dict[str, Any]:
        """Applies code patch under boundary safety check and performs automated rollback if verification fails."""
        # 1. Apply Patch
        ok, msg = self.patch_safety_engine.apply_patch(snapshot_id, proposal, allowed_paths=allowed_paths)
        if not ok:
            return {
                "status": "APPLY_REJECTED",
                "message": msg,
                "rolledBack": False
            }

        # 2. Verify & Rollback if test failed
        rollback_res = self.patch_safety_engine.verify_and_rollback(snapshot_id, test_passed=test_passed)
        return rollback_res
