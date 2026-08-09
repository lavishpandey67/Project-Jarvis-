import unittest
import os
import shutil
import tempfile
import sys

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.devops.build_repair_engine import AutonomousBuildRepairLoop, DevOpsDeploymentEngine
from python.intelligence.code_intel.patch_engine import PatchProposal
from python.intelligence.retrieval.memory_lifecycle import MemoryType

class TestDevOpsBuildRepairSuite(unittest.TestCase):

    def setUp(self):
        self.repair_loop = AutonomousBuildRepairLoop()
        self.devops_engine = DevOpsDeploymentEngine()
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_build_log_diagnostics_parsing(self):
        log_syntax = 'SyntaxError: invalid syntax\n  File "server.py", line 42'
        diag_syn = self.repair_loop.diagnose_error_log(log_syntax)
        self.assertEqual(diag_syn.error_type, "SYNTAX_ERROR")
        self.assertEqual(diag_syn.line_number, 42)
        self.assertEqual(diag_syn.file_path, "server.py")

        log_perm = "PermissionError: [Errno 13] Permission Denied: '/etc/config'"
        diag_perm = self.repair_loop.diagnose_error_log(log_perm)
        self.assertEqual(diag_perm.error_type, "PERMISSION_DENIED")

    def test_autonomous_repair_cycle_success(self):
        target_file = os.path.join(self.temp_dir, "calc.py")
        original_code = "def add(a, b): return a - b"  # Buggy subtraction
        with open(target_file, "w") as f:
            f.write(original_code)

        proposal = PatchProposal("p_fix", target_file, original_code, "def add(a, b): return a + b", "Fix addition bug")

        # Test command function that checks if addition works
        def dummy_test_fn():
            with open(target_file, "r") as f:
                content = f.read()
            if "return a + b" in content:
                return True, "All 5 tests passed cleanly"
            return False, "AssertionError: 2 + 2 != 4\n  File \"calc.py\", line 1"

        res = self.repair_loop.execute_repair_cycle("task_fix_add", proposal, allowed_paths=[self.temp_dir], test_command_fn=dummy_test_fn)
        self.assertEqual(res["status"], "REPAIR_SUCCESSFUL")
        self.assertTrue(res["repaired"])

        # Check LESSON memory recorded
        lessons = self.repair_loop.memory_manager.retrieve_memories(memory_type_filter=MemoryType.LESSON)
        self.assertEqual(len(lessons), 1)
        self.assertIn("Repair Success", lessons[0].title)

    def test_autonomous_repair_cycle_failure_and_rollback(self):
        target_file = os.path.join(self.temp_dir, "db.py")
        original_code = "DB_HOST = 'localhost'"
        with open(target_file, "w") as f:
            f.write(original_code)

        proposal = PatchProposal("p_bad", target_file, original_code, "DB_HOST = 'invalid_host'", "Corrupt host")

        def failing_test_fn():
            return False, "TypeError: Connection refused\n  File \"db.py\", line 1"

        res = self.repair_loop.execute_repair_cycle("task_bad_db", proposal, allowed_paths=[self.temp_dir], test_command_fn=failing_test_fn)
        self.assertEqual(res["status"], "REPAIR_FAILED_ROLLED_BACK")
        self.assertFalse(res["repaired"])
        self.assertTrue(res["rollback"]["rolledBack"])

        # Check original file contents restored
        with open(target_file, "r") as f:
            self.assertEqual(f.read(), original_code)

    def test_devops_deployment_engine_health_check_and_manifest(self):
        manifest = self.devops_engine.generate_dockerfile_manifest()
        self.assertIn("FROM python:3.13-slim", manifest)
        self.assertIn("EXPOSE 3000 8000", manifest)

        health = self.devops_engine.run_system_health_check()
        self.assertEqual(health["overallStatus"], "HEALTHY")
        self.assertEqual(health["components"]["expressApiServer"], "UP")
        self.assertEqual(health["components"]["pythonRpcBridge"], "UP")

if __name__ == "__main__":
    unittest.main()
