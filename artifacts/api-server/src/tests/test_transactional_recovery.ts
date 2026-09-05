import * as fs from "node:fs";
import * as path from "node:path";
import { globalRecoveryController } from "../lib/jarvis/recoveryController";
import { globalToolRegistry } from "../lib/jarvis/tools/registry";
import { executeTaskGraph } from "../lib/jarvis/dag/runner";
import { TaskGraph } from "../lib/jarvis/dag/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runRecoveryTests() {
  console.log("=== STARTING TRANSACTIONAL RECOVERY & ROLLBACK TEST SUITE ===");

  const fixtureDir = path.resolve(process.cwd(), "artifacts/api-server/dist/temp_recovery_fixture");
  if (fs.existsSync(fixtureDir)) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
  fs.mkdirSync(fixtureDir, { recursive: true });

  const existingFilePath = path.join(fixtureDir, "module_a.ts");
  const initialContent = 'export const state = "ORIGINAL_STATE_V1";\n';
  fs.writeFileSync(existingFilePath, initialContent, "utf-8");

  const newFilePath = path.join(fixtureDir, "module_b.ts");

  const registry = globalToolRegistry;

  // ----------------------------------------------------
  // TEST 1: Snapshot and Rollback of Modified File
  // ----------------------------------------------------
  console.log("\n[TEST 1] Snapshot & Rollback of Modified Existing File...");
  const taskId1 = "task_test_mod_01";
  const toolWrite = registry.getTool("tool_file_write")!;

  // Tool write with context taskId automatically captures snapshot
  const writeRes1 = await toolWrite.execute(
    {
      filePath: path.relative(process.cwd(), existingFilePath),
      content: 'export const state = "MODIFIED_STATE_V2";\n',
    },
    { permissions: ["WRITE"], agentRole: "builder", taskId: taskId1 }
  );

  assert(writeRes1.success, "Tool file write succeeded for existing file");
  assert(
    fs.readFileSync(existingFilePath, "utf-8") === 'export const state = "MODIFIED_STATE_V2";\n',
    "File reflects modified content on disk"
  );

  const rollbackRes1 = globalRecoveryController.rollbackTaskModifications(taskId1);
  assert(rollbackRes1.success, "Rollback reported success");
  assert(rollbackRes1.restoredFiles.length === 1, "Exactly one file restored");
  assert(
    fs.readFileSync(existingFilePath, "utf-8") === initialContent,
    "Disk content accurately restored to original baseline after rollback"
  );

  // ----------------------------------------------------
  // TEST 2: Snapshot and Rollback of Newly Created File
  // ----------------------------------------------------
  console.log("\n[TEST 2] Snapshot & Rollback of Newly Created File...");
  const taskId2 = "task_test_create_02";
  assert(!fs.existsSync(newFilePath), "Target file does not exist before creation");

  const writeRes2 = await toolWrite.execute(
    {
      filePath: path.relative(process.cwd(), newFilePath),
      content: 'export const helper = () => "brand new file";\n',
    },
    { permissions: ["WRITE"], agentRole: "builder", taskId: taskId2 }
  );

  assert(writeRes2.success, "Tool file write succeeded for new file");
  assert(fs.existsSync(newFilePath), "New file now exists on disk");

  const rollbackRes2 = globalRecoveryController.rollbackTaskModifications(taskId2);
  assert(rollbackRes2.success, "Rollback reported success for created file");
  assert(rollbackRes2.unlinkedFiles.length === 1, "Newly created file was tracked as unlinked");
  assert(!fs.existsSync(newFilePath), "Newly created file was cleanly removed from disk on rollback");

  // ----------------------------------------------------
  // TEST 3: Multi-Operation Preservation (Write then Patch)
  // ----------------------------------------------------
  console.log("\n[TEST 3] Multi-Operation Preservation Baseline...");
  const taskId3 = "task_test_multi_03";
  const toolPatch = registry.getTool("tool_file_patch")!;

  // First operation: write intermediate version
  await toolWrite.execute(
    {
      filePath: path.relative(process.cwd(), existingFilePath),
      content: 'export const state = "INTERMEDIATE_STATE";\n',
    },
    { permissions: ["WRITE"], agentRole: "builder", taskId: taskId3 }
  );

  // Second operation: patch intermediate version
  await toolPatch.execute(
    {
      filePath: path.relative(process.cwd(), existingFilePath),
      targetContent: "INTERMEDIATE_STATE",
      replacementContent: "FINAL_PATCHED_STATE",
    },
    { permissions: ["WRITE"], agentRole: "builder", taskId: taskId3 }
  );

  assert(
    fs.readFileSync(existingFilePath, "utf-8") === 'export const state = "FINAL_PATCHED_STATE";\n',
    "File reflects patched state after multiple operations"
  );

  const rollbackRes3 = globalRecoveryController.rollbackTaskModifications(taskId3);
  assert(rollbackRes3.success, "Multi-operation rollback succeeded");
  assert(
    fs.readFileSync(existingFilePath, "utf-8") === initialContent,
    "Rollback preserved the earliest pre-task original baseline, not intermediate state"
  );

  // ----------------------------------------------------
  // TEST 4: DAG Failure Automatic Transactional Rollback
  // ----------------------------------------------------
  console.log("\n[TEST 4] DAG Runner Automatic Transactional Rollback on Evaluation Failure...");
  const failingTaskId = "task_dag_failing_04";
  const failingGraph: TaskGraph = {
    graphId: "graph_rollback_test",
    requestId: "req_rollback_test",
    objective: "Execute task that mutates files but fails evaluation",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    nodes: [
      {
        taskId: failingTaskId,
        graphId: "graph_rollback_test",
        description: "Write bad file changes",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        constraints: [],
        status: "READY",
        retryCount: 0,
        maxRetries: 0,
        revisionCount: 0,
        maxRevisionCycles: 0,
        timeoutMs: 15000,
      },
    ],
  };

  const testContext: any = {
    requestId: "req_rec_test",
    objective: "Test transactional recovery",
    brief: "Test",
    permissionLevel: "WRITE",
    activeRole: "builder",
    assignedAgentId: "builder",
    workingDirectory: process.cwd(),
    allowedPaths: [process.cwd()],
    deniedPaths: [],
    relevantMemories: [],
    relevantLessons: [],
    fileSnippets: [],
    executionGraphId: "graph_rec_test",
  };

  // Mock agent dispatcher to write a breaking file and a new file, but fail evaluation
  const dagResult = await executeTaskGraph(
    failingGraph,
    testContext,
    {
      customDispatcher: async (node) => {
        // Modify existing file
        await toolWrite.execute(
          {
            filePath: path.relative(process.cwd(), existingFilePath),
            content: 'export const broken = "SYNTAX_ERROR_IN_CODE";\n',
          },
          { permissions: ["WRITE"], agentRole: "builder", taskId: node.taskId }
        );
        // Create a rogue file
        await toolWrite.execute(
          {
            filePath: path.relative(process.cwd(), newFilePath),
            content: 'export const rogue = true;\n',
          },
          { permissions: ["WRITE"], agentRole: "builder", taskId: node.taskId }
        );

        return {
          agentRole: "builder",
          agentName: "Builder Agent",
          result: "I modified the code",
          confidence: 0.2,
          warnings: ["Syntax error introduced"],
          evidence: [],
        };
      },
      customEvaluator: () => {
        // Critic evaluation forces FAIL
        return {
          verdict: "FAIL",
          score: 0.1,
          confidence: 0.95,
          strengths: [],
          failureReasons: ["SyntaxError: Broken code failed validation"],
          requiredCorrections: ["Revert syntax error"],
          evaluatorAgent: "Critic Agent",
        };
      },
    }
  );

  assert(dagResult.failedNodeCount === 1, "DAG node was marked as FAILED");
  assert(
    fs.readFileSync(existingFilePath, "utf-8") === initialContent,
    "DAG failure automatically rolled back modified file to original baseline"
  );
  assert(!fs.existsSync(newFilePath), "DAG failure automatically unlinked newly created rogue file");

  const traces = globalRecoveryController.getRecoveryTraces();
  const failingTrace = traces.find((t) => t.taskId === failingTaskId);
  console.log("Trace found:", failingTrace);
  assert(Boolean(failingTrace), "RecoveryAttemptTrace was recorded for failing task");
  assert(failingTrace!.rolledBack === true, "Recovery trace records rolledBack: true");
  assert(failingTrace!.targetFiles.length === 2, "Recovery trace accurately tracked 2 target files");
  assert(failingTrace!.failureType === "SYNTAX_ERROR", "Recovery controller accurately classified SYNTAX_ERROR");

  // ----------------------------------------------------
  // TEST 5: DAG Success Snapshot Cleanup
  // ----------------------------------------------------
  console.log("\n[TEST 5] DAG Runner Snapshot Cleanup on Success...");
  const successTaskId = "task_dag_success_05";
  const successGraph: TaskGraph = {
    graphId: "graph_success_test",
    requestId: "req_success_test",
    objective: "Execute task that succeeds",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    nodes: [
      {
        taskId: successTaskId,
        graphId: "graph_success_test",
        description: "Write valid file changes",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        constraints: [],
        status: "READY",
        retryCount: 0,
        maxRetries: 0,
        revisionCount: 0,
        maxRevisionCycles: 1,
        timeoutMs: 15000,
      },
    ],
  };

  const validNewContent = 'export const state = "VERIFIED_VALID_STATE";\n';
  await executeTaskGraph(
    successGraph,
    testContext,
    {
      customDispatcher: async (node) => {
        await toolWrite.execute(
          {
            filePath: path.relative(process.cwd(), existingFilePath),
            content: validNewContent,
          },
          { permissions: ["WRITE"], agentRole: "builder", taskId: node.taskId }
        );
        return {
          agentRole: "builder",
          agentName: "Builder Agent",
          result: "Successfully updated module",
          confidence: 0.95,
          warnings: [],
          evidence: [],
        };
      },
      customEvaluator: () => {
        return {
          verdict: "PASS",
          score: 0.98,
          confidence: 0.99,
          strengths: ["Valid state"],
          failureReasons: [],
          requiredCorrections: [],
          evaluatorAgent: "Critic Agent",
        };
      },
    }
  );

  assert(
    fs.readFileSync(existingFilePath, "utf-8") === validNewContent,
    "Successful task changes persist on disk"
  );
  assert(
    globalRecoveryController.getSnapshottedFiles(successTaskId).length === 0,
    "Snapshots were cleaned up from memory after verified PASS"
  );

  // Cleanup fixture
  if (fs.existsSync(fixtureDir)) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  console.log("\n=== ALL TRANSACTIONAL RECOVERY & ROLLBACK TESTS PASSED (5/5) ===");
}

runRecoveryTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
