import math
import time
from typing import Dict, Any, List, Optional

class RerankingEngine:
    """
    Multi-factor reranking engine that calculates composite relevance score:
    Score = w_sim * semantic_similarity
          + w_task * task_relevance
          + w_conf * memory_confidence
          + w_imp  * importance_norm
          + w_rec  * recency_score
          + w_proj * project_relevance
    """

    DEFAULT_WEIGHTS = {
        "semantic_similarity": 0.40,
        "task_relevance": 0.20,
        "memory_confidence": 0.15,
        "importance": 0.10,
        "recency": 0.10,
        "project_relevance": 0.05,
    }

    def __init__(self, custom_weights: Optional[Dict[str, float]] = None):
        self.weights = {**self.DEFAULT_WEIGHTS, **(custom_weights or {})}
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}

    def _calculate_recency_score(self, timestamp_ms: Optional[float], half_life_days: float = 7.0) -> float:
        if not timestamp_ms:
            return 0.5
        now_ms = time.time() * 1000
        age_days = max(0.0, (now_ms - timestamp_ms) / (1000.0 * 86400.0))
        decay_constant = math.log(2) / half_life_days
        return math.exp(-decay_constant * age_days)

    def _calculate_task_relevance(self, query: str, memory_text: str, tags: List[str]) -> float:
        query_words = set(query.lower().split())
        if not query_words:
            return 0.5
        
        mem_words = set(memory_text.lower().split())
        intersection = query_words.intersection(mem_words)
        overlap_score = len(intersection) / len(query_words)

        tag_bonus = 0.0
        for tag in tags:
            if tag.lower() in query.lower():
                tag_bonus += 0.25

        return min(1.0, overlap_score + tag_bonus)

    def score_candidate(
        self,
        query: str,
        candidate: Dict[str, Any],
        semantic_sim: float,
        target_project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Computes composite score and returns item enriched with score breakdown.
        """
        # 1. Semantic Similarity
        sim_score = max(0.0, float(semantic_sim))

        # 2. Task Relevance
        mem_text = f"{candidate.get('title', '')} {candidate.get('content', '')}"
        tags = candidate.get("tags") or []
        task_rel_score = self._calculate_task_relevance(query, mem_text, tags)

        # 3. Memory Confidence / Validity
        validity = str(candidate.get("validity") or "UNKNOWN").upper()
        conf_map = {"FACT": 1.0, "LESSON": 0.9, "DECISION": 0.9, "ASSUMPTION": 0.5, "HYPOTHESIS": 0.4, "INVALIDATED": 0.0}
        conf_score = conf_map.get(validity, float(candidate.get("confidence", 0.7)))

        # 4. Importance (1..5 normalized to 0..1)
        importance_raw = float(candidate.get("importance", 3))
        imp_score = min(1.0, max(0.0, (importance_raw - 1.0) / 4.0))

        # 5. Recency
        ts = candidate.get("createdAt") or candidate.get("timestamp_ms") or candidate.get("updatedAt")
        rec_score = self._calculate_recency_score(ts)

        # 6. Project Relevance
        mem_proj = candidate.get("projectId") or candidate.get("project_id")
        if target_project_id and mem_proj == target_project_id:
            proj_score = 1.0
        elif not mem_proj or mem_proj == "global":
            proj_score = 0.7
        else:
            proj_score = 0.2

        composite = (
            self.weights["semantic_similarity"] * sim_score +
            self.weights["task_relevance"] * task_rel_score +
            self.weights["memory_confidence"] * conf_score +
            self.weights["importance"] * imp_score +
            self.weights["recency"] * rec_score +
            self.weights["project_relevance"] * proj_score
        )

        return {
            "record": candidate,
            "compositeScore": round(composite, 4),
            "breakdown": {
                "semanticSimilarity": round(sim_score, 4),
                "taskRelevance": round(task_rel_score, 4),
                "confidence": round(conf_score, 4),
                "importance": round(imp_score, 4),
                "recency": round(rec_score, 4),
                "projectRelevance": round(proj_score, 4),
            }
        }
