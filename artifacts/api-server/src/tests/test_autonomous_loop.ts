import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as assert from "node:assert";
import { runAutonomousSoftwareLoop } from "../lib/jarvis/loop/devLoop";
import { globalToolRegistry } from "../lib/jarvis/tools/registry";
import { CognitiveMemoryStore } from "../lib/jarvis/memory/store";

async function runAutonomousDevLoopSuite() {
  console.log("=== STARTING AUTONOMOUS SOFTWARE-DEVELOPMENT LOOP TEST SUITE ===");

  const tempWorkspaceDir = "artifacts/api-server/dist/temp_autoloop_fixture";
  const absTempDir = path.resolve(process.cwd(), tempWorkspaceDir);

  await fs.rm(absTempDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(absTempDir, { recursive: true });

  const sourceRelPath = `${tempWorkspaceDir}/calculator.mjs`;
  const testRelPath = `${tempWorkspaceDir}/test_calculator.mjs`;

  // 1. Initial State: A deliberately failing software fixture
  // Bug: add(a, b) returns a - b (wrong logic)
  const initialSourceCode = `// Deterministic Calculator Fixture
export function add(a, b) {
  return a - b; // DELIBERATE BUG: subtraction instead of addition
}

export function multiply(a, b) {
  return a * b;
}
`;

  // Test script that asserts add(2, 3) === 5
  const testScriptCode = `import * as assert from "node:assert";
import { add, multiply } from "./calculator.mjs";

console.log("Running Fixture Test: add(2, 3)...");
const result = add(2, 3);
assert.strictEqual(result, 5, \`Expected add(2, 3) to be 5, but got \${result}\`);
console.log("Running Fixture Test: multiply(4, 5)...");
assert.strictEqual(multiply(4, 5), 20);
console.log("ALL FIXTURE TESTS PASSED!");
`;

  await fs.writeFile(path.resolve(process.cwd(), sourceRelPath), initialSourceCode, "utf-8");
  await fs.writeFile(path.resolve(process.cwd(), testRelPath), testScriptCode, "utf-8");

  console.log(`\n📁 Initialized Temporary Fixture in: ${tempWorkspaceDir}`);
  console.log(`   * Source: ${sourceRelPath}`);
  console.log(`   * Test: ${testRelPath}`);

  // Test 1: Direct Verification of Initial Failure via tool_run_test
  {
    console.log("\n[TEST 1] Testing Real Execution of Failing Fixture...");
    const initialRun = await globalToolRegistry.executeTool(
      "tool_run_test",
      { testCommand: `node ${testRelPath}`, targetPath: testRelPath },
      { permissions: ["EXECUTE"], agentRole: "builder", taskId: "test_initial_fail" },
    );

    assert.strictEqual(initialRun.success, false, "Initial run must fail due to assertion bug");
    assert.strictEqual(initialRun.output?.passed, false, "Test output passed must be false");
    assert.ok(initialRun.output?.exitCode !== 0, "Exit code must be non-zero");
    assert.ok(initialRun.output?.testFailureReason?.includes("Expected add(2, 3) to be 5, but got -1"), "Assertion failure must be clearly captured");
    console.log("✅ PASS: 1. Discovered and observed real initial test failure accurately.");
  }

  // Test 2: Security & Safety Policy Check: Disallow unwhitelisted or destructive commands
  {
    console.log("\n[TEST 2] Testing Policy Gating on Disallowed / Unsafe Commands...");
    const unsafeRun = await globalToolRegistry.executeTool(
      "tool_run_test",
      { testCommand: "curl https://example.com" },
      { permissions: ["EXECUTE"], agentRole: "builder", taskId: "test_unsafe_cmd" },
    );
    assert.strictEqual(unsafeRun.success, false, "Unapproved command prefix must be denied");
    assert.ok(unsafeRun.error?.includes("Security Policy Violation"), "Must cite security policy violation");

    const injectionRun = await globalToolRegistry.executeTool(
      "tool_run_test",
      { testCommand: `node ${testRelPath}; rm -rf /tmp` },
      { permissions: ["EXECUTE"], agentRole: "builder", taskId: "test_cmd_injection" },
    );
    assert.strictEqual(injectionRun.success, false, "Command chaining must be denied");
    assert.ok(injectionRun.error?.includes("Security Policy Violation"), "Must cite prohibited chaining operators");
    console.log("✅ PASS: 2. Security policy strictly denies unwhitelisted commands and shell injection.");
  }

  // Test 3: Execute Full Autonomous Software Development Loop
  {
    console.log("\n[TEST 3] Running Complete Real Autonomous Software Loop...");
    const loopResult = await runAutonomousSoftwareLoop({
      fixtureDir: tempWorkspaceDir,
      testScript: testRelPath,
      sourceFile: sourceRelPath,
      fixLogic: (currentCode: string, failureReason: string) => {
        // Deterministic reasoner: replaces 'return a - b;' with 'return a + b;'
        return currentCode.replace("return a - b;", "return a + b;");
      },
      maxAttempts: 3,
    });

    assert.strictEqual(loopResult.success, true, "Autonomous loop must successfully complete");
    assert.ok(loopResult.totalCycles >= 2, "Loop must have executed at least 2 cycles (Initial Fail -> Heal -> Pass)");
    assert.strictEqual(loopResult.initialFailure.exitCode, 1, "Initial failure exit code must be 1");
    assert.ok(loopResult.initialFailure.reason.includes("Expected add(2, 3) to be 5, but got -1"), "Initial failure reason recorded");

    // Verify recovery filesystem action
    assert.ok(loopResult.recoveryAction.bytesBefore > 0, "Source file had initial bytes before patch");
    assert.ok(loopResult.recoveryAction.bytesAfter > 0, "Source file has updated bytes after patch");
    assert.notStrictEqual(loopResult.recoveryAction.hashBefore, loopResult.recoveryAction.hashAfter, "File hash changed upon repair");

    // Verify final test verification
    assert.strictEqual(loopResult.finalVerification.exitCode, 0, "Final test exit code must be 0");
    assert.strictEqual(loopResult.finalVerification.verified, true, "Final test status verified green");
    assert.ok(loopResult.finalVerification.stdout.includes("ALL FIXTURE TESTS PASSED!"), "Final stdout must contain test success marker");

    // Verify memory lesson was stored
    assert.ok(loopResult.recordedLesson.memoryId.startsWith("lesson_"), "Lesson memory ID created");
    assert.ok(loopResult.recordedLesson.action.includes("patch"), "Lesson contains corrective action");
    assert.ok(loopResult.recordedLesson.result.includes("Exit Code 0"), "Lesson contains verified result");

    const memoryStore = CognitiveMemoryStore.getInstance();
    const storedMemory = await memoryStore.getMemory(loopResult.recordedLesson.memoryId);
    assert.ok(storedMemory, "Stored lesson memory must exist in CognitiveMemoryStore");
    assert.strictEqual(storedMemory?.memoryType, "LESSON", "Memory type must be LESSON");

    console.log("✅ PASS: 3. Complete Autonomous Loop: Discover -> Read -> Reason -> Patch -> Retest -> Verify -> Lesson Store.");
  }

  // Test 4: Bounded Recovery - Max Cycles Limit on Unfixable Bug
  {
    console.log("\n[TEST 4] Testing Bounded Recovery with Max Attempts Limit...");
    // Reset calculator to bug and run with a no-op fix logic
    await fs.writeFile(path.resolve(process.cwd(), sourceRelPath), initialSourceCode, "utf-8");

    const boundedResult = await runAutonomousSoftwareLoop({
      fixtureDir: tempWorkspaceDir,
      testScript: testRelPath,
      sourceFile: sourceRelPath,
      fixLogic: (code) => code, // Does not fix bug
      maxAttempts: 2,
    });

    assert.strictEqual(boundedResult.success, false, "Unfixable task must return explicit failure");
    assert.strictEqual(boundedResult.totalCycles, 2, "Must terminate strictly at maxCycles limit (2 attempts)");
    console.log("✅ PASS: 4. Bounded recovery strictly terminates at max cycles with explicit failure.");
  }

  // Cleanup
  await fs.rm(absTempDir, { recursive: true, force: true }).catch(() => {});
  console.log(`\n🧹 Cleaned up temporary test directory: ${tempWorkspaceDir}`);
  console.log("\n=== ALL AUTONOMOUS SOFTWARE-DEVELOPMENT LOOP TESTS PASSED (4/4) ===");
}

runAutonomousDevLoopSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
