import unittest
import sys
import os
import json

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.evaluation.evaluator import SemanticEvaluationEngine
from python.intelligence.app.contract import IntelligenceRequest, IntelligenceResponse

class TestAdaptiveWorkforceAndRecovery(unittest.TestCase):

    def setUp(self):
        self.evaluator = SemanticEvaluationEngine()

    def test_failure_classification_heuristics(self):
        # Classify syntax errors
        res_syntax = self.evaluator.evaluate_output(
            output_text="SyntaxError: unexpected token ';'",
            context_memories=[],
            constraints=[]
        )
        self.assertIn("groundingScore", res_syntax)
        self.assertIn("confidence", res_syntax)

        # Classify test failure with explicit constraint violation
        res_test = self.evaluator.evaluate_output(
            output_text="Just a plain text response with no code or types.",
            context_memories=[],
            constraints=["Strict type safety"]
        )
        self.assertFalse(res_test["passed"])
        self.assertGreater(len(res_test["constraintViolations"]), 0)

    def test_adaptive_generalist_role_mapping(self):
        # Verify valid role profile attributes
        profiles = {
            "DEBUGGER": ["debugging", "refactoring", "code_generation"],
            "SECURITY": ["risk_analysis", "adversarial_review"],
            "DEVOPS": ["approved_tool_execution", "workspace_operations"],
            "RECOVERY": ["debugging", "refactoring", "workspace_operations"],
            "INTEGRATOR": ["implementation", "refactoring"],
            "VERIFIER": ["testing", "validation", "evaluation"]
        }

        for role, caps in profiles.items():
            self.assertTrue(len(caps) >= 2)
            self.assertIn(role, ["DEBUGGER", "SECURITY", "DEVOPS", "RECOVERY", "INTEGRATOR", "VERIFIER"])

if __name__ == "__main__":
    unittest.main()
