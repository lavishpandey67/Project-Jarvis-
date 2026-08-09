from typing import List, Dict, Any

class RAGEvaluator:
    """Evaluates RAG retrieval benchmarks: Recall@K, Precision@K, MRR, ProjectIsolationAccuracy."""

    def evaluate_retrieval_fixture(
        self,
        retrieved_ids: List[str],
        relevant_ids: List[str],
        top_k: int = 5
    ) -> Dict[str, float]:
        if not relevant_ids:
            return {"recallAtK": 1.0, "precisionAtK": 1.0 if not retrieved_ids else 0.0, "mrr": 1.0}

        retrieved_top_k = retrieved_ids[:top_k]
        relevant_set = set(relevant_ids)

        hits = [rid for rid in retrieved_top_k if rid in relevant_set]
        recall = len(hits) / float(len(relevant_set))
        precision = len(hits) / float(max(1, len(retrieved_top_k)))

        mrr = 0.0
        for idx, rid in enumerate(retrieved_top_k):
            if rid in relevant_set:
                mrr = 1.0 / (idx + 1)
                break

        return {
            "recallAtK": round(recall, 3),
            "precisionAtK": round(precision, 3),
            "mrr": round(mrr, 3)
        }

    def evaluate_project_isolation(
        self,
        retrieved_items: List[Dict[str, Any]],
        target_project_id: str
    ) -> float:
        if not retrieved_items:
            return 1.0

        valid_count = sum(1 for item in retrieved_items if item.get("projectId") == target_project_id)
        return round(valid_count / float(len(retrieved_items)), 3)
