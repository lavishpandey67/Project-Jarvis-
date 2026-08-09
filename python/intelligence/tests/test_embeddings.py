import unittest
from python.intelligence.embeddings.engine import DevelopmentFallbackProvider, RealProvider, cosine_similarity

class TestEmbeddings(unittest.TestCase):

    def setUp(self):
        self.provider = DevelopmentFallbackProvider(vector_dim=384)

    def test_embedding_dimension(self):
        vec = self.provider.embed_text("AI Lead Operations System Architecture")
        self.assertEqual(len(vec), 384)

    def test_embedding_determinism(self):
        vec1 = self.provider.embed_text("PostgreSQL database connection pool")
        vec2 = self.provider.embed_text("PostgreSQL database connection pool")
        self.assertEqual(vec1, vec2)

    def test_cosine_similarity_identical(self):
        vec = self.provider.embed_text("Event-driven lead ingestion pipeline")
        sim = cosine_similarity(vec, vec)
        self.assertAlmostEqual(sim, 1.0, places=4)

    def test_cosine_similarity_orthogonal(self):
        v1 = [1.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0]
        self.assertAlmostEqual(cosine_similarity(v1, v2), 0.0, places=4)

    def test_cosine_similarity_opposite(self):
        v1 = [1.0, 0.0, 0.0]
        v2 = [-1.0, 0.0, 0.0]
        self.assertAlmostEqual(cosine_similarity(v1, v2), -1.0, places=4)

    def test_cosine_similarity_zero_vector(self):
        v1 = [0.0, 0.0, 0.0]
        v2 = [1.0, 2.0, 3.0]
        self.assertEqual(cosine_similarity(v1, v2), 0.0)

    def test_vector_normalization(self):
        vec = self.provider.embed_text("System vector normalization check")
        sum_sq = sum(x * x for x in vec)
        self.assertAlmostEqual(sum_sq, 1.0, places=4)

    def test_batch_embedding(self):
        batch = ["Lead scoring engine", "CRM webhook endpoint", "PostgreSQL schema"]
        vecs = self.provider.embed_batch(batch)
        self.assertEqual(len(vecs), 3)
        self.assertEqual(len(vecs[0]), 384)

    def test_real_provider_fallback(self):
        real_p = RealProvider(vector_dim=384)
        info = real_p.get_provider_info()
        self.assertEqual(info["mode"], "DEVELOPMENT_FALLBACK")
        vec = real_p.embed_text("Test fallback behavior")
        self.assertEqual(len(vec), 384)

if __name__ == "__main__":
    unittest.main()
