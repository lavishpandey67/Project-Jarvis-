import time
from typing import List, Dict, Any, Optional
from python.intelligence.embeddings.engine import EmbeddingProvider, DevelopmentFallbackProvider, cosine_similarity
from python.intelligence.reranking.reranker import RerankingEngine

class SemanticRetrievalEngine:
    """
    RAG & Retrieval Engine executing vector embedding similarity,
    project isolation filtering, and multi-factor reranking.
    """

    def __init__(self, provider: Optional[EmbeddingProvider] = None, reranker: Optional[RerankingEngine] = None):
        self.provider = provider or DevelopmentFallbackProvider(vector_dim=384)
        self.reranker = reranker or RerankingEngine()

    def retrieve_context(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        project_id: Optional[str] = None,
        allow_cross_project: bool = False,
        limit: int = 10,
        min_score: float = 0.15
    ) -> Dict[str, Any]:
        start_time = time.time()
        
        # 1. Project Isolation Filtering
        filtered_candidates = []
        for cand in candidates:
            cand_proj = cand.get("projectId") or cand.get("project_id")
            validity = str(cand.get("validity") or "").upper()
            
            # Skip explicitly invalidated memories
            if validity == "INVALIDATED":
                continue

            # Strict project isolation unless cross-project is explicitly granted or memory is global
            if project_id and not allow_cross_project:
                if cand_proj and cand_proj != project_id and cand_proj != "global":
                    continue
            
            filtered_candidates.append(cand)

        if not filtered_candidates:
            return {
                "query": query,
                "projectId": project_id,
                "itemsRetrieved": 0,
                "itemsReturned": 0,
                "scoredItems": [],
                "latencyMs": round((time.time() - start_time) * 1000, 2),
                "providerInfo": self.provider.get_provider_info()
            }

        # 2. Embed Query
        query_vec = self.provider.embed_text(query)

        # 3. Embed & Score Candidates
        scored_results = []
        for cand in filtered_candidates:
            text = f"{cand.get('title', '')}\n{cand.get('content', '')}"
            cand_vec = self.provider.embed_text(text)
            sim = cosine_similarity(query_vec, cand_vec)

            # Rerank with composite scoring formula
            ranked_item = self.reranker.score_candidate(query, cand, sim, target_project_id=project_id)
            if ranked_item["compositeScore"] >= min_score:
                scored_results.append(ranked_item)

        # 4. Sort & Truncate
        scored_results.sort(key=lambda x: x["compositeScore"], reverse=True)
        top_results = scored_results[:limit]

        latency = (time.time() - start_time) * 1000

        return {
            "query": query,
            "projectId": project_id,
            "itemsRetrieved": len(filtered_candidates),
            "itemsReturned": len(top_results),
            "scoredItems": top_results,
            "latencyMs": round(latency, 2),
            "providerInfo": self.provider.get_provider_info()
        }
