import os
import unittest
from python.intelligence.providers.model_provider_contract import (
    RealModelProviderHarness,
    RealGeminiProvider,
    discover_gemini_capabilities,
    ProviderState,
)


class TestProviderTelemetryGate(unittest.TestCase):

    def test_real_gemini_execution_and_telemetry(self):
        """Test real Gemini execution when GEMINI_API_KEY is present."""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.skipTest("GEMINI_API_KEY not present in environment")

        harness = RealModelProviderHarness()
        # Test real model call
        res = harness.invoke_model("GeminiProvider", "gemini-3.6-flash", "State 'success' in 2 words.")
        
        self.assertEqual(res.provider, "GeminiProvider")
        self.assertEqual(res.model, "gemini-3.6-flash")
        self.assertEqual(res.status, "HEALTHY")
        self.assertEqual(res.provider_state, ProviderState.HEALTHY.value)
        self.assertEqual(res.http_status, 200)
        self.assertFalse(res.fallback_used)
        self.assertTrue(len(res.output_text) > 0)
        self.assertGreater(res.latency_ms, 0)
        self.assertIn("promptTokenCount", res.usage_metadata)

        # Check serialized dictionary
        d = res.to_dict()
        self.assertEqual(d["status"], "HEALTHY")
        self.assertEqual(d["providerState"], "HEALTHY")
        self.assertEqual(d["httpStatus"], 200)

    def test_capability_discovery_success(self):
        """Test capability discovery against real Gemini API."""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.skipTest("GEMINI_API_KEY not present in environment")

        disc = discover_gemini_capabilities()
        self.assertEqual(disc["provider"], "GeminiProvider")
        self.assertEqual(disc["status"], ProviderState.CAPABILITY_VERIFIED.value)
        self.assertGreater(len(disc["models"]), 0)
        self.assertIn("generateContent", disc["supportedOperations"])

    def test_missing_credential_failure(self):
        """Test explicit failure when API key is missing."""
        provider = RealGeminiProvider()
        res = provider.invoke_model("gemini-3.6-flash", "Hello", api_key="")

        self.assertEqual(res.status, "FAILED")
        self.assertEqual(res.provider_state, ProviderState.CREDENTIAL_MISSING.value)
        self.assertIn("missing", res.error_message.lower())
        self.assertEqual(res.output_text, "")

    def test_invalid_credential_failure(self):
        """Test explicit failure when API key is invalid."""
        provider = RealGeminiProvider()
        res = provider.invoke_model("gemini-3.6-flash", "Hello", api_key="invalid_dummy_key_12345")

        self.assertEqual(res.status, "FAILED")
        self.assertEqual(res.provider_state, ProviderState.AUTHENTICATION_FAILED.value)
        self.assertEqual(res.http_status, 400)
        self.assertIn("HTTP 400", res.error_message)

    def test_unsupported_model_failure(self):
        """Test explicit failure when model name does not exist."""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.skipTest("GEMINI_API_KEY not present in environment")

        provider = RealGeminiProvider()
        res = provider.invoke_model("models/non-existent-gemini-model-xyz-999", "Hello", api_key=api_key)

        self.assertEqual(res.status, "FAILED")
        self.assertEqual(res.provider_state, ProviderState.MODEL_UNAVAILABLE.value)
        self.assertEqual(res.http_status, 404)
        self.assertIn("HTTP 404", res.error_message)

    def test_production_no_silent_fakes(self):
        """Ensure harness never returns silent fake text for GeminiProvider in production mode."""
        harness = RealModelProviderHarness()
        # Even if key is missing, it should return CREDENTIAL_MISSING failure, NOT a fake response string
        res = harness.invoke_model("GeminiProvider", "gemini-3.6-flash", "Hello")
        if not os.environ.get("GEMINI_API_KEY"):
            self.assertEqual(res.status, "FAILED")
            self.assertEqual(res.provider_state, ProviderState.CREDENTIAL_MISSING.value)
            self.assertNotEqual(res.output_text, "Real Gemini execution response for prompt: 'Hello...'")


if __name__ == "__main__":
    unittest.main()
