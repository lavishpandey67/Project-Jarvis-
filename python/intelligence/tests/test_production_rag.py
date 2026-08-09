import unittest
import sys
import os

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.retrieval.ingestion import DocumentChunker, IngestionPipeline
from python.intelligence.retrieval.vector_store import DevelopmentVectorStore, PgVectorStoreAdapter, VectorRecord
from python.intelligence.evaluation.grounding import GroundingEngine, EvidenceState
from python.intelligence.evaluation.rag_eval import RAGEvaluator
from python.intelligence.embeddings.engine import DevelopmentFallbackProvider, cosine_similarity

class TestProductionRAGFoundation(unittest.TestCase):

    def setUp(self):
        self.chunker = DocumentChunker(chunk_size=200, chunk_overlap=30)
        self.pipeline = IngestionPipeline(chunker=self.chunker)
        self.store = DevelopmentVectorStore(vector_dim=384)
        self.adapter = PgVectorStoreAdapter(vector_dim=384)
        self.grounding = GroundingEngine()
        self.evaluator = RAGEvaluator()
        self.provider = DevelopmentFallbackProvider(vector_dim=384)

    def test_document_chunking_and_deduplication(self):
        doc_text = "# Overview\nPostgreSQL vector database indexing.\n# Architecture\npgvector IVFFlat index tuning."
        chunks1 = self.pipeline.process_document("doc_1", "Guide", doc_text, "proj_db")
        self.assertGreater(len(chunks1), 0)

        # Duplicate ingestion pass should return 0 new chunks
        chunks2 = self.pipeline.process_document("doc_1", "Guide", doc_text, "proj_db")
        self.assertEqual(len(chunks2), 0)

    def test_vector_store_crud_and_similarity_search(self):
        vec_a = self.provider.embed_text("PostgreSQL database index")
        vec_b = self.provider.embed_text("Pancake recipe with flour")

        rec_a = VectorRecord("rec_a", vec_a, {"content": "PostgreSQL database index"}, project_id="proj_db")
        rec_b = VectorRecord("rec_b", vec_b, {"content": "Pancake recipe with flour"}, project_id="proj_cooking")

        self.store.upsert([rec_a, rec_b])
        self.assertEqual(self.store.count(), 2)

        # Similarity search with project isolation
        results = self.store.similarity_search(vec_a, top_k=5, project_id="proj_db")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["recordId"], "rec_a")

    def test_pgvector_adapter_honest_classification(self):
        health = self.adapter.health()
        self.assertEqual(health["status"], "healthy")
        self.assertEqual(health["mode"], "SERIALIZED_TEXT_FALLBACK")

    def test_grounding_engine_unknown_detection(self):
        # Empty evidence should return UNKNOWN
        res = self.grounding.evaluate_grounding("What is quantum computing?", [])
        self.assertEqual(res["state"], EvidenceState.UNKNOWN)
        self.assertIsNotNone(res["refusalNotice"])

    def test_rag_evaluator_metrics(self):
        retrieved = ["doc_1", "doc_2", "doc_3"]
        relevant = ["doc_1", "doc_4"]
        metrics = self.evaluator.evaluate_retrieval_fixture(retrieved, relevant, top_k=3)
        self.assertEqual(metrics["recallAtK"], 0.5)
        self.assertEqual(metrics["mrr"], 1.0)

    def test_failure_injection_dimension_mismatch(self):
        # Mismatched dimension vector (dimension 50 vs store dimension 384)
        bad_vec = [1.0] * 50
        rec = VectorRecord("rec_bad", bad_vec, {"content": "Bad dim"}, project_id="proj_x")
        self.store.upsert([rec])
        fetched = self.store.get("rec_bad")
        self.assertEqual(len(fetched.vector), 384)

if __name__ == "__main__":
    unittest.main()
