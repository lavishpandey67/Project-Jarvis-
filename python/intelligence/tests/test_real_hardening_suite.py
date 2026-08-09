import unittest
import os
import sys

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.providers.model_provider_contract import RealModelProviderHarness, ModelExecutionResult
from python.intelligence.cognitive.deep_cognition import DeepCognitiveState
from python.intelligence.evaluation.grounding import EvidenceState

class TestRealHardeningSuite(unittest.TestCase):

    def setUp(self):
        self.harness = RealModelProviderHarness()
        self.cognition = DeepCognitiveState()

    def test_model_provider_contract_metadata(self):
        res = self.harness.invoke_model("OpenAIProvider", "gpt-4o", "Synthesize summary")
        self.assertIsNotNone(res.request_id)
        self.assertIn("req_", res.request_id)
        self.assertGreater(res.latency_ms, 0.0)
        self.assertGreater(res.total_tokens, 0)
        self.assertIsNotNone(res.status)

    def test_model_provider_fallback_handling(self):
        # Force missing credentials
        old_key = os.environ.get("OPENAI_API_KEY")
        if "OPENAI_API_KEY" in os.environ:
            del os.environ["OPENAI_API_KEY"]

        res = self.harness.invoke_model("OpenAIProvider", "gpt-4o", "Test fallback path")
        self.assertEqual(res.status, "BLOCKED_CREDENTIALS_MISSING")
        self.assertTrue(res.fallback_used)
        self.assertEqual(res.provider, "LocalDeterministicSynthesis")

        if old_key:
            os.environ["OPENAI_API_KEY"] = old_key

    def test_deep_cognitive_state_and_refusal(self):
        # Empty evidence items should trigger explicit UNKNOWN refusal
        res = self.cognition.evaluate_grounded_answer("What is quantum fusion?", [])
        self.assertEqual(res["evidenceState"], EvidenceState.UNKNOWN)
        self.assertEqual(res["uncertaintyLevel"], 0.95)
        self.assertIsNotNone(res["refusalNotice"])
        self.assertEqual(self.cognition.refusal_count, 1)

    def test_exact_reality_status_classification(self):
        res_grounded = self.cognition.evaluate_grounded_answer("Valid query", [{"score": 0.85}])
        self.assertEqual(res_grounded["evidenceState"], EvidenceState.KNOWN)
        self.assertLess(res_grounded["uncertaintyLevel"], 0.30)

if __name__ == "__main__":
    unittest.main()
