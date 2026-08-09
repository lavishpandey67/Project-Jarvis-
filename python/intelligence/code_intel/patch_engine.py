import hashlib
import os
import time
from typing import List, Dict, Any, Optional, Tuple

class FileSnapshot:
    def __init__(self, file_path: str, content: str):
        self.file_path = file_path
        self.content = content
        self.content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        self.timestamp = time.time()


class PatchProposal:
    def __init__(self, patch_id: str, file_path: str, original_content: str, replacement_content: str, description: str):
        self.patch_id = patch_id
        self.file_path = file_path
        self.original_content = original_content
        self.replacement_content = replacement_content
        self.description = description
        self.applied = False


class VerifiedPatchSafetyEngine:
    """Manages pre-modification file snapshots, path boundary checks, and automated rollback upon test failure."""

    def __init__(self):
        self.snapshots: Dict[str, Dict[str, FileSnapshot]] = {}  # snapshot_id -> {file_path -> FileSnapshot}
        self.audit_log: List[Dict[str, Any]] = []

    def create_snapshot(self, snapshot_id: str, file_paths: List[str]) -> Dict[str, FileSnapshot]:
        snapshot_map = {}
        for fp in file_paths:
            if os.path.exists(fp):
                try:
                    with open(fp, "r", encoding="utf-8", errors="ignore") as fh:
                        content = fh.read()
                    snapshot_map[fp] = FileSnapshot(fp, content)
                except Exception:
                    continue
        self.snapshots[snapshot_id] = snapshot_map
        return snapshot_map

    def apply_patch(
        self,
        snapshot_id: str,
        proposal: PatchProposal,
        allowed_paths: Optional[List[str]] = None
    ) -> Tuple[bool, str]:
        # 1. Path Boundary Enforcement
        if allowed_paths:
            is_allowed = any(os.path.abspath(proposal.file_path).startswith(os.path.abspath(p)) for p in allowed_paths)
            if not is_allowed:
                return False, f"Permission Denied: Path '{proposal.file_path}' is outside allowed paths boundary {allowed_paths}"

        # 2. Capture Snapshot if not already captured
        if snapshot_id not in self.snapshots:
            self.create_snapshot(snapshot_id, [proposal.file_path])

        # 3. Apply Modification
        try:
            with open(proposal.file_path, "w", encoding="utf-8") as fh:
                fh.write(proposal.replacement_content)
            proposal.applied = True

            self.audit_log.append({
                "action": "APPLY_PATCH",
                "patchId": proposal.patch_id,
                "filePath": proposal.file_path,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            })
            return True, f"Patch {proposal.patch_id} applied successfully to {proposal.file_path}"
        except Exception as e:
            return False, f"Apply Failure: {str(e)}"

    def verify_and_rollback(self, snapshot_id: str, test_passed: bool) -> Dict[str, Any]:
        """Rolls back all modifications for snapshot_id if verification fails."""
        if test_passed:
            return {
                "status": "ACCEPTED",
                "rolledBack": False,
                "message": "Verification passed cleanly. Patch accepted."
            }

        snapshot_map = self.snapshots.get(snapshot_id, {})
        restored_files = []

        for fp, snap in snapshot_map.items():
            try:
                with open(fp, "w", encoding="utf-8") as fh:
                    fh.write(snap.content)
                restored_files.append(fp)
            except Exception:
                continue

        self.audit_log.append({
            "action": "AUTOMATED_ROLLBACK",
            "snapshotId": snapshot_id,
            "restoredFiles": restored_files,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })

        return {
            "status": "ROLLED_BACK",
            "rolledBack": True,
            "restoredFiles": restored_files,
            "message": f"Verification failed. Automatically rolled back {len(restored_files)} files."
        }
