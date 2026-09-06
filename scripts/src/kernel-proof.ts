import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// This proof intentionally runs in a separate process while importing the API
// source at runtime. Keeping the import dynamic prevents the scripts package
// from absorbing the API source tree into its own TypeScript project.
const kernel: any = await import(
  new URL("../../artifacts/api-server/src/lib/jarvis/executionKernel.ts", import.meta.url).href
);
const { globalToolRegistry }: any = await import(
  new URL("../../artifacts/api-server/src/lib/jarvis/tools/registry.ts", import.meta.url).href
);
const {
  beginExecutionAttempt,
  completeExecutionAttempt,
  getExecutionTrace,
  listRelevantLessons,
  recordEvaluation,
  recordObservation,
  recordRecovery,
  recordLesson,
  startOrResumeExecution,
  transitionExecution,
  authorizeExecution,
} = kernel;

const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? "orchestrate";
const executionId =
  process.argv.find((arg) => arg.startsWith("--executionId="))?.split("=")[1] ??
  `proof_${randomUUID()}`;
const objective = "Prove bounded recovery and durable lesson retrieval";

async function executeProofTool(command: string, taskId: string) {
  return globalToolRegistry.executeTool(
    "tool_run_test",
    { testCommand: command, targetPath: "scripts" },
    { permissions: ["EXECUTE"], agentRole: "executor", taskId },
  );
}

async function interrupt() {
  await startOrResumeExecution({ executionId, requestId: `proof_${executionId}`, objective });
  await authorizeExecution(executionId);
  await transitionExecution(executionId, "EXECUTED", { proofPhase: "deliberate-safe-failure" });
  const attemptId = await beginExecutionAttempt(executionId, "proof-node");
  const failure = await executeProofTool("node src/kernel-proof-failure.mjs", `${executionId}:proof-node`);
  if (failure.success) throw new Error("Proof expected the safe failure tool to fail.");
  await completeExecutionAttempt(attemptId, "FAILED", failure.error);
  const observationId = await recordObservation(executionId, {
    source: "tool_run_test",
    nodeId: "proof-node",
    success: false,
    data: failure.output ?? { error: failure.error },
  });
  await recordRecovery(executionId, {
    nodeId: "proof-node",
    attemptNumber: 1,
    classification: "DETERMINISTIC_SAFE_TEST_FAILURE",
    action: "Resume the persisted execution in a new process and re-run the safe test",
    status: "READY",
    observationId,
  });
  await transitionExecution(executionId, "RECOVERING", {
    reason: "Intentional safe failure recorded; execution is resumable.",
  });
  const trace = await getExecutionTrace(executionId);
  if (trace.journal?.state !== "RECOVERING") throw new Error("Proof did not persist RECOVERING state.");
  console.log(`INTERRUPTED_EXECUTION=${executionId}`);
}

async function resume() {
  await startOrResumeExecution({ executionId, requestId: `proof_${executionId}`, objective });
  await authorizeExecution(executionId);
  await transitionExecution(executionId, "EXECUTED", { proofPhase: "re-execution" });
  const attemptId = await beginExecutionAttempt(executionId, "proof-node");
  const success = await executeProofTool("node src/kernel-proof-success.mjs", `${executionId}:proof-node`);
  if (!success.success) throw new Error(`Proof re-execution failed: ${success.error}`);
  await completeExecutionAttempt(attemptId, "SUCCEEDED");
  await recordObservation(executionId, {
    source: "tool_run_test",
    nodeId: "proof-node",
    success: true,
    data: success.output,
  });
  await recordEvaluation(executionId, {
    nodeId: "proof-node",
    verdict: "PASS",
    score: 1,
    reasons: ["The real sandboxed tool returned exit code 0 after resume."],
    evidence: success.output,
  });
  await transitionExecution(executionId, "OBSERVED", { source: "tool_run_test", passed: true });
  await transitionExecution(executionId, "EVALUATED", { verdict: "PASS" });
  await transitionExecution(executionId, "COMPLETED", { proof: "recovery-and-resume" });
  await recordLesson(executionId, {
    objective,
    content: "A safe tool failure can be persisted as RECOVERING, resumed by a new process, re-executed, observed, evaluated, and completed.",
    retrievalKey: "bounded recovery durable lesson",
  });

  const trace = await getExecutionTrace(executionId);
  const lessons = await listRelevantLessons(objective);
  if (trace.journal?.state !== "COMPLETED") throw new Error("Proof did not complete after resume.");
  if (trace.recoveries.length < 1 || trace.observations.length < 2) {
    throw new Error("Proof trace is missing recovery or before/after observations.");
  }
  if (!lessons.some((lesson: any) => lesson.executionId === executionId)) {
    throw new Error("Proof lesson was not retrievable by a later execution.");
  }
  console.log(
    JSON.stringify({
      executionId,
      state: trace.journal.state,
      eventCount: trace.events.length,
      attemptCount: trace.attempts.length,
      observationCount: trace.observations.length,
      recoveryCount: trace.recoveries.length,
      lessonRetrieved: true,
    }),
  );
}

if (phase === "interrupt") {
  await interrupt();
} else if (phase === "resume") {
  await resume();
} else {
  const interruptResult = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "./src/kernel-proof.ts", `--phase=interrupt`, `--executionId=${executionId}`],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (interruptResult.status !== 0) process.exit(interruptResult.status ?? 1);
  const resumeResult = spawnSync(
    "pnpm",
    ["--filter", "@workspace/scripts", "exec", "tsx", "./src/kernel-proof.ts", `--phase=resume`, `--executionId=${executionId}`],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (resumeResult.status !== 0) process.exit(resumeResult.status ?? 1);
}