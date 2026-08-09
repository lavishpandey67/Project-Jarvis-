import unittest
import os
import shutil
import tempfile
import sys

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.pipeline.orchestrator import EndToEndIntelligenceOrchestrator
from python.intelligence.code_intel.patch_engine import PatchProposal
from python.intelligence.evaluation.grounding import EvidenceState
from python.intelligence.retrieval.memory_lifecycle import CognitiveMemoryRecord, MemoryType, MemoryProvenance

class TestEndToEndIntelligencePipeline(unittest.TestCase):

    def setUp(self):
        self.orchestrator = EndToEndIntelligenceOrchestrator(vector_dim=384)
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_web_to_world_knowledge_rag_pipeline(self):
        res = self.orchestrator.process_web_to_knowledge_rag("PostgreSQL vector index", "proj_pipeline")
        self.assertEqual(res["projectId"], "proj_pipeline")
        self.assertGreater(res["webEvidenceRetrieved"], 0)
        self.assertGreater(res["memoriesIngested"], 0)
        self.assertGreater(res["vectorCandidatesRetrieved"], 0)
        self.assertIn(res["groundingState"], [EvidenceState.KNOWN, EvidenceState.INFERRED, EvidenceState.UNCERTAIN, EvidenceState.UNKNOWN])
        self.assertIn("totalPipelineMs", res["latencyMetrics"])

    def test_grounding_unknown_refusal_for_unsupported_query(self):
        # Query with empty results
        res = self.orchestrator.grounding_engine.evaluate_grounding("Unobtainium quantum fusion 9000", [])
        self.assertEqual(res["state"], EvidenceState.UNKNOWN)
        self.assertIsNotNone(res["refusalNotice"])
        self.assertIn("UNKNOWN: Insufficient evidence", res["refusalNotice"])

    def test_provenance_isolation_web_versus_personal(self):
        # 1. Ingest Personal Memory
        mem_p = CognitiveMemoryRecord("p_user", MemoryType.PERSONAL, "Goal", "User loves Python", "proj_core", provenance=MemoryProvenance.PERSONAL_MEMORY)
        ok1, msg1, _ = self.orchestrator.memory_lifecycle.ingest_memory(mem_p)
        self.assertTrue(ok1)

        # 2. Attempt to overwrite with Web World Knowledge
        mem_w = CognitiveMemoryRecord("w_web", MemoryType.WORLD_KNOWLEDGE, "Goal", "User loves Python", "proj_core", provenance=MemoryProvenance.WORLD_KNOWLEDGE)
        ok2, msg2, rec2 = self.orchestrator.memory_lifecycle.ingest_memory(mem_w)
        self.assertFalse(ok2)
        self.assertIn("Provenance Guard Violation", msg2)
        self.assertEqual(rec2.provenance, MemoryProvenance.PERSONAL_MEMORY)

    def test_verified_patch_execution_and_automated_rollback(self):
        target_file = os.path.join(self.temp_dir, "server.py")
        original_code = "def start(): print('v1')"
        with open(target_file, "w") as f:
            f.write(original_code)

        proposal = PatchProposal("p_srv", target_file, original_code, "def start(): print('v2-corrupted')", "Buggy patch")

        # Snapshot & Apply -> Failed test verification -> Rollback
        res = self.orchestrator.execute_verified_patch_workflow(
            snapshot_id="snap_srv",
            proposal=proposal,
            allowed_paths=[self.temp_dir],
            test_passed=False
        )

        self.assertEqual(res["status"], "ROLLED_BACK")
        self.assertTrue(res["rolledBack"])

        # Check original file contents restored
        with open(target_file, "r") as f:
            self.assertEqual(f.read(), original_code)

    def test_failure_injection_unauthorized_path_patch(self):
        target_file = os.path.join(self.temp_dir, "secret.py")
        with open(target_file, "w") as f:
            f.write("SECRET_KEY = '12345'")

        proposal = PatchProposal("p_sec", target_file, "SECRET_KEY = '12345'", "SECRET_KEY = 'HACKED'", "Malicious edit")

        # Path outside allowed boundary should be rejected immediately
        res = self.orchestrator.execute_verified_patch_workflow(
            snapshot_id="snap_sec",
            proposal=proposal,
            allowed_paths=["/some/unrelated/path"],
            test_passed=True
        )

        self.assertEqual(res["status"], "APPLY_REJECTED")
        self.assertIn("Permission Denied", res["message"])

        # Check file untouched
        with open(target_file, "r") as f:
            self.assertEqual(f.read(), "SECRET_KEY = '12345'")

if __name__ == "__main__":
    unittest.main()
