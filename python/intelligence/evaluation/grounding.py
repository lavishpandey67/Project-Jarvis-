import re
from typing import List, Dict, Any

class EvidenceState:
    KNOWN = "KNOWN"
    INFERRED = "INFERRED"
    UNCERTAIN = "UNCERTAIN"
    UNKNOWN = "UNKNOWN"
    CONTRADICTED = "CONTRADICTED"

class GroundingEngine:
    """Evaluates evidence grounding and returns explicit EvidenceState."""

    def evaluate_grounding(
        self,
        query: str,
        retrieved_items: List[Dict[str, Any]],
        generated_answer: str = ""
    ) -> Dict[str, Any]:
        if not retrieved_items:
            return {
                "state": EvidenceState.UNKNOWN,
                "groundingScore": 0.0,
                "confidence": 0.0,
                "reason": "No evidence records retrieved matching query.",
                "refusalNotice": f"UNKNOWN: Insufficient evidence available in cognitive memory to answer query '{query}'."
            }

        # Calculate evidence overlap
        query_words = set(re.findall(r'\w+', query.lower()))
        matched_items = 0
        total_score = 0.0

        for item in retrieved_items:
            content = str(item.get("payload", {}).get("content") or item.get("content") or "").lower()
            score = item.get("score") or item.get("compositeScore") or 0.0
            content_words = set(re.findall(r'\w+', content))
            overlap = len(query_words.intersection(content_words)) / max(1, len(query_words))
            if overlap >= 0.2:
                matched_items += 1
            total_score += float(score)

        avg_score = total_score / max(1, len(retrieved_items))

        if matched_items == 0 or avg_score < 0.25:
            state = EvidenceState.UNKNOWN
        elif avg_score >= 0.70 and matched_items >= 1:
            state = EvidenceState.KNOWN
        elif avg_score >= 0.45:
            state = EvidenceState.INFERRED
        else:
            state = EvidenceState.UNCERTAIN

        return {
            "state": state,
            "groundingScore": round(avg_score, 3),
            "matchedItemsCount": matched_items,
            "totalItemsEvaluated": len(retrieved_items),
            "confidence": round(min(1.0, avg_score * 1.1), 3),
            "reason": f"Grounding score {avg_score:.2f} with {matched_items} matched evidence items.",
            "refusalNotice": f"UNKNOWN: Insufficient evidence to ground claim." if state == EvidenceState.UNKNOWN else None
        }
