import time
from typing import List, Dict, Any, Optional

from python.intelligence.retrieval.memory_lifecycle import MemoryLifecycleManager, MemoryType, MemoryProvenance
from python.intelligence.evaluation.grounding import GroundingEngine, EvidenceState

class DeepCognitiveState:
    """Manages persistent cognitive state: goals, beliefs, uncertainty, provenance, and decision history."""

    def __init__(self, memory_manager: Optional[MemoryLifecycleManager] = None):
        self.memory_manager = memory_manager or MemoryLifecycleManager()
        self.identity = "JARVIS Autonomous Cognitive Workforce"
        self.active_goals: List[str] = [
            "Maintain 100% verified repository safety",
            "Enforce strict provenance separation between PERSONAL_MEMORY and WORLD_KNOWLEDGE",
            "Refuse ungrounded claims with explicit UNKNOWN state"
        ]
        self.beliefs: Dict[str, float] = {
            "HNSW ANN indexing is required beyond 5,000 chunks": 0.98,
            "Pre-modification SHA-256 snapshots prevent permanent file corruption": 0.99
        }
        self.uncertainty_level: float = 0.10
        self.refusal_count: int = 0
        self.decision_history: List[Dict[str, Any]] = []

    def record_decision(self, task_id: str, decision_type: str, details: Dict[str, Any]):
        self.decision_history.append({
            "taskId": task_id,
            "type": decision_type,
            "details": details,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })

    def evaluate_grounded_answer(self, query: str, evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Evaluates evidence grounding ratio and returns explicit refusal notice when evidence is missing."""
        if not evidence_items:
            self.uncertainty_level = 0.95
            self.refusal_count += 1
            refusal_msg = f"UNKNOWN: Insufficient evidence available in cognitive memory to ground query '{query}'."
            
            self.record_decision("grounding_eval", "EXPLICIT_REFUSAL", {"query": query, "reason": "No evidence retrieved"})
            
            return {
                "evidenceState": EvidenceState.UNKNOWN,
                "uncertaintyLevel": self.uncertainty_level,
                "grounded": False,
                "answer": refusal_msg,
                "refusalNotice": refusal_msg
            }

        # Calculate grounding score
        grounding_score = sum(item.get("score", 0.5) for item in evidence_items) / max(1, len(evidence_items))
        if grounding_score < 0.25:
            self.uncertainty_level = 0.85
            self.refusal_count += 1
            refusal_msg = f"UNKNOWN: Evidence grounding score ({grounding_score:.2f}) below threshold 0.25."
            return {
                "evidenceState": EvidenceState.UNKNOWN,
                "uncertaintyLevel": self.uncertainty_level,
                "grounded": False,
                "answer": refusal_msg,
                "refusalNotice": refusal_msg
            }

        self.uncertainty_level = round(max(0.05, 1.0 - grounding_score), 2)
        state = EvidenceState.KNOWN if grounding_score >= 0.70 else EvidenceState.INFERRED

        return {
            "evidenceState": state,
            "uncertaintyLevel": self.uncertainty_level,
            "grounded": True,
            "groundingScore": round(grounding_score, 3),
            "refusalNotice": None
        }
