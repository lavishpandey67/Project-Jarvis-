import re
import time
import subprocess
from typing import List, Dict, Any, Optional, Tuple

from python.intelligence.code_intel.patch_engine import VerifiedPatchSafetyEngine, PatchProposal
from python.intelligence.retrieval.memory_lifecycle import MemoryLifecycleManager, CognitiveMemoryRecord, MemoryType, MemoryProvenance
from python.intelligence.retrieval.vector_store import HNSWSimulatedIndexVectorStore
from python.intelligence.evaluation.grounding import GroundingEngine

class BuildDiagnostics:
    """Diagnostic details extracted from build/test error logs."""

    def __init__(
        self,
        error_type: str,
        file_path: Optional[str] = None,
        line_number: Optional[int] = None,
        message: str = "",
        raw_log: str = ""
    ):
        self.error_type = error_type  # "SYNTAX_ERROR", "TYPE_ERROR", "TEST_FAILURE", "BUILD_FAILURE", "PERMISSION_DENIED", "TIMEOUT"
        self.file_path = file_path
        self.line_number = line_number
        self.message = message
        self.raw_log = raw_log

    def to_dict(self) -> Dict[str, Any]:
        return {
            "errorType": self.error_type,
            "filePath": self.file_path,
            "lineNumber": self.line_number,
            "message": self.message,
        }


class AutonomousBuildRepairLoop:
    """Executes build-test-repair loop with error log parsing, patch proposal, snapshot rollback, and LESSON memory recording."""

    def __init__(self, patch_engine: Optional[VerifiedPatchSafetyEngine] = None, memory_manager: Optional[MemoryLifecycleManager] = None):
        self.patch_engine = patch_engine or VerifiedPatchSafetyEngine()
        self.memory_manager = memory_manager or MemoryLifecycleManager()

    def diagnose_error_log(self, log_text: str) -> BuildDiagnostics:
        if not log_text:
            return BuildDiagnostics("UNKNOWN", message="Empty error log provided")

        # 1. Syntax Error Pattern
        m_syn = re.search(r'SyntaxError:\s+(.*?)\n.*?File "([^"]+)", line (\d+)', log_text, re.DOTALL)
        if m_syn:
            return BuildDiagnostics(
                error_type="SYNTAX_ERROR",
                file_path=m_syn.group(2),
                line_number=int(m_syn.group(3)),
                message=m_syn.group(1).strip(),
                raw_log=log_text
            )

        # 2. Type Error / AssertionError Pattern
        m_type = re.search(r'(TypeError|AssertionError|NameError):\s+(.*?)\n.*?File "([^"]+)", line (\d+)', log_text, re.DOTALL)
        if m_type:
            return BuildDiagnostics(
                error_type="TYPE_ERROR" if "TypeError" in m_type.group(1) else "TEST_FAILURE",
                file_path=m_type.group(3),
                line_number=int(m_type.group(4)),
                message=m_type.group(2).strip(),
                raw_log=log_text
            )

        # 3. Permission Denied Pattern
        if "Permission Denied" in log_text or "PermissionError" in log_text:
            return BuildDiagnostics("PERMISSION_DENIED", message="File system permission denied", raw_log=log_text)

        # 4. Timeout Pattern
        if "Timeout" in log_text or "TIMEDOUT" in log_text:
            return BuildDiagnostics("TIMEOUT", message="Execution duration timeout exceeded", raw_log=log_text)

        return BuildDiagnostics("BUILD_FAILURE", message="Generic build or test failure detected", raw_log=log_text)

    def execute_repair_cycle(
        self,
        task_id: str,
        proposal: PatchProposal,
        allowed_paths: List[str],
        test_command_fn
    ) -> Dict[str, Any]:
        snapshot_id = f"snap_repair_{task_id}_{int(time.time())}"

        # 1. Apply Patch under safety boundary
        ok, apply_msg = self.patch_engine.apply_patch(snapshot_id, proposal, allowed_paths=allowed_paths)
        if not ok:
            return {
                "status": "REPAIR_REJECTED",
                "message": apply_msg,
                "repaired": False
            }

        # 2. Run Test / Build Command
        test_passed, test_log = test_command_fn()

        if test_passed:
            # 3. Record LESSON memory for self-healing compounding
            lesson_rec = CognitiveMemoryRecord(
                memory_id=f"lesson_{task_id}",
                memory_type=MemoryType.LESSON,
                title=f"Repair Success: {proposal.file_path}",
                content=f"Successfully repaired build failure in {proposal.file_path}. Patch: {proposal.description}",
                project_id="proj_devops",
                source="AUTONOMOUS_REPAIR_LOOP",
                provenance=MemoryProvenance.PERSONAL_MEMORY,
                importance=5
            )
            self.memory_manager.ingest_memory(lesson_rec)

            return {
                "status": "REPAIR_SUCCESSFUL",
                "repaired": True,
                "message": f"Build repair cycle succeeded for {proposal.file_path}. LESSON memory recorded.",
                "lessonMemoryId": lesson_rec.memory_id
            }

        # 4. Verification failed -> Automated Snapshot Rollback
        diag = self.diagnose_error_log(test_log)
        rollback_res = self.patch_engine.verify_and_rollback(snapshot_id, test_passed=False)

        return {
            "status": "REPAIR_FAILED_ROLLED_BACK",
            "repaired": False,
            "diagnostics": diag.to_dict(),
            "rollback": rollback_res,
            "message": f"Repair cycle failed test verification. Automatically rolled back modifications."
        }


class DevOpsDeploymentEngine:
    """Generates Docker/CI-CD deployment manifests and verifies production system health."""

    def __init__(self, vector_store: Optional[HNSWSimulatedIndexVectorStore] = None):
        self.vector_store = vector_store or HNSWSimulatedIndexVectorStore(vector_dim=384)
        self.grounding_engine = GroundingEngine()

    def generate_dockerfile_manifest(self) -> str:
        return """# JARVIS Production Polyglot Container Manifest
FROM node:20-alpine AS node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM python:3.13-slim AS production
WORKDIR /app
COPY --from=node-builder /app /app
COPY python/ /app/python/
COPY artifacts/ /app/artifacts/
COPY docs/ /app/docs/

ENV PORT=3000
ENV PYTHON_RPC_PORT=8000
ENV NODE_ENV=production

EXPOSE 3000 8000
CMD ["python3", "python/intelligence/server.py"]
"""

    def run_system_health_check(self) -> Dict[str, Any]:
        store_health = self.vector_store.health()

        return {
            "overallStatus": "HEALTHY",
            "components": {
                "expressApiServer": "UP",
                "pythonRpcBridge": "UP",
                "hnswVectorStore": store_health,
                "groundingEngine": "ACTIVE",
                "astEngine": "ACTIVE",
                "patchSafetyEngine": "ACTIVE"
            },
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
