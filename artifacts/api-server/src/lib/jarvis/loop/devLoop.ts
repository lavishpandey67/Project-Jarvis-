import * as path from "node:path";
import { globalToolRegistry } from "../tools/registry";
import { CognitiveMemoryStore } from "../memory/store";
import { evaluateTaskResult } from "../eval/evaluator";
import { ModelCaller } from "../intentAnalyzer";
import { ScopedContext } from "../types";
import { TaskGraphNode } from "../dag/types";

export interface AutonomousLoopCycleStep {
  cycle: number;
  stage: "DISCOVER" | "READ" | "REASON" | "WRITE" | "TEST" | "EVALUATE" | "VERIFY" | "LESSON";
  toolId?: string;
  actionSummary: string;
  success: boolean;
  observation?: any;
  error?: string;
  timestamp: string;
}

export interface AutonomousLoopResult {
  success: boolean;
  totalCycles: number;
  maxCycles: number;
  initialFailure: {
    command: string;
    exitCode: number;
    stderr: string;
    reason: string;
  };
  recoveryAction: {
    targetFile: string;
    bytesBefore: number;
    bytesAfter: number;
    hashBefore: string | null;
    hashAfter: string;
  };
  finalVerification: {
    command: string;
    exitCode: number;
    stdout: string;
    durationMs: number;
    verified: boolean;
  };
  recordedLesson: {
    memoryId: string;
    title: string;
    failure: string;
    cause: string;
    action: string;
    result: string;
  };
  steps: AutonomousLoopCycleStep[];
}

export interface RunAutonomousLoopOptions {
  fixtureDir: string;
  testScript: string;
  sourceFile: string;
  fixLogic: (sourceContent: string, failureReason: string) => string;
  maxAttempts?: number;
  callModelFn?: ModelCaller;
  context?: ScopedContext;
}

/**
 * Executes a REAL Autonomous Software Development Loop:
 * UNDERSTAND -> PLAN -> READ -> WRITE -> RUN TEST -> OBSERVE ACTUAL RESULT
 * -> EVALUATE -> IF FAILURE, REASON FROM OBSERVATION -> MODIFY -> RUN AGAIN
 * -> VERIFY SUCCESS -> STORE LESSON -> RETURN RESULT
 */
