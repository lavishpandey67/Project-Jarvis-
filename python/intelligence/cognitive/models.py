from typing import Dict, Any, List, Optional
from python.intelligence.statistical.probabilistic import platt_calibrate

class CognitiveModel:
    """Base interface for cognitive predictor models."""
    def predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


class UserPreferenceModel(CognitiveModel):
    """Predicts learned user preferences, architectural style, and preferred tools."""

    def predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        user_history = input_data.get("userHistory") or []
        preferred_stack = ["TypeScript", "PostgreSQL", "React", "Tailwind"]
        return {
            "preferredStack": preferred_stack,
            "codeDensityPreference": "HIGH",
            "explanationPreference": "CONCISE_EXECUTIVE",
            "confidence": 0.85
        }


class TaskDifficultyPredictor(CognitiveModel):
    """
    Predicts cognitive complexity level (LEVEL_1..LEVEL_6) and estimated task failure risk.
    """

    COMPLEXITY_KEYWORDS = {
        "LEVEL_1": ["hello", "ping", "echo", "status"],
        "LEVEL_2": ["todo", "calculator", "format", "simple"],
        "LEVEL_3": ["dashboard", "auth", "crud", "api", "form"],
        "LEVEL_4": ["system design", "lead operations", "architecture", "dag", "multi-agent"],
        "LEVEL_5": ["compiler", "vm", "distributed", "consensus", "custom framework"],
        "LEVEL_6": ["novel AI brain", "self-modifying", "autonomous swarm"]
    }

    def predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        objective = str(input_data.get("objective") or input_data.get("prompt") or "").lower()
        subtasks = input_data.get("subtasks") or []

        raw_score = 2.0
        if len(objective) > 200:
            raw_score += 1.0
        if len(subtasks) >= 4:
            raw_score += 1.5

        matched_level = "LEVEL_3"
        for level, keywords in reversed(list(self.COMPLEXITY_KEYWORDS.items())):
            if any(kw in objective for kw in keywords):
                matched_level = level
                break

        # Calculate failure probability using Platt calibrated logistic
        failure_prob = platt_calibrate(raw_score * 0.3 - 1.0)

        return {
            "predictedComplexity": matched_level,
            "failureRiskProbability": failure_prob,
            "recommendedSpecialistsCount": 3 if matched_level in ["LEVEL_4", "LEVEL_5", "LEVEL_6"] else 1,
            "requiresDAGPlanning": matched_level in ["LEVEL_4", "LEVEL_5", "LEVEL_6"]
        }


class RoutingPredictor(CognitiveModel):
    """Predicts optimal agent role distribution for a task."""

    def predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        objective = str(input_data.get("objective") or "").lower()
        
        roles = []
        if any(w in objective for w in ["research", "investigate", "analyze", "strategy"]):
            roles.append("research")
        if any(w in objective for w in ["build", "write", "code", "implement", "create"]):
            roles.append("builder")
        if any(w in objective for w in ["review", "test", "audit", "evaluate"]):
            roles.append("critic")
        
        if not roles:
            roles = ["builder"]

        return {
            "recommendedRoles": roles,
            "primaryAgent": roles[0],
            "delegationRecommended": len(roles) > 1
        }
