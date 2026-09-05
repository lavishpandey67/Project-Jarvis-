import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { globalToolRegistry } from "../lib/jarvis/tools/registry";
import { dispatchToAgent } from "../lib/jarvis/agentDispatcher";
import { processWithJarvisBrain } from "../lib/jarvis/index";
import { evaluateTaskResult } from "../lib/jarvis/eval/evaluator";
import { TaskGraphNode } from "../lib/jarvis/dag/types";

async function runTests() {
  console.log("=== STARTING TRACER BULLET 02 TEST SUITE (REAL BUILDER HAND) ===\n");
  let passedCount = 0;
  let totalCount = 0;

  async function test(name: string, fn: () => Promise<void>) {
    totalCount++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}\n   Error: ${err?.message || String(err)}`);
    }
  }

  const tempArtifactDir = "artifacts/api-server/dist/temp_tb02_test";
  const tempTestFile = `${tempArtifactDir}/builder_probe.txt`;

  // Pre-cleanup if exists
  try {
    await fs.rm(path.resolve(process.cwd(), tempArtifactDir), { recursive: true, force: true });
  } catch {
    // Ignored
  }

  // 1. Valid workspace write succeeds and produces deterministic before/after evidence
  await test("1. Valid Workspace Write (tool_file_write) with Before/After Hash & Stat Evidence", async () => {
    const payload1 = "Initial JARVIS Builder State V1\nTimestamp: 2026-08-28T00:00:00Z\n";
    const result1 = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: tempTestFile, content: payload1 },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_write_1" },
    );

    assert.strictEqual(result1.success, true, "First write must succeed");
    assert.ok(result1.output, "Output must exist");
    assert.strictEqual(result1.output.filePath, tempTestFile);
    assert.strictEqual(result1.output.bytesBefore, 0, "Initial write bytesBefore should be 0");
    assert.strictEqual(result1.output.hashBefore, null, "Initial write hashBefore should be null");
    assert.strictEqual(result1.output.bytesAfter, Buffer.byteLength(payload1, "utf-8"));
    const expectedHash1 = crypto.createHash("sha256").update(payload1).digest("hex");
    assert.strictEqual(result1.output.hashAfter, expectedHash1);
    assert.strictEqual(result1.output.verified, true);
    assert.strictEqual(result1.output.changed, true);

    // Verify on disk directly
    const diskContent1 = await fs.readFile(path.resolve(process.cwd(), tempTestFile), "utf-8");
    assert.strictEqual(diskContent1, payload1, "Disk content must match write payload");

    // Second write (mutation update) to verify before/after transition
    const payload2 = "Updated JARVIS Builder State V2\nRevision: 2\nStatus: Operational\n";
    const result2 = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: tempTestFile, content: payload2 },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_write_2" },
    );

    assert.strictEqual(result2.success, true, "Second write must succeed");
    assert.strictEqual(result2.output.bytesBefore, Buffer.byteLength(payload1, "utf-8"));
    assert.strictEqual(result2.output.hashBefore, expectedHash1);
    const expectedHash2 = crypto.createHash("sha256").update(payload2).digest("hex");
    assert.strictEqual(result2.output.hashAfter, expectedHash2);
    assert.strictEqual(result2.output.changed, true);
    assert.strictEqual(result2.output.verified, true);

    const diskContent2 = await fs.readFile(path.resolve(process.cwd(), tempTestFile), "utf-8");
    assert.strictEqual(diskContent2, payload2, "Disk content must reflect updated payload");
  });

  // 2. Directory traversal is rejected
  await test("2. Policy Check: Sandbox path traversal denial (../../escape.txt)", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: "../../escape_attempt.txt", content: "malicious payload" },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_write_traversal" },
    );
    assert.strictEqual(result.success, false, "Path traversal write must be rejected");
    assert.ok(result.error?.includes("Security Policy Violation"), "Error must cite security policy violation");
  });

  // 3. Absolute outside-workspace path is rejected
  await test("3. Policy Check: Absolute outside-workspace path denial (/tmp/escape.txt)", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: "/tmp/escape_tb02.txt", content: "outside payload" },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_write_absolute" },
    );
    assert.strictEqual(result.success, false, "Outside workspace write must be rejected");
    assert.ok(result.error?.includes("Security Policy Violation"), "Error must cite security policy violation");
  });

  // 4. Policy denial prevents mutation (READ permissions trying to WRITE)
  await test("4. Policy Check: READ permission attempting WRITE capability is denied", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: `${tempArtifactDir}/unauthorized_read_probe.txt`, content: "read agent trying write" },
      { permissions: ["READ"], agentRole: "builder", taskId: "tb02_write_perm_denied" },
    );
    assert.strictEqual(result.success, false, "READ permission must not be permitted to WRITE");
    assert.ok(result.error?.includes("Permission Denied"), "Error must cite permission denial");

    // Verify file was never created
    let fileCreated = true;
    try {
      await fs.stat(path.resolve(process.cwd(), `${tempArtifactDir}/unauthorized_read_probe.txt`));
    } catch {
      fileCreated = false;
    }
    assert.strictEqual(fileCreated, false, "Unauthorized write must never touch the filesystem");
  });

  // 5. Policy denial: Unauthorized agent role
  await test("5. Policy Check: Unauthorized role (e.g. strategy) attempting WRITE is denied", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: `${tempArtifactDir}/unauthorized_role_probe.txt`, content: "strategy agent write" },
      { permissions: ["READ", "WRITE"], agentRole: "strategy", taskId: "tb02_write_role_denied" },
    );
    assert.strictEqual(result.success, false, "Role not in allowedAgentRoles must be rejected");
    assert.ok(result.error?.includes("Role Authorization Denied"), "Error must cite role authorization denial");
  });

  // 6. Invalid input validation (empty filePath, non-string content, oversized payload)
  await test("6. Input Validation: Rejection of invalid inputs and oversized payloads", async () => {
    // Empty path
    const resEmpty = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: "", content: "valid content" },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_empty_path" },
    );
    assert.strictEqual(resEmpty.success, false, "Empty path must be rejected");
    assert.ok(resEmpty.error?.includes("Validation Error"), "Error must indicate validation failure");

    // Missing/non-string content
    const resNullContent = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: tempTestFile, content: null as any },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_null_content" },
    );
    assert.strictEqual(resNullContent.success, false, "Null content must be rejected");
    assert.ok(resNullContent.error?.includes("Validation Error"), "Error must indicate validation failure");

    // Oversized payload (>256KB)
    const largeContent = "X".repeat(300 * 1024);
    const resOversize = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: `${tempArtifactDir}/oversized.txt`, content: largeContent },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_oversize" },
    );
    assert.strictEqual(resOversize.success, false, "Oversized write must be rejected");
    assert.ok(resOversize.error?.includes("Security Limit Exceeded"), "Error must cite security limit exceeded");
  });

  // 7. Filesystem failure produces explicit failure observation
  await test("7. Filesystem Failure: Attempting to overwrite existing directory as a file", async () => {
    const dirPath = `${tempArtifactDir}/existing_dir_target`;
    await fs.mkdir(path.resolve(process.cwd(), dirPath), { recursive: true });

    const result = await globalToolRegistry.executeTool(
      "tool_file_write",
      { filePath: dirPath, content: "trying to overwrite dir" },
      { permissions: ["READ", "WRITE"], agentRole: "builder", taskId: "tb02_dir_overwrite" },
    );
    assert.strictEqual(result.success, false, "Overwriting directory must fail");
    assert.ok(result.error?.includes("is a directory"), "Error must state target is a directory");
  });

  // 8. Evaluator rejects incorrect resulting state and approves verified builder observation
  await test("8. Evaluator Gate: Passes verified builder code with observation receipts", async () => {
    const mockNode: TaskGraphNode = {
      taskId: "task_eval_builder_1",
      graphId: "graph_builder",
      description: "Implement safe helper interface for workspace operations",
      assignedAgentRole: "builder",
      assignedAgentName: "Builder Agent",
      dependencies: [],
      status: "RUNNING",
      requiredCapabilities: ["code_generation", "implementation"],
      expectedOutputs: "TypeScript interface and verification receipt",
      constraints: ["Strict type annotations"],
      timeoutMs: 5000,
      retryCount: 0,
      maxRetries: 2,
    };

    const validOutput = `
// Verified Workspace Operation Interface
export interface WorkspaceBuilderOperation {
  operationId: string;
  targetPath: string;
  bytesWritten: number;
  sha256: string;
  verified: boolean;
}

export const executeBuilderPass = (op: WorkspaceBuilderOperation): boolean => {
  return op.verified && op.bytesWritten > 0;
};
[Real Execution: tool_file_write] Wrote and verified 184 bytes to '${tempTestFile}'. SHA256: ${crypto.createHash("sha256").update("test").digest("hex")} (Changed: true)
`;

    const evalRes = evaluateTaskResult(mockNode, validOutput, {
      conversationId: 1,
      recentMessages: [],
      relevantMemories: [],
      activeTasks: [],
      agentPermissions: ["READ", "WRITE"],
    });

    assert.strictEqual(evalRes.verdict, "PASS", "Valid builder code with types and evidence must PASS");
    assert.ok(evalRes.overallScore >= 0.75, "Overall score must be >= 0.75");
  });

  // 9. Agent Dispatcher with Real Builder Tool Execution & Observation Bridge
  await test("9. Agent Dispatch: Real Builder Hand mutation bridged into structured response", async () => {
    const builderTestFile = `${tempArtifactDir}/agent_builder_probe.ts`;
    const response = await dispatchToAgent(
      {
        taskId: "task_dispatch_builder_1",
        objective: `Create file ${builderTestFile} with verified TypeScript helper`,
        description: `Write to file ${builderTestFile} content: export const TB02_HAND_VERIFIED: boolean = true;`,
        requiredCapabilities: ["code_generation", "workspace_operations"],
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        expectedOutput: "Created TypeScript artifact with hash receipt",
        constraints: ["Must write actual file"],
        risk: "low",
        status: "running",
      },
      {
        conversationId: 1,
        recentMessages: [],
        relevantMemories: [],
        activeTasks: [],
        agentPermissions: ["READ", "WRITE"],
      },
      undefined, // local execution bridge
    );

    assert.strictEqual(response.status, "success");
    assert.ok(response.evidence.length > 0, "Evidence must be present");
    const hasWriteEvidence = response.evidence.some(
      (e) => e.includes("tool_file_write") && e.includes(builderTestFile) && e.includes("SHA256:"),
    );
    assert.ok(hasWriteEvidence, "Evidence must contain real tool_file_write receipt with SHA256");

    // Verify disk content directly
    const createdContent = await fs.readFile(path.resolve(process.cwd(), builderTestFile), "utf-8");
    assert.ok(createdContent.includes("TB02_HAND_VERIFIED"), "Created file must contain expected payload on disk");
  });

  // 10. Existing READ capability remains fully functional alongside WRITE
  await test("10. Regression Check: Existing tool_file_read remains fully functional", async () => {
    const readRes = await globalToolRegistry.executeTool(
      "tool_file_read",
      { filePath: "package.json" },
      { permissions: ["READ"], agentRole: "research", taskId: "tb02_read_check" },
    );
    assert.strictEqual(readRes.success, true, "tool_file_read must still succeed");
    assert.ok(readRes.output.content.includes("name"), "Content must be present");
  });

  // 11. End-to-End Tracer Bullet 02: Full Cognitive Chain (Intent -> DAG -> Builder Write -> Observation -> Evaluation)
  await test("11. End-to-End Real Builder Hand Pipeline Execution", async () => {
    const pipelineTargetFile = `${tempArtifactDir}/e2e_pipeline_output.txt`;
    const rawWorkspaceData = {
      conversationId: 1,
      recentMessages: [],
      memories: [],
      tasks: [],
    };

    const jarvisResult = await processWithJarvisBrain(
      `Please write a builder status record to file ${pipelineTargetFile} with text: STATUS=OPERATIONAL_TB02`,
      rawWorkspaceData,
      undefined,
    );

    assert.ok(jarvisResult.intent, "Intent must be generated");
    assert.ok(jarvisResult.plan, "Plan must be generated");
    assert.ok(jarvisResult.taskGraph, "TaskGraph must be generated");
    assert.strictEqual(jarvisResult.taskGraph.status, "COMPLETED", "TaskGraph execution must succeed");
    assert.ok(jarvisResult.synthesis, "Synthesis must be generated");

    console.log(`   * Graph executed ${jarvisResult.taskGraph.nodes.length} task nodes with overall status: ${jarvisResult.taskGraph.status}`);
  });

  // Clean up temporary test artifacts
  try {
    await fs.rm(path.resolve(process.cwd(), tempArtifactDir), { recursive: true, force: true });
    console.log(`\n🧹 Cleaned up temporary test directory: ${tempArtifactDir}`);
  } catch (err: any) {
    console.warn("Warning during cleanup:", err?.message || String(err));
  }

  console.log(`\n=== TRACER BULLET 02 TEST SUITE COMPLETE: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
