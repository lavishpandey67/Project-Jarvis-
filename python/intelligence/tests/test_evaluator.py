import unittest
from python.intelligence.evaluation.evaluator import SemanticEvaluationEngine

class TestSemanticEvaluator(unittest.TestCase):

    def setUp(self):
        self.evaluator = SemanticEvaluationEngine()
        self.memories = [
            {"title": "PostgreSQL Architecture", "content": "Uses PostgreSQL database with Drizzle ORM."}
        ]

    def test_claim_extraction(self):
        text = "We built the AI Lead System. export interface LeadRecord { id: string; } The throughput is 5000 users/sec."
        claims = self.evaluator.extract_claims(text)
        self.assertGreaterEqual(len(claims), 2)
        has_code_claim = any(c["hasCode"] for c in claims)
        self.assertTrue(has_code_claim)

    def test_evaluation_output_passing(self):
        text = "export interface LeadRecord { id: string; } Uses PostgreSQL database for persistence."
        res = self.evaluator.evaluate_output(
            output_text=text,
            context_memories=self.memories,
            constraints=["Strict type safety"]
        )
        self.assertTrue(res["passed"])
        self.assertGreaterEqual(res["confidence"], 0.7)

    def test_constraint_violation(self):
        text = "Just a plain text response with no code or types."
        res = self.evaluator.evaluate_output(
            output_text=text,
            context_memories=self.memories,
            constraints=["Strict type safety"]
        )
        self.assertFalse(res["passed"])
        self.assertGreater(len(res["constraintViolations"]), 0)

if __name__ == "__main__":
    unittest.main()