export async function runAutonomousSoftwareLoop(
  options: RunAutonomousLoopOptions,
): Promise<AutonomousLoopResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const memoryStore = CognitiveMemoryStore.getInstance();
  const steps: AutonomousLoopCycleStep[] = [];

  const context: ScopedContext = options.context || {
    conversationId: 1,
    recentMessages: [],
    relevantMemories: [],
    activeTasks: [],
    agentPermissions: ["EXECUTE", "WRITE", "READ"],
  };

  let initialFailureObs: any = null;
  let recoveryActionObs: any = null;
  let finalVerificationObs: any = null;
  let recordedLessonData: any = null;

  let currentAttempt = 1;
  let isResolved = false;

  while (currentAttempt <= maxAttempts && !isResolved) {
    const cycleStart = currentAttempt;

    // STEP 1: RUN TEST & OBSERVE ACTUAL RESULT (Execution Authority in Runtime)
    const testExec = await globalToolRegistry.executeTool(
      "tool_run_test",
      {
        testCommand: `node ${options.testScript}`,
        targetPath: options.testScript,
      },
      {
        permissions: ["EXECUTE", "READ", "WRITE"],
        agentRole: "builder",
        taskId: `loop_test_cycle_${cycleStart}`,
      },
    );

    steps.push({
      cycle: cycleStart,
      stage: "TEST",
      toolId: "tool_run_test",
      actionSummary: `Executed test command: 'node ${options.testScript}'`,
      success: testExec.output?.passed === true,
      observation: testExec.output,
      error: testExec.error,
      timestamp: new Date().toISOString(),
    });

    if (testExec.output?.passed === true) {
      // Test passed!
      isResolved = true;
      finalVerificationObs = {
        command: `node ${options.testScript}`,
        exitCode: testExec.output.exitCode,
        stdout: testExec.output.stdout,
        durationMs: testExec.output.durationMs,
        verified: true,
      };

      steps.push({
        cycle: cycleStart,
        stage: "VERIFY",
        actionSummary: `Test verified green with exit code 0 in ${testExec.output.durationMs}ms`,
        success: true,
        observation: finalVerificationObs,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    // Capture initial failure evidence on first failure
    if (!initialFailureObs) {
      initialFailureObs = {
        command: `node ${options.testScript}`,
        exitCode: testExec.output?.exitCode ?? 1,
        stderr: testExec.output?.stderr || testExec.output?.stdout || testExec.error || "Non-zero exit code",
        reason: testExec.output?.testFailureReason || testExec.error || "Test assertion failed",
      };
    }

    // STEP 2: EVALUATE & REASON FROM REAL OBSERVATION
    const failedNode: TaskGraphNode = {
      taskId: `task_loop_${cycleStart}`,
      graphId: `graph_loop_${cycleStart}`,
      assignedAgentName: "JarvisBuilderAgent",
      assignedAgentRole: "builder",
      description: `Run deterministic test '${options.testScript}' and verify source file '${options.sourceFile}'`,
      dependencies: [],
      status: "FAILED",
      requiredCapabilities: ["testing", "code_generation", "debugging"],
      constraints: ["Strict verification", "No simulated outputs"],
      expectedOutputs: "Passing test exit code 0",
      timeoutMs: 10000,
      retryCount: cycleStart,
      maxRetries: 3,
      revisionCount: cycleStart,
      maxRevisionCycles: maxAttempts,
      allowPartialDependency: false,
    };

    const evalResult = evaluateTaskResult(
      failedNode,
      `[Real Workspace Test Execution Observation]: Command: 'node ${options.testScript}', ExitCode: ${testExec.output?.exitCode}, Passed: false.\nStderr: ${testExec.output?.stderr}\nFailureReason: ${testExec.output?.testFailureReason}`,
      context,
    );

    steps.push({
      cycle: cycleStart,
      stage: "EVALUATE",
      actionSummary: `Evaluated failure: ${evalResult.verdict} (Score: ${evalResult.overallScore})`,
      success: true,
      observation: evalResult,
      timestamp: new Date().toISOString(),
    });

    // STEP 3: READ SOURCE CODE (REAL READ)
    const readExec = await globalToolRegistry.executeTool(
      "tool_file_read",
      { filePath: options.sourceFile },
      {
        permissions: ["READ"],
        agentRole: "builder",
        taskId: `loop_read_cycle_${cycleStart}`,
      },
    );

    steps.push({
      cycle: cycleStart,
      stage: "READ",
      toolId: "tool_file_read",
      actionSummary: `Read target source file '${options.sourceFile}' (${readExec.output?.sizeBytes || 0} bytes)`,
      success: readExec.success,
      observation: readExec.output,
      error: readExec.error,
      timestamp: new Date().toISOString(),
    });

    if (!readExec.success || !readExec.output?.content) {
      throw new Error(`Failed to read source file '${options.sourceFile}': ${readExec.error}`);
    }

    // STEP 4: REASON & SYNTHESIZE RECOVERY PATCH
    const currentCode = readExec.output.content;
    const failureReason = testExec.output?.testFailureReason || testExec.output?.stderr || "Assertion failure";
    
    let patchedCode = "";
    if (options.callModelFn) {
      // Query model for patch reasoning grounded in real failure observation
      try {
        const modelResp = await options.callModelFn([
          {
            role: "system",
            content: `You are JARVIS Autonomous Builder. Fix the source code to resolve the observed test failure.
Return JSON ONLY: { "patchedCode": "...", "reasoning": "..." }`,
          },
          {
            role: "user",
            content: `Source File: ${options.sourceFile}
Current Source Code:
\`\`\`
${currentCode}
\`\`\`
Test Failure Observation:
Command: node ${options.testScript}
Exit Code: ${testExec.output?.exitCode}
Stderr/Stdout:
${testExec.output?.stderr || testExec.output?.stdout}
Failure Reason: ${failureReason}`,
          },
        ], true);
        const parsed = JSON.parse(modelResp);
        patchedCode = parsed.patchedCode || options.fixLogic(currentCode, failureReason);
      } catch {
        patchedCode = options.fixLogic(currentCode, failureReason);
      }
    } else {
      patchedCode = options.fixLogic(currentCode, failureReason);
    }

    steps.push({
      cycle: cycleStart,
      stage: "REASON",
      actionSummary: `Synthesized corrective patch for '${options.sourceFile}' targeting '${failureReason.slice(0, 80)}'`,
      success: true,
      timestamp: new Date().toISOString(),
    });

    // STEP 5: WRITE MODIFICATION TO DISK (REAL WRITE)
    const writeExec = await globalToolRegistry.executeTool(
      "tool_file_write",
      {
        filePath: options.sourceFile,
        content: patchedCode,
      },
      {
        permissions: ["WRITE", "EXECUTE"],
        agentRole: "builder",
        taskId: `loop_write_cycle_${cycleStart}`,
      },
    );

    steps.push({
      cycle: cycleStart,
      stage: "WRITE",
      toolId: "tool_file_write",
      actionSummary: `Applied patch to '${options.sourceFile}' (bytes: ${writeExec.output?.bytesBefore} -> ${writeExec.output?.bytesAfter}, SHA256: ${writeExec.output?.hashAfter})`,
      success: writeExec.success,
      observation: writeExec.output,
      error: writeExec.error,
      timestamp: new Date().toISOString(),
    });

    if (!writeExec.success || !writeExec.output?.verified) {
      throw new Error(`Failed writing patch to '${options.sourceFile}': ${writeExec.error}`);
    }

    recoveryActionObs = {
      targetFile: options.sourceFile,
      bytesBefore: writeExec.output.bytesBefore,
      bytesAfter: writeExec.output.bytesAfter,
      hashBefore: writeExec.output.hashBefore,
      hashAfter: writeExec.output.hashAfter,
    };

    // Proceed to next attempt to re-test and verify
    currentAttempt++;
  }

  if (!isResolved) {
    return {
      success: false,
      totalCycles: currentAttempt - 1,
      maxCycles: maxAttempts,
      initialFailure: initialFailureObs || { command: "", exitCode: 1, stderr: "Failed to resolve", reason: "Max attempts exceeded" },
      recoveryAction: recoveryActionObs || { targetFile: options.sourceFile, bytesBefore: 0, bytesAfter: 0, hashBefore: null, hashAfter: "" },
      finalVerification: { command: `node ${options.testScript}`, exitCode: 1, stdout: "", durationMs: 0, verified: false },
      recordedLesson: { memoryId: "", title: "", failure: "", cause: "", action: "", result: "FAILED" },
      steps,
    };
  }

  // STEP 6: STORE THE LESSON IN COGNITIVE MEMORY (Real Memory Record)
  const lessonId = `lesson_autoloop_${Date.now()}`;
  const lessonTitle = `Autonomous Loop Recovery: Fix '${options.sourceFile}'`;
  const lessonContent = `FAILURE: ${initialFailureObs.reason} (Exit Code: ${initialFailureObs.exitCode})\nCAUSE: Logic error in source file '${options.sourceFile}'.\nACTION: Analyzed real test observation and applied verified code patch.\nRESULT: Test '${options.testScript}' verified PASS (Exit Code: 0) in ${finalVerificationObs?.durationMs}ms.`;

  const memoryRecord = await memoryStore.addMemory({
    id: lessonId,
    memoryType: "LESSON",
    title: lessonTitle,
    content: lessonContent,
    source: "SYSTEM",
    confidence: 1.0,
    importance: 5,
    validity: "FACT",
    metadata: {
      initialFailure: initialFailureObs,
      recoveryAction: recoveryActionObs,
      finalVerification: finalVerificationObs,
    },
  });

  recordedLessonData = {
    memoryId: memoryRecord.id,
    title: memoryRecord.title,
    failure: initialFailureObs.reason,
    cause: `Logic mismatch in ${options.sourceFile}`,
    action: `Applied read-back verified patch to ${options.sourceFile}`,
    result: `Exit Code 0 verified green in ${finalVerificationObs?.durationMs}ms`,
  };

  steps.push({
    cycle: currentAttempt,
    stage: "LESSON",
    actionSummary: `Recorded recovery lesson '${lessonTitle}' to Cognitive Memory (${memoryRecord.id})`,
    success: true,
    observation: recordedLessonData,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    totalCycles: currentAttempt,
    maxCycles: maxAttempts,
    initialFailure: initialFailureObs,
    recoveryAction: recoveryActionObs,
    finalVerification: finalVerificationObs,
    recordedLesson: recordedLessonData,
    steps,
  };
}
