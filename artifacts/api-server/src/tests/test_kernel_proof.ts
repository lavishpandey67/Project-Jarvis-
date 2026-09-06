import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { executeTaskGraph } from "../lib/jarvis/dag/runner";
import { TaskGraph, TaskGraphNode } from "../lib/jarvis/dag/types";
import { ScopedContext } from "../lib/jarvis/types";
import { globalRecoveryController } from "../lib/jarvis/recoveryController";
import { CognitiveMemoryStore } from "../lib/jarvis/memory/store";
import { globalToolRegistry } from "../lib/jarvis/tools/registry";

async function runKernelProofSuite() {
  console.log("========================================================");
  console.log("   JARVIS EXECUTION KERNEL V1 — REAL RUNTIME PROOF      ");
  console.log("========================================================");

  const proofDir = path.resolve(process.cwd(), "artifacts/api-server/dist/kernel_proof");
  const proofRelDir = "artifacts/api-server/dist/kernel_proof";
  await fs.mkdir(proofDir, { recursive: true });

  const context: ScopedContext = {
    conversationId: 99,
    recentMessages: [],
    relevantMemories: [],
    activeTasks: [],
    agentPermissions: ["EXECUTE", "WRITE", "READ"],
  };

  // =========================================================================
  // SCENARIO 1: SUCCESS PATH (Plan -> Authorize -> Write -> Test -> Observe -> Evaluate -> Complete)
  // =========================================================================
  console.log("\n>>> [PROOF SCENARIO 1] Real Success Path via Authoritative DAG Kernel...");

  const diagFileRel = `${proofRelDir}/diagnostics.mjs`;
  const testDiagFileRel = `${proofRelDir}/test_diagnostics.mjs`;
  const diagFileAbs = path.resolve(process.cwd(), diagFileRel);
  const testDiagFileAbs = path.resolve(process.cwd(), testDiagFileRel);

  const diagCode = `// Deterministic Diagnostics Module
export function runSystemDiagnostics() {
  return {
    status: "HEALTHY",
    uptimeSeconds: 3600,
    timestamp: new Date().toISOString(),
    kernelReady: true
  };
}
`;

  const testDiagCode = `// Deterministic Diagnostics Test Runner
import * as assert from "node:assert";
import { runSystemDiagnostics } from "./diagnostics.mjs";

const diag = runSystemDiagnostics();
assert.strictEqual(diag.status, "HEALTHY", "Diagnostics status must be HEALTHY");
assert.strictEqual(diag.kernelReady, true, "KernelReady must be true");
console.log("DIAGNOSTICS_VERIFIED_PASS: All diagnostic checks succeeded.");
`;

  const successGraphId = `graph_proof_success_${Date.now()}`;
  const successGraph: TaskGraph = {
    graphId: successGraphId,
    requestId: "req_proof_01",
    objective: "Implement and verify real system diagnostics module in repository",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "task_write_diag",
        graphId: successGraphId,
        description: `Write diagnostics module to ${diagFileRel}`,
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation", "workspace_operations"],
        dependencies: [],
        inputs: {
          tool: "tool_file_write",
          filePath: diagFileRel,
          content: diagCode,
        },
        constraints: ["Must write valid ES module", "Must produce hash evidence"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 15000,
      },
      {
        taskId: "task_write_test_diag",
        graphId: successGraphId,
        description: `Write diagnostics test runner to ${testDiagFileRel}`,
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation", "workspace_operations"],
        dependencies: ["task_write_diag"],
        inputs: {
          tool: "tool_file_write",
          filePath: testDiagFileRel,
          content: testDiagCode,
        },
        constraints: ["Valid ES module test assertions"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 15000,
      },
      {
        taskId: "task_run_test_diag",
        graphId: successGraphId,
        description: `Execute diagnostic test suite: node ${testDiagFileRel}`,
        assignedAgentRole: "executor",
        assignedAgentName: "Executor Agent",
        requiredCapabilities: ["approved_tool_execution"],
        dependencies: ["task_write_test_diag"],
        inputs: {
          tool: "tool_run_test",
          testCommand: `node ${testDiagFileRel}`,
          targetPath: testDiagFileRel,
        },
        constraints: ["Must exit 0 with DIAGNOSTICS_VERIFIED_PASS marker"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 15000,
      },
    ],
  };

  const successResult = await executeTaskGraph(successGraph, context);

  assert.strictEqual(successResult.graph.status, "COMPLETED", "Graph must complete with COMPLETED status");
  assert.strictEqual(successResult.graph.stage, "COMPLETE", "Graph stage must reach COMPLETE");
  assert.strictEqual(successResult.succeededNodeCount, 3, "All 3 nodes must succeed");
  assert.strictEqual(successResult.failedNodeCount, 0, "Zero nodes failed");

  // Verify full lifecycle stage transitions for each node
  for (const node of successResult.graph.nodes) {
    assert.ok(node.transitionHistory && node.transitionHistory.length >= 3, `Node ${node.taskId} has transition history`);
    const stages = node.transitionHistory.map((t) => t.toStage);
    assert.ok(stages.includes("AUTHORIZE"), `Node ${node.taskId} transitioned through AUTHORIZE`);
    assert.ok(stages.includes("EXECUTE"), `Node ${node.taskId} transitioned through EXECUTE`);
    assert.ok(stages.includes("OBSERVE"), `Node ${node.taskId} transitioned through OBSERVE`);
    assert.ok(stages.includes("EVALUATE"), `Node ${node.taskId} transitioned through EVALUATE`);
    assert.ok(stages.includes("COMPLETE"), `Node ${node.taskId} transitioned to COMPLETE`);
    assert.strictEqual(node.authorizationVerdict?.approved, true, `Node ${node.taskId} authorization approved`);
    assert.strictEqual(node.latestEvaluation?.verdict, "PASS", `Node ${node.taskId} evaluated as PASS`);
  }

  // Verify real filesystem evidence
  const writtenDiagContent = await fs.readFile(diagFileAbs, "utf-8");
  assert.ok(writtenDiagContent.includes("runSystemDiagnostics"), "Diagnostics module content verified on disk");
  const expectedHash = crypto.createHash("sha256").update(diagCode).digest("hex");

  // Verify structured observations
  const testNode = successResult.graph.nodes.find((n) => n.taskId === "task_run_test_diag")!;
  assert.ok(testNode.observations && testNode.observations.length > 0, "Test node has structured observations");
  const testObs = testNode.observations[0];
  assert.strictEqual(testObs.exitCode, 0, "Observation exitCode must be 0");
  assert.ok(testObs.stdout?.includes("DIAGNOSTICS_VERIFIED_PASS"), "Observation stdout contains verification pass marker");
  assert.strictEqual(testObs.success, true, "Observation success is true");

  console.log("   ✓ Success Path Verified:");
  console.log(`     - Graph Stage: ${successResult.graph.stage} | Status: ${successResult.graph.status}`);
  console.log(`     - Nodes Succeeded: ${successResult.succeededNodeCount}/${successResult.graph.nodes.length}`);
  console.log(`     - Diagnostics SHA256: ${expectedHash}`);
  console.log(`     - Test Output: ${testObs.stdout?.trim()}`);

  // =========================================================================
  // SCENARIO 2: REVISION & SELF-HEALING RECOVERY PATH
  // =========================================================================
  console.log("\n>>> [PROOF SCENARIO 2] Real Revision / Self-Healing Recovery Path...");

  const authFileRel = `${proofRelDir}/auth_token.mjs`;
  const testAuthFileRel = `${proofRelDir}/test_auth_token.mjs`;
  const authFileAbs = path.resolve(process.cwd(), authFileRel);
  const testAuthFileAbs = path.resolve(process.cwd(), testAuthFileRel);

  // Step A: Write initial BUGGY module
  const buggyAuthCode = `// Buggy Auth Token Generator
export function generateToken(user) {
  // BUG: returns signature as 'INVALID_SIG'
  return "TOKEN_" + user + "_INVALID_SIG";
}
`;
  await fs.writeFile(authFileAbs, buggyAuthCode, "utf-8");

  // Step B: Write strict test runner that demands 'TOKEN_<user>_VALID_SIG'
  const testAuthCode = `// Strict Token Verifier Test
import * as assert from "node:assert";
import { generateToken } from "./auth_token.mjs";

const token = generateToken("alice");
assert.strictEqual(token, "TOKEN_alice_VALID_SIG", "Expected token to end with VALID_SIG");
console.log("AUTH_TOKEN_VERIFIED_PASS: Token verified successfully.");
`;
  await fs.writeFile(testAuthFileAbs, testAuthCode, "utf-8");

  const recoveryGraphId = `graph_proof_recovery_${Date.now()}`;
  const recoveryGraph: TaskGraph = {
    graphId: recoveryGraphId,
    requestId: "req_proof_02",
    objective: "Repair buggy auth token generator and verify test green",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "task_repair_auth",
        graphId: recoveryGraphId,
        description: `Repair ${authFileRel} so test ${testAuthFileRel} passes`,
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation", "debugging", "implementation"],
        dependencies: [],
        inputs: {
          filePath: authFileRel,
          // Repair hook executed by kernel on REVISE transition
          repairHook: async (node: TaskGraphNode) => {
            console.log("     [Kernel Self-Healing Loop] Inspecting failure and applying corrective patch...");
            const curContent = await fs.readFile(authFileAbs, "utf-8");
            const patched = curContent.replace("INVALID_SIG", "VALID_SIG");
            await globalToolRegistry.executeTool(
              "tool_file_write",
              { filePath: authFileRel, content: patched },
              { permissions: ["WRITE", "EXECUTE"], agentRole: "builder", taskId: node.taskId },
            );
          },
        },
        constraints: ["Must pass node test"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        maxRevisionCycles: 3,
        timeoutMs: 15000,
      },
    ],
  };

  // Custom dispatcher: runs test to see if it passes; returns test observation
  let attemptCount = 0;
  const customDispatcher = async (task: any, _ctx: any) => {
    attemptCount++;
    const testExec = await globalToolRegistry.executeTool(
      "tool_run_test",
      { testCommand: `node ${testAuthFileRel}`, targetPath: testAuthFileRel },
      { permissions: ["EXECUTE", "READ", "WRITE"], agentRole: "builder", taskId: task.taskId },
    );

    const isPass = testExec.success && testExec.output?.passed === true;
    return {
      taskId: task.taskId,
      status: (isPass ? "success" : "failed") as "success" | "failed",
      result: isPass
        ? `[Tool Execution: tool_run_test PASS] Verified code implementation: function generateToken successfully returned valid token signature with exit code 0.`
        : `Test failure: ${testExec.output?.testFailureReason || testExec.error}`,
      confidence: isPass ? 1.0 : 0.2,
      evidence: [testExec.output?.stdout || testExec.output?.stderr || ""],
      observation: {
        action: "tool_run_test",
        tool: "tool_run_test",
        inputs: { testCommand: `node ${testAuthFileRel}` },
        target: testAuthFileRel,
        success: isPass,
        status: isPass ? "SUCCESS" : "TEST_FAILED",
        exitCode: testExec.output?.exitCode ?? (isPass ? 0 : 1),
        stdout: testExec.output?.stdout,
        stderr: testExec.output?.stderr,
        timestamp: new Date().toISOString(),
      },
    };
  };

  const recoveryResult = await executeTaskGraph(recoveryGraph, context, { customDispatcher });
  assert.strictEqual(recoveryResult.graph.status, "COMPLETED", "Recovery graph must successfully complete");
  const repairedNode = recoveryResult.graph.nodes[0];
  assert.strictEqual(repairedNode.status, "SUCCESS", "Repaired node must reach SUCCESS");
  assert.ok((repairedNode.revisionCount || 0) > 0, "Node must have executed at least 1 revision cycle");

  // Verify RECOVER stage transition in node history
  const stages = repairedNode.transitionHistory?.map((t) => t.toStage) || [];
  assert.ok(stages.includes("RECOVER"), "Node transition history must record RECOVER stage");
  assert.ok(stages.includes("COMPLETE"), "Node transition history must record COMPLETE stage");

  // Verify on-disk file was repaired
  const repairedCode = await fs.readFile(authFileAbs, "utf-8");
  assert.ok(repairedCode.includes("VALID_SIG"), "File content must reflect repaired code on disk");
  assert.ok(!repairedCode.includes("INVALID_SIG"), "Faulty code must be eliminated");

  // Verify self-healing lesson memory was recorded in CognitiveMemoryStore
  const memoryStore = CognitiveMemoryStore.getInstance();
  const memories = await memoryStore.queryMemories({}, { layer: "LESSON" });
  const hasRevisionLesson = memories.some((m) => m.title.includes("Task Revision") || m.content.includes("revision cycle"));
  assert.ok(hasRevisionLesson, "Lesson memory must be recorded in CognitiveMemoryStore after self-healing revision");

  console.log("   ✓ Revision / Self-Healing Recovery Path Verified:");
  console.log(`     - Total Execution Attempts: ${attemptCount}`);
  console.log(`     - Node Revision Count: ${repairedNode.revisionCount}`);
  console.log(`     - Lifecycle Stages Traversed: ${stages.join(" -> ")}`);
  console.log(`     - Stored Self-Healing Lessons: ${memories.length}`);

  // =========================================================================
  // SCENARIO 3: CONTROLLED FAILURE & TRANSACTIONAL ROLLBACK
  // =========================================================================
  console.log("\n>>> [PROOF SCENARIO 3] Controlled Terminal Failure & Transactional Rollback...");

  const baselineFileRel = `${proofRelDir}/baseline_config.json`;
  const baselineFileAbs = path.resolve(process.cwd(), baselineFileRel);
  const originalConfig = JSON.stringify({ version: "1.0.0", safeMode: true }, null, 2);
  await fs.writeFile(baselineFileAbs, originalConfig, "utf-8");

  const failGraphId = `graph_proof_fail_${Date.now()}`;
  const failGraph: TaskGraph = {
    graphId: failGraphId,
    requestId: "req_proof_03",
    objective: "Execute high-risk task that fails evaluation and exhausts retries",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "task_terminal_fail",
        graphId: failGraphId,
        description: `Modify ${baselineFileRel} with broken config`,
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        inputs: {
          filePath: baselineFileRel,
          tool: "tool_file_write",
          content: JSON.stringify({ version: "BROKEN", corrupted: true }),
        },
        constraints: ["Must pass critic"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        maxRevisionCycles: 1,
        timeoutMs: 15000,
      },
    ],
  };

  // Custom evaluator that strictly rejects the broken config with verdict FAIL
  const failEvaluator = () => ({
    verdict: "FAIL" as const,
    overallScore: 0.1,
    failureReasons: ["SyntaxError: Unexpected token in corrupted configuration schema"],
    requiredCorrections: ["Revert corrupted file"],
  });

  const failResult = await executeTaskGraph(failGraph, context, { customEvaluator: failEvaluator });

  assert.strictEqual(failResult.graph.status, "FAILED", "Graph status must be FAILED");
  assert.strictEqual(failResult.graph.stage, "FAILED", "Graph stage must be FAILED");
  const failedNode = failResult.graph.nodes[0];
  assert.strictEqual(failedNode.status, "FAILED", "Node status must be FAILED");
  assert.strictEqual(failedNode.stage, "FAILED", "Node stage must be FAILED");

  // Verify transactional rollback restored the baseline file
  const restoredConfig = await fs.readFile(baselineFileAbs, "utf-8");
  assert.strictEqual(restoredConfig, originalConfig, "Baseline file must be byte-for-byte restored to original state");

  // Verify recovery trace recorded
  const recTrace = globalRecoveryController.getRecoveryTraces().find((t) => t.taskId === "task_terminal_fail");
  assert.ok(recTrace, "Recovery trace must be recorded by globalRecoveryController");
  assert.strictEqual(recTrace?.rolledBack, true, "Recovery trace must confirm rolledBack: true");
  assert.strictEqual(recTrace?.assignedRole, "DEBUGGER", "Recovery controller adapted generalist to DEBUGGER role");

  console.log("   ✓ Controlled Failure & Rollback Verified:");
  console.log(`     - Graph Stage: ${failResult.graph.stage} | Status: ${failResult.graph.status}`);
  console.log(`     - Node Final Stage: ${failedNode.stage} | Status: ${failedNode.status}`);
  console.log(`     - File Restored To Original Baseline: true`);
  console.log(`     - Adaptive Role: ${recTrace?.assignedRole} | RolledBack: ${recTrace?.rolledBack}`);

  // Cleanup proof directory
  await fs.rm(proofDir, { recursive: true, force: true }).catch(() => {});
  console.log(`\n🧹 Cleaned up kernel proof directory: ${proofRelDir}`);

  console.log("\n========================================================");
  console.log("   ALL REAL RUNTIME KERNEL PROOF SCENARIOS PASSED (3/3) ");
  console.log("========================================================");
}

runKernelProofSuite().catch((err) => {
  console.error("Kernel proof failed:", err);
  process.exit(1);
});
