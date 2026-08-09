import unittest
import sys
import os

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.retrieval.memory_lifecycle import (
    MemoryLifecycleManager,
    CognitiveMemoryRecord,
    MemoryType,
    MemoryProvenance
)
from python.intelligence.retrieval.vector_store import (
    HNSWSimulatedIndexVectorStore,
    PgVectorStoreAdapter,
    VectorRecord
)
from python.intelligence.embeddings.engine import DevelopmentFallbackProvider, sanitize_vector

class TestCoreRAGAndMemorySuite(unittest.TestCase):

    def setUp(self):
        self.lifecycle = MemoryLifecycleManager()
        self.hnsw_store = HNSWSimulatedIndexVectorStore(vector_dim=384, num_buckets=16)
        self.pg_adapter = PgVectorStoreAdapter(vector_dim=384)
        self.provider = DevelopmentFallbackProvider(vector_dim=384)

    def test_memory_lifecycle_ingest_and_provenance_guard(self):
        mem_personal = CognitiveMemoryRecord(
            memory_id="mem_p1",
            memory_type=MemoryType.PERSONAL,
            title="User Goal",
            content="User prefers Python for data processing.",
            project_id="proj_core",
            provenance=MemoryProvenance.PERSONAL_MEMORY
        )
        ok1, msg1, record1 = self.lifecycle.ingest_memory(mem_personal)
        self.assertTrue(ok1)

        # Attempt to overwrite exact same content with WORLD_KNOWLEDGE provenance
        mem_world = CognitiveMemoryRecord(
            memory_id="mem_w1",
            memory_type=MemoryType.WORLD_KNOWLEDGE,
            title="User Goal",
            content="User prefers Python for data processing.",
            project_id="proj_core",
            provenance=MemoryProvenance.WORLD_KNOWLEDGE
        )
        ok2, msg2, record2 = self.lifecycle.ingest_memory(mem_world)
        self.assertFalse(ok2)
        self.assertIn("Provenance Guard Violation", msg2)
        self.assertEqual(record2.provenance, MemoryProvenance.PERSONAL_MEMORY)

    def test_memory_deduplication_and_consolidation(self):
        mem1 = CognitiveMemoryRecord("m1", MemoryType.SEMANTIC, "Fact A", "PostgreSQL pgvector extension", "p1")
        mem2 = CognitiveMemoryRecord("m2", MemoryType.SEMANTIC, "Fact A", "PostgreSQL pgvector extension", "p1")

        self.lifecycle.ingest_memory(mem1)
        ok2, msg2, rec2 = self.lifecycle.ingest_memory(mem2)

        self.assertTrue(ok2)
        self.assertIn("Deduplicated", msg2)
        self.assertEqual(rec2.memory_id, "m1")

        # Consolidate working memory
        consolidated = self.lifecycle.consolidate_working_memory("task_101", "Task Summary", "Completed task 101 successfully.", "p1")
        self.assertEqual(consolidated.memory_type, MemoryType.EPISODIC)

    def test_memory_deletion_and_isolation(self):
        mem = CognitiveMemoryRecord("m_del", MemoryType.WORKING, "Temp Note", "Temporary scratch buffer", "p1")
        self.lifecycle.ingest_memory(mem)

        # Isolation query
        p1_mems = self.lifecycle.retrieve_memories(project_id="p1")
        p2_mems = self.lifecycle.retrieve_memories(project_id="p2")
        self.assertEqual(len(p1_mems), 1)
        self.assertEqual(len(p2_mems), 0)

        # Explicit deletion
        deleted_ok = self.lifecycle.delete_memory("m_del")
        self.assertTrue(deleted_ok)
        p1_mems_after = self.lifecycle.retrieve_memories(project_id="p1")
        self.assertEqual(len(p1_mems_after), 0)

    def test_hnsw_ann_vector_store_health_and_query(self):
        vec1 = self.provider.embed_text("HNSW vector search index")
        rec1 = VectorRecord("r1", vec1, {"title": "Doc 1"}, project_id="p_hnsw")
        self.hnsw_store.upsert([rec1])

        health = self.hnsw_store.health()
        self.assertEqual(health["status"], "healthy")
        self.assertEqual(health["mode"], "HNSW_SIMULATED_ANN")
        self.assertEqual(health["indexConfig"]["indexType"], "HNSW")

        results = self.hnsw_store.similarity_search(vec1, top_k=5, project_id="p_hnsw")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["recordId"], "r1")

    def test_failure_injection_corrupt_metadata_and_malformed_vector(self):
        bad_vector = [float("nan"), float("inf"), 1.5, None]
        clean_v = sanitize_vector(bad_vector, expected_dim=384)
        self.assertEqual(len(clean_v), 384)
        self.assertEqual(clean_v[0], 0.0)
        self.assertEqual(clean_v[1], 0.0)
        self.assertEqual(clean_v[2], 1.5)

        # Ingest memory with empty content should fail safely
        bad_mem = CognitiveMemoryRecord("bad", MemoryType.SEMANTIC, "", "", "p1")
        ok, msg, rec = self.lifecycle.ingest_memory(bad_mem)
        self.assertFalse(ok)
        self.assertIn("Validation Error", msg)

if __name__ == "__main__":
    unittest.main()
