import re
from typing import List, Dict, Any, Optional

class SemanticEvaluationEngine:
    """
    Python Evaluation Engine providing claim extraction, evidence matching,
    semantic constraint verification, and contradiction detection.
    """

    CONTRADICTION_KEYWORDS = [
        "not", "never", "no", "cannot", "failed", "broken",
        "contradicts", "opposite", "invalid", "rejected", "false"
    ]

    def extract_claims(self, text: str) -> List[Dict[str, Any]]:
        """Extracts factual claim sentences from unstructured model text."""
        sentences = [s.strip() for s in re.split(r'[.!\n]+', text) if len(s.strip()) > 10]
        claims = []
        for idx, sentence in enumerate(sentences):
            # Categorize claim type
            has_code = bool(re.search(r'export|function|interface|const|let|import|class', sentence))
            has_metric = bool(re.search(r'\d+%|\$\d+|\d+\s*(ms|seconds|users|token)', sentence))
            
            claims.append({
                "claimId": f"claim_{idx+1}",
                "text": sentence,
                "type": "TECHNICAL_CODE" if has_code else ("METRIC_EMPIRICAL" if has_metric else "GENERAL_STATEMENT"),
                "hasCode": has_code,
                "hasMetric": has_metric,
            })
        return claims

    def evaluate_output(
        self,
        output_text: str,
        context_memories: List[Dict[str, Any]],
        constraints: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Evaluates output text for factual grounding, evidence alignment, and constraint satisfaction.
        """
        claims = self.extract_claims(output_text)
        constraints = constraints or []
        
        evidence_matches = []
        grounded_claims_count = 0

        # Build context search text
        context_corpus = " ".join([f"{m.get('title', '')} {m.get('content', '')}" for m in context_memories]).lower()

        for claim in claims:
            # Check overlap with context corpus
            claim_words = set(re.findall(r'\w+', claim["text"].lower()))
            if not claim_words:
                continue

            matches_in_context = [w for w in claim_words if w in context_corpus and len(w) > 3]
            overlap_ratio = len(matches_in_context) / max(1, len(claim_words))

            is_grounded = overlap_ratio >= 0.25 or claim["hasCode"]
            if is_grounded:
                grounded_claims_count += 1

            evidence_matches.append({
                "claimId": claim["claimId"],
                "claimText": claim["text"],
                "overlapRatio": round(overlap_ratio, 3),
                "isGrounded": is_grounded
            })

        # Check Contradiction Signals
        contradiction_found = False
        contradiction_details = []
        output_lower = output_text.lower()
        for kw in self.CONTRADICTION_KEYWORDS:
            if f" {kw} " in output_lower and "contradict" in output_lower:
                contradiction_found = True
                contradiction_details.append(f"Contradiction keyword '{kw}' detected in claim context.")

        # Constraint Checks
        constraint_violations = []
        for constr in constraints:
            constr_lower = constr.lower()
            if "type safety" in constr_lower or "typescript" in constr_lower:
                if not re.search(r'\b(interface|type|class|export|enum)\b', output_text):
                    constraint_violations.append(f"Violates constraint '{constr}': Missing TypeScript interfaces/type definitions.")
            if "factual grounding" in constr_lower or "evidence" in constr_lower:
                if len(context_memories) > 0 and grounded_claims_count == 0:
                    constraint_violations.append(f"Violates constraint '{constr}': Output lacks grounded evidence from provided context.")

        grounding_score = grounded_claims_count / max(1, len(claims))
        overall_confidence = min(1.0, max(0.0, grounding_score * 0.7 + (0.3 if not constraint_violations else 0.0)))

        return {
            "totalClaims": len(claims),
            "groundedClaims": grounded_claims_count,
            "groundingScore": round(grounding_score, 3),
            "evidenceMatches": evidence_matches,
            "hasContradiction": contradiction_found,
            "contradictionDetails": contradiction_details,
            "constraintViolations": constraint_violations,
            "passed": len(constraint_violations) == 0 and not contradiction_found,
            "confidence": round(overall_confidence, 3),
        }
