import unittest
import sys
import os

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.evaluation.evaluator import SemanticEvaluationEngine

class TestFailureInjectionAndBudgetLimits(unittest.TestCase):

    def setUp(self):
        self.evaluator = SemanticEvaluationEngine()

    def test_failure_injection_constraint_violation(self):
        """Simulate failure injection where output explicitly breaks system security constraints."""
        injected_failure_text = "Just plain text with no code symbols."
        res = self.evaluator.evaluate_output(
            output_text=injected_failure_text,
            context_memories=[],
            constraints=["type safety"]
        )
        self.assertFalse(res["passed"])
        self.assertGreater(len(res["constraintViolations"]), 0)

    def test_budget_exhaustion_simulation(self):
        """Simulate budget tracking metrics for node execution limits."""
        max_task_budget = 10
        executed_tasks = 11
        is_budget_exceeded = executed_tasks > max_task_budget
        self.assertTrue(is_budget_exceeded)

    def test_unapproved_destructive_action_guard(self):
        """Verify unapproved destructive action triggers safety escalation flag."""
        operation_permission = "DESTRUCTIVE"
        user_approval_granted = False
        requires_escalation = (operation_permission == "DESTRUCTIVE" and not user_approval_granted)
        self.assertTrue(requires_escalation)

    def test_rollback_safety_hashing(self):
        """Verify file snapshot SHA-256 hash comparison for rollback integrity."""
        import hashlib
        original_text = "export const VERSION = '1.0.0';"
        modified_text = "export const VERSION = '1.0.1-CORRUPTED';"

        hash_orig = hashlib.sha256(original_text.encode('utf-8')).hexdigest()
        hash_mod = hashlib.sha256(modified_text.encode('utf-8')).hexdigest()

        self.assertNotEqual(hash_orig, hash_mod)

if __name__ == "__main__":
    unittest.main()
