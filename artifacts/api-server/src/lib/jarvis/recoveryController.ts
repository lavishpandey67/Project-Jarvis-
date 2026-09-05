import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export type FailureClassification =
  | "SYNTAX_ERROR"
  | "TEST_FAILURE"
  | "BUILD_FAILURE"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "UNKNOWN";

export interface FileSnapshot {
  filePath: string;
  originalContent: string | null;
  hash: string | null;
  fileExisted: boolean;
  timestamp: string;
}

export interface RollbackResult {
  success: boolean;
  restoredFiles: string[];
  unlinkedFiles: string[];
}

export interface RecoveryAttemptTrace {
  attemptId: string;
  taskId: string;
  assignedAgentId: string;
  assignedRole: string;
  failureType: FailureClassification;
  hypothesis: string;
  proposedPatchAction: string;
  targetFiles: string[];
  verificationResult: "PENDING" | "PASSED" | "FAILED";
  rolledBack: boolean;
  timestamp: string;
}

export class RecoveryController {
  private static instance: RecoveryController;
  private snapshots: Map<string, FileSnapshot[]> = new Map(); // taskId -> snapshots
  private recoveryTraces: RecoveryAttemptTrace[] = [];

  public static getInstance(): RecoveryController {
    if (!RecoveryController.instance) {
      RecoveryController.instance = new RecoveryController();
    }
    return RecoveryController.instance;
  }

  /**
   * Classify runtime failure string into structured failure classification
   */
  public classifyFailure(errorMessage: string): FailureClassification {
    const msg = (errorMessage || "").toLowerCase();
    if (msg.includes("syntaxerror") || msg.includes("unexpected token") || msg.includes("parse error")) {
      return "SYNTAX_ERROR";
    }
    if (msg.includes("test failed") || msg.includes("assertionerror") || msg.includes("expected") || msg.includes("unittest")) {
      return "TEST_FAILURE";
    }
    if (msg.includes("build failed") || msg.includes("compilation error") || msg.includes("tsc")) {
      return "BUILD_FAILURE";
    }
    if (msg.includes("permission denied") || msg.includes("eacces") || msg.includes("unauthorized")) {
      return "PERMISSION_DENIED";
    }
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return "TIMEOUT";
    }
    return "UNKNOWN";
  }

  /**
   * Capture pre-modification file snapshots for rollback safety
   * Preserves earliest snapshot for each file across multiple operations in the same task
   */
  public createPreModificationSnapshot(taskId: string, filePaths: string[]): FileSnapshot[] {
    const taskSnapshots: FileSnapshot[] = this.snapshots.get(taskId) || [];
    const timestamp = new Date().toISOString();

    for (const filePath of filePaths) {
      try {
        const absolutePath = path.resolve(filePath);
        // If file already snapshotted for this task, preserve initial pre-task baseline
        if (taskSnapshots.some((s) => s.filePath === absolutePath)) {
          continue;
        }

        if (fs.existsSync(absolutePath)) {
          const content = fs.readFileSync(absolutePath, "utf-8");
          const hash = crypto.createHash("sha256").update(content).digest("hex");
          taskSnapshots.push({
            filePath: absolutePath,
            originalContent: content,
            hash,
            fileExisted: true,
            timestamp,
          });
        } else {
          // File does not exist yet; record that it was created during this task
          taskSnapshots.push({
            filePath: absolutePath,
            originalContent: null,
            hash: null,
            fileExisted: false,
            timestamp,
          });
        }
      } catch (_err) {
        // Skip inaccessible files
      }
    }

    this.snapshots.set(taskId, taskSnapshots);
    return taskSnapshots;
  }

  /**
   * Get all file paths that have been snapshotted for a task
   */
  public getSnapshottedFiles(taskId: string): string[] {
    const snapshots = this.snapshots.get(taskId) || [];
    return snapshots.map((s) => s.filePath);
  }

  /**
   * Clear snapshots for a task after verified successful completion
   */
  public clearSnapshots(taskId: string): void {
    this.snapshots.delete(taskId);
  }

  /**
   * Perform bounded transactional rollback of files changed during failed recovery attempt
   */
  public rollbackTaskModifications(taskId: string): RollbackResult {
    const snapshots = this.snapshots.get(taskId) || [];
    const restoredFiles: string[] = [];
    const unlinkedFiles: string[] = [];

    for (const snap of snapshots) {
      try {
        if (snap.fileExisted && snap.originalContent !== null) {
          // Restore prior file content
          fs.writeFileSync(snap.filePath, snap.originalContent, "utf-8");
          restoredFiles.push(snap.filePath);
        } else if (!snap.fileExisted) {
          // Remove newly created file that did not exist before task
          if (fs.existsSync(snap.filePath)) {
            fs.unlinkSync(snap.filePath);
            unlinkedFiles.push(snap.filePath);
          }
        }
      } catch (_err) {
        // Log rollback error
      }
    }

    this.snapshots.delete(taskId);
    return {
      success: restoredFiles.length > 0 || unlinkedFiles.length > 0,
      restoredFiles,
      unlinkedFiles,
    };
  }

  /**
   * Record recovery attempt trace
   */
  public recordRecoveryTrace(trace: RecoveryAttemptTrace): void {
    this.recoveryTraces.push(trace);
  }

  /**
   * Get all recorded recovery traces
   */
  public getRecoveryTraces(): RecoveryAttemptTrace[] {
    return [...this.recoveryTraces];
  }
}

export const globalRecoveryController = RecoveryController.getInstance();
