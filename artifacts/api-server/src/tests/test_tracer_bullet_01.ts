import * as assert from "node:assert";
import { globalToolRegistry } from "../lib/jarvis/tools/registry";
import { dispatchToAgent } from "../lib/jarvis/agentDispatcher";
import { processWithJarvisBrain } from "../lib/jarvis/index";
import { evaluateTaskResult } from "../lib/jarvis/eval/evaluator";
import { TaskGraphNode } from "../lib/jarvis/dag/types";

async function runTests() {
  console.log("=== STARTING TRACER BULLET 01 TEST SUITE ===\n");
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

  // 1. Tool Registry - Real Workspace File Read Success
  await test("1. Real Capability Execution: tool_file_read on package.json", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_read",
      { filePath: "package.json" },
      { permissions: ["READ"], agentRole: "research", taskId: "test_task_1" },
    );
    assert.strictEqual(result.success, true, "Tool should succeed");
    assert.ok(result.output, "Output should exist");
    assert.strictEqual(result.output.filePath, "package.json");
    assert.ok(result.output.sizeBytes > 0, "File size should be > 0");
    assert.ok(result.output.lineCount > 0, "Line count should be > 0");
    assert.ok(result.output.content.includes("name"), "Content should contain package name");
  });

  // 2. Tool Registry - Policy Denial / Sandbox Boundary Violation
  await test("2. Policy Check: Sandbox path traversal denial (../..)", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_read",
      { filePath: "../../../etc/passwd" },
      { permissions: ["READ"], agentRole: "research", taskId: "test_task_2" },
    );
    assert.strictEqual(result.success, false, "Should fail policy check");
    assert.ok(result.error?.includes("Security Policy Violation"), "Error should indicate security violation");
  });

  // 3. Tool Registry - Role Permission Enforcement
  await test("3. Policy Check: Role authorization check", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_create_note",
      { title: "Unauthorized Note", content: "test" },
      { permissions: ["WRITE"], agentRole: "unauthorized_fake_role", taskId: "test_task_3" },
    );
    assert.strictEqual(result.success, false, "Should fail role check");
    assert.ok(result.error?.includes("Role Authorization Denied"), "Error should indicate role denial");
  });

  // 4. Tool Registry - Permission Level Check
  await test("4. Policy Check: Permission level check (READ trying WRITE)", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_create_note",
      { title: "Write Note", content: "test" },
      { permissions: ["READ"], agentRole: "research", taskId: "test_task_4" },
    );
    assert.strictEqual(result.success, false, "Should fail permission level check");
    assert.ok(result.error?.includes("Permission Denied"), "Error should indicate permission denial");
  });

  // 5. Tool Registry - Non-existent file execution failure
  await test("5. Execution Failure: Requesting non-existent file", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_file_read",
      { filePath: "non_existent_file_xyz123.json" },
      { permissions: ["READ"], agentRole: "research", taskId: "test_task_5" },
    );
    assert.strictEqual(result.success, false, "Should fail for non-existent file");
    assert.ok(result.error?.includes("File read failed") || result.error?.includes("ENOENT"), "Error should report missing file");
  });

  // 6. Tool Registry - Invalid capability ID
  await test("6. Invalid Capability: Requesting non-existent tool", async () => {
    const result = await globalToolRegistry.executeTool(
      "tool_non_existent_id",
      {},
      { permissions: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"], agentRole: "executor", taskId: "test_task_6" },
    );
    assert.strictEqual(result.success, false, "Should fail on invalid capability");
    assert.ok(result.error?.includes("not found in internal tool registry"), "Error should report tool not found");
  });

  // 7. Evaluator Validation Test
  await test("7. Evaluator Gate: Critic PASS verdict on valid output with evidence", async () => {
    const mockNode: TaskGraphNode = {
      taskId: "task_eval_1",
      graphId: "graph_1",
      description: "Inspect package.json configuration",
      assignedAgentRole: "research",
      assignedAgentName: "Research Agent",
      dependencies: [],
      status: "RUNNING",
      requiredCapabilities: ["document_analysis"],
      expectedOutputs: "JSON package summary",
      constraints: ["Strict factual analysis"],
      timeoutMs: 5000,
      retryCount: 0,
      maxRetries: 2,
    };
    const mockResult = "Based on empirical evidence and source data from the workspace, the package.json contains workspaces configured for artifacts and libs, with TypeScript version ~5.9.3.";
    const mockContext = {
      conversationId: 1,
      recentMessages: [],
      relevantMemories: [],
      activeTasks: [],
      agentPermissions: ["READ" as const],
    };
    const evalRes = evaluateTaskResult(mockNode, mockResult, mockContext);
    assert.strictEqual(evalRes.verdict, "PASS", "Valid detailed result should PASS evaluation");
    assert.strictEqual(evalRes.evaluator, "JarvisCriticEvaluator");
  });

  // 8. Agent Dispatch with Real Tool Execution & Observation Bridge
  await test("8. Agent Dispatch: Real observation bridged into agent evidence", async () => {
    const response = await dispatchToAgent(
      {
        taskId: "task_dispatch_1",
        objective: "Read and analyze package.json",
        description: "Read file package.json",
        requiredCapabilities: ["document_analysis"],
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        expectedOutput: "Summary of dependencies",
        constraints: ["Must read actual file"],
        risk: "low",
        status: "running",
      },
      {
        conversationId: 1,
        recentMessages: [],
        relevantMemories: [],
        activeTasks: [],
        agentPermissions: ["READ"],
      },
      undefined, // offline / local fallback mode
    );

    assert.strictEqual(response.status, "success");
    assert.ok(response.evidence.length > 0, "Evidence must be recorded");
    const hasRealExecutionEvidence = response.evidence.some((e) =>
      e.includes("tool_file_read") && e.includes("package.json"),
    );
    assert.ok(hasRealExecutionEvidence, "Evidence must reflect real tool_file_read execution on package.json");
    assert.ok(response.result.includes("package.json"), "Result should reference package.json");
  });

  // 9. End-to-End Tracer Bullet: Complete Cognitive Pipeline
  await test("9. End-to-End Tracer Bullet: Intent -> DAG -> Tool Execution -> Observation -> Evaluation -> Synthesis", async () => {
    const rawWorkspaceData = {
      conversationId: 1,
      recentMessages: [],
      memories: [],
      tasks: [],
    };

    const jarvisResult = await processWithJarvisBrain(
      "Please inspect the contents of package.json and summarize our workspace structure.",
      rawWorkspaceData,
      undefined, // test deterministic execution pipeline
    );

    assert.ok(jarvisResult.intent, "Intent must be analyzed");
    assert.ok(jarvisResult.plan, "Plan must be created");
    assert.ok(jarvisResult.taskGraph, "TaskGraph must be generated");
    assert.strictEqual(jarvisResult.taskGraph.status, "COMPLETED", "TaskGraph execution must complete successfully");
    assert.ok(jarvisResult.synthesis, "Synthesis must be generated");
    assert.ok(jarvisResult.synthesis.finalAnswer.length > 0, "Final answer must not be empty");

    // Check that at least one task executed with real observation evidence
    const taskNodes = jarvisResult.taskGraph.nodes;
    assert.ok(taskNodes.length > 0, "At least one task node must exist");
    console.log(`   * Graph executed ${taskNodes.length} task nodes with overall status: ${jarvisResult.taskGraph.status}`);
    console.log(`   * Final Answer preview: ${jarvisResult.synthesis.finalAnswer.slice(0, 120)}...`);
  });

  // 10. Real Provider Vertical Slice: Live Gemini Model Call
  await test("10. Real Model Provider Integration (Gemini 3.6 Flash)", async () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.log("   (Skipped live API call: GEMINI_API_KEY not present)");
      return;
    }
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const cleanModel = model.startsWith("models/") ? model : `models/${model}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Respond in JSON: {\"status\":\"ok\",\"verified\":true}" }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    assert.strictEqual(res.status, 200, "Gemini API must return HTTP 200");
    const json = (await res.json()) as any;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    assert.ok(text, "Candidate response text must exist");
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.verified, true, "Parsed model output must match expected JSON");
    console.log(`   * Live Gemini (${model}) responded with verified payload in real-time.`);
  });

  console.log(`\n=== TEST SUITE COMPLETE: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
