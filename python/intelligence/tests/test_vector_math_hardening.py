import unittest
import math
import sys
import os

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.embeddings.engine import (
    DevelopmentFallbackProvider,
    OpenAIEmbeddingProvider,
    GeminiEmbeddingProvider,
    RealProvider,
    sanitize_vector,
    euclidean_distance,
    cosine_similarity,
)

class TestVectorMathHardening(unittest.TestCase):

    def setUp(self):
        self.provider = DevelopmentFallbackProvider(vector_dim=384)

    def test_nan_infinity_rejection(self):
        corrupted_vector = [1.0, float("nan"), float("inf"), float("-inf"), 2.0]
        sanitized = sanitize_vector(corrupted_vector, expected_dim=5)
        self.assertEqual(sanitized, [1.0, 0.0, 0.0, 0.0, 2.0])
        self.assertFalse(any(math.isnan(x) or math.isinf(x) for x in sanitized))

    def test_euclidean_distance(self):
        v1 = [1.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0]
        v3 = [1.0, 0.0, 0.0]

        # Identical vectors -> 0.0 distance
        self.assertAlmostEqual(euclidean_distance(v1, v3), 0.0, places=5)
        # Orthogonal unit vectors -> sqrt(2) ~ 1.41421
        self.assertAlmostEqual(euclidean_distance(v1, v2), math.sqrt(2.0), places=5)

    def test_dimension_mismatch_sanitation(self):
        short_vec = [1.0, 2.0]
        long_vec = [float(i) for i in range(500)]

        clean_short = sanitize_vector(short_vec, expected_dim=384)
        clean_long = sanitize_vector(long_vec, expected_dim=384)

        self.assertEqual(len(clean_short), 384)
        self.assertEqual(len(clean_long), 384)
        self.assertEqual(clean_short[:2], [1.0, 2.0])
        self.assertEqual(clean_short[2:], [0.0] * 382)

    def test_provider_mode_tracking_offline(self):
        real_p = RealProvider(vector_dim=384)
        info = real_p.get_provider_info()
        self.assertEqual(info["provider"], "RealProvider")
        if "OPENAI_API_KEY" not in os.environ and "GEMINI_API_KEY" not in os.environ:
            self.assertEqual(info["mode"], "DEVELOPMENT_FALLBACK")

    def test_openai_and_gemini_fallback(self):
        oai_p = OpenAIEmbeddingProvider(vector_dim=384, api_key="invalid_test_key")
        gem_p = GeminiEmbeddingProvider(vector_dim=384, api_key="invalid_test_key")

        # Must fall back gracefully to DevelopmentFallbackProvider without raising exceptions
        v_oai = oai_p.embed_text("Test fallback behavior")
        v_gem = gem_p.embed_text("Test fallback behavior")

        self.assertEqual(len(v_oai), 384)
        self.assertEqual(len(v_gem), 384)
        self.assertTrue(all(isinstance(x, float) and not (math.isnan(x) or math.isinf(x)) for x in v_oai))

if __name__ == "__main__":
    unittest.main()
