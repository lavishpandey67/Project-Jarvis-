import unittest
import os
import shutil
import tempfile
import sys

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.code_intel.ast_engine import PolyglotASTEngine, ASTSymbol
from python.intelligence.code_intel.codebase_graph import CodebaseGraph
from python.intelligence.code_intel.patch_engine import VerifiedPatchSafetyEngine, PatchProposal

class TestCodeIntelligenceAndPatchSuite(unittest.TestCase):

    def setUp(self):
        self.ast_engine = PolyglotASTEngine()
        self.graph = CodebaseGraph()
        self.patch_engine = VerifiedPatchSafetyEngine()
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_language_detection_and_repository_scanning(self):
        ts_file = os.path.join(self.temp_dir, "test.ts")
        py_file = os.path.join(self.temp_dir, "test.py")

        with open(ts_file, "w") as f:
            f.write("export class TestClass { run() {} }")
        with open(py_file, "w") as f:
            f.write("def test_function(): pass")

        discovered = self.ast_engine.scan_repository(self.temp_dir)
        self.assertEqual(len(discovered), 2)
        langs = {d["language"] for d in discovered}
        self.assertIn("TypeScript", langs)
        self.assertIn("Python", langs)

    def test_polyglot_ast_symbol_parsing(self):
        ts_code = "export class Engine {}\nexport interface Config {}\nimport { client } from 'pythonBridge';"
        syms_ts = self.ast_engine.parse_symbols("engine.ts", ts_code)
        self.assertGreaterEqual(len(syms_ts), 2)
        names = {s.name for s in syms_ts}
        self.assertIn("Engine", names)
        self.assertIn("Config", names)

        py_code = "class EngineRunner:\n    def execute(self):\n        pass"
        syms_py = self.ast_engine.parse_symbols("engine.py", py_code)
        self.assertGreaterEqual(len(syms_py), 2)
        py_names = {s.name for s in syms_py}
        self.assertIn("EngineRunner", py_names)
        self.assertIn("execute", py_names)

    def test_codebase_graph_building_and_cross_language_boundaries(self):
        res = self.graph.build_graph_from_repository(self.ast_engine, "/root/Project-Jarvis-/python/intelligence/")
        self.assertGreater(res["totalNodes"], 0)
        self.assertGreaterEqual(res["totalCrossLanguageBoundaries"], 0)

    def test_patch_safety_engine_boundary_enforcement(self):
        target_file = os.path.join(self.temp_dir, "app.ts")
        with open(target_file, "w") as f:
            f.write("export const VERSION = '1.0.0';")

        proposal = PatchProposal("p1", target_file, "VERSION = '1.0.0'", "export const VERSION = '1.0.1';", "Bump version")

        # Outside boundary should fail
        allowed = ["/some/other/path"]
        ok, msg = self.patch_engine.apply_patch("snap_1", proposal, allowed_paths=allowed)
        self.assertFalse(ok)
        self.assertIn("Permission Denied", msg)

        # Inside boundary should succeed
        ok_valid, msg_valid = self.patch_engine.apply_patch("snap_1", proposal, allowed_paths=[self.temp_dir])
        self.assertTrue(ok_valid)

    def test_patch_snapshot_application_and_automated_rollback(self):
        target_file = os.path.join(self.temp_dir, "config.py")
        original_content = "DEBUG = True\nPORT = 8080"
        with open(target_file, "w") as f:
            f.write(original_content)

        proposal = PatchProposal("p2", target_file, original_content, "DEBUG = False\nPORT = 9999", "Update config")

        # Snapshot & Apply
        self.patch_engine.create_snapshot("snap_config", [target_file])
        ok, msg = self.patch_engine.apply_patch("snap_config", proposal, allowed_paths=[self.temp_dir])
        self.assertTrue(ok)

        # Verify file changed
        with open(target_file, "r") as f:
            self.assertEqual(f.read(), "DEBUG = False\nPORT = 9999")

        # Simulate test failure -> Automated Rollback
        res = self.patch_engine.verify_and_rollback("snap_config", test_passed=False)
        self.assertEqual(res["status"], "ROLLED_BACK")
        self.assertTrue(res["rolledBack"])

        # Verify original content restored
        with open(target_file, "r") as f:
            self.assertEqual(f.read(), original_content)

if __name__ == "__main__":
    unittest.main()
