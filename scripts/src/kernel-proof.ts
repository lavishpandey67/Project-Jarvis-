import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";

const failCmd = fs.existsSync("src/kernel-proof-failure.mjs")
  ? "node src/kernel-proof-failure.mjs"
  : "node scripts/src/kernel-proof-failure.mjs";
const successCmd = fs.existsSync("src/kernel-proof-success.mjs")
  ? "node src/kernel-proof-success.mjs"
  : "node scripts/src/kernel-proof-success.mjs";

const {
  respondWithCompanion,
  resumeCompanionExecution,
  getDurableExecutionTrace,
  createConversation,
  listConversations,
  InterruptedExecutionError,
}: any = await import(
  new URL("../../artifacts/api-server/src/lib/workforce.ts", import.meta.url).href
);

const { closeDatabase }: any = await import(
  new URL("../../lib/db/src/index.ts", import.meta.url).href
);

const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.split("=")[1] ?? "orchestrate";
const executionId =
  process.argv.find((arg) => arg.startsWith("--executionId="))?.split("=")[1] ??
  `proof_${randomUUID()}`;

async function interruptPhase(execId: string) {
  console.log(`\n=== [PHASE 1: RUNTIME INTERRUPTION VIA RESPONDWITHCOMPANION] ===`);
  console.log(`Starting execution: ${execId}`);

  let conversations = await listConversations();
  let conversation = conversations[0];
  if (!conversation) {
    conversation = await createConversation({ title: "Kernel Proof Verification" });
  }

  const proofGraph = {
    graphId: `graph_${execId}`,
    requestId: `req_${execId}`,
    objective: "Verify durable in-flight execution, interruption, and recovery",
    status: "RUNNING",
    createdAt: new Date().toISOString(),
    nodes: [
      {
        taskId: "node-1",
        graphId: `graph_${execId}`,
        description: "Write verification artifact",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: [],
        dependencies: [],
        inputs: {
          tool: "tool_file_write",
          args: { filePath: ".data/proof_step1.txt", content: "step 1 verified" },
        },
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 30000,
      },
      {
        taskId: "node-2",
        graphId: `graph_${execId}`,
        description: "Execute test suite with failure and recovery",
        assignedAgentRole: "executor",
        assignedAgentName: "Executor Agent",
        requiredCapabilities: [],
        dependencies: ["node-1"],
        inputs: {
          tool: "tool_run_test",
          args: { testCommand: failCmd },
          retryToolArgs: { testCommand: successCmd },
        },
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 30000,
      },
    ],
  };

  let interruptedCleanly = false;
  try {
    await respondWithCompanion(
      {
        conversationId: conversation.id,
        message: "Verify durable in-flight execution, interruption, and recovery",
      },
      {
        executionId: execId,
        interruptAfterNodeId: "node-1",
        taskGraph: proofGraph,
      },
    );
  } catch (err: any) {
    if (err.name === "InterruptedExecutionError" || err instanceof InterruptedExecutionError) {
      interruptedCleanly = true;
      console.log(`[Phase 1 PASS] Execution cleanly interrupted after node-1 as expected.`);
    } else {
      console.error(`[Phase 1 ERROR] Unexpected error:`, err);
      throw err;
    }
  }

  if (!interruptedCleanly) {
    throw new Error(
      "[Phase 1 FAIL] Expected execution to be interrupted after node-1, but it finished without InterruptedExecutionError.",
    );
  }

  // Inspect durable database state
  const trace = await getDurableExecutionTrace(execId);
  console.log(`[Phase 1 State] Journal state: ${trace.journal?.state}`);
  console.log(`[Phase 1 State] Current Node: ${trace.journal?.currentNodeId}`);
  console.log(
    `[Phase 1 Nodes]:`,
    trace.graph.map((n: any) => ({ nodeId: n.nodeId, state: n.state })),
  );
  console.log(
    `[Phase 1 Evidence Count]: ${trace.actions.length} actions, ${trace.observations.length} observations, ${trace.attempts.length} attempts`,
  );

  const node1 = trace.graph.find((n: any) => n.nodeId === "node-1");
  const node2 = trace.graph.find((n: any) => n.nodeId === "node-2");

  if (!node1 || node1.state !== "SUCCESS") {
    throw new Error(`[Phase 1 FAIL] Expected node-1 to be SUCCESS in DB, but was: ${node1?.state}`);
  }
  if (!node2 || node2.state !== "PENDING") {
    throw new Error(`[Phase 1 FAIL] Expected node-2 to be PENDING in DB, but was: ${node2?.state}`);
  }

  await closeDatabase();
  console.log(`[Phase 1 SUCCESS] Database connection closed cleanly. Ready for Phase 2 resume.`);
}

async function resumePhase(execId: string) {
  console.log(`\n=== [PHASE 2: RESTART & RESUME IN SEPARATE PROCESS VIA RESUMECOMPANIONEXECUTION] ===`);
  console.log(`Resuming execution: ${execId}`);

  // 1. Verify DB journal before resume
  const preTrace = await getDurableExecutionTrace(execId);
  console.log(
    `[Phase 2 Pre-Resume State] Journal state: ${preTrace.journal?.state}, currentNode: ${preTrace.journal?.currentNodeId}`,
  );
  const preNode1 = preTrace.graph.find((n: any) => n.nodeId === "node-1");
  if (preNode1?.state !== "SUCCESS") {
    throw new Error(`[Phase 2 FAIL] Pre-resume node-1 is not in SUCCESS state.`);
  }

  // Count events before resume to verify idempotency
  const preNode1Actions = preTrace.actions.filter((a: any) => a.nodeId === "node-1").length;
  console.log(`[Phase 2 Check] Pre-resume node-1 action count: ${preNode1Actions}`);

  // 2. Call resumeCompanionExecution (Production execution path)
  const resumeResult = await resumeCompanionExecution(execId);
  console.log(`[Phase 2 Resume Response Status]: ${resumeResult.executionState}`);

  // 3. Inspect finalized trace from DB
  const postTrace = await getDurableExecutionTrace(execId);
  console.log(`[Phase 2 Post-Resume State] Journal state: ${postTrace.journal?.state}`);
  console.log(`[Phase 2 Resume Count]: ${postTrace.journal?.resumeCount}`);

  // 4. Verify Node 1 was NOT replayed (Idempotency)
  const postNode1Actions = postTrace.actions.filter((a: any) => a.nodeId === "node-1").length;
  console.log(
    `[Phase 2 Check] Post-resume node-1 action count: ${postNode1Actions} (Expected: ${preNode1Actions})`,
  );
  if (postNode1Actions !== preNode1Actions) {
    throw new Error(
      `[Phase 2 FAIL] Idempotency violated: node-1 was replayed (${postNode1Actions} > ${preNode1Actions})!`,
    );
  }

  // 5. Verify Node 2 executed, recovered, and passed
  const node2 = postTrace.graph.find((n: any) => n.nodeId === "node-2");
  if (node2?.state !== "SUCCESS") {
    throw new Error(`[Phase 2 FAIL] Node-2 did not complete with SUCCESS: ${node2?.state}`);
  }

  // 6. Verify Recovery lifecycle was triggered and succeeded
  const recoveries = postTrace.recoveries.filter((r: any) => r.nodeId === "node-2");
  console.log(`[Phase 2 Recovery Count for node-2]: ${recoveries.length}`);
  if (recoveries.length === 0) {
    throw new Error(`[Phase 2 FAIL] Expected at least one recovery record for node-2, found none.`);
  }
  const lastRecovery = recoveries[recoveries.length - 1];
  console.log(`[Phase 2 Recovery Record]:`, {
    classification: lastRecovery.classification,
    action: lastRecovery.action,
    status: lastRecovery.status,
  });
  if (lastRecovery.status !== "SUCCEEDED") {
    throw new Error(`[Phase 2 FAIL] Expected recovery to have status SUCCEEDED, but got: ${lastRecovery.status}`);
  }

  // 7. Verify overall execution is COMPLETED
  if (postTrace.journal?.state !== "COMPLETED") {
    throw new Error(`[Phase 2 FAIL] Expected execution journal state COMPLETED, got: ${postTrace.journal?.state}`);
  }

  // 8. Verify durable execution journal tables populated
  console.log(`\n=== [DURABLE STATE EVIDENCE SUMMARY] ===`);
  console.log(`Events recorded: ${postTrace.events.length}`);
  console.log(`Actions recorded: ${postTrace.actions.length}`);
  console.log(`Attempts recorded: ${postTrace.attempts.length}`);
  console.log(`Observations recorded: ${postTrace.observations.length}`);
  console.log(`Evaluations recorded: ${postTrace.evaluations.length}`);
  console.log(`Recoveries recorded: ${postTrace.recoveries.length}`);
  console.log(`Lessons recorded: ${postTrace.lessons.length}`);

  await closeDatabase();
  console.log(
    `\n>>> ALL PROOF CHECKS PASSED: Authoritative in-flight kernel, clean interruption, durable resume without replay, and tool failure-recovery demonstrated successfully.`,
  );
}

if (phase === "interrupt") {
  await interruptPhase(executionId);
} else if (phase === "resume") {
  await resumePhase(executionId);
} else {
  console.log(`>>> Starting 2-Process Kernel Proof for Execution: ${executionId}`);

  // Process 1: Phase 1 (Execute until interruption after node-1)
  const interruptProc = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/scripts",
      "exec",
      "tsx",
      "./src/kernel-proof.ts",
      `--phase=interrupt`,
      `--executionId=${executionId}`,
    ],
    { stdio: "inherit", cwd: process.cwd() },
  );

  if (interruptProc.status !== 0) {
    console.error(`Process 1 (interrupt) failed with status: ${interruptProc.status}`);
    process.exit(interruptProc.status ?? 1);
  }

  // Process 2: Phase 2 (Fresh process restart & resume via resumeCompanionExecution)
  const resumeProc = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/scripts",
      "exec",
      "tsx",
      "./src/kernel-proof.ts",
      `--phase=resume`,
      `--executionId=${executionId}`,
    ],
    { stdio: "inherit", cwd: process.cwd() },
  );

  if (resumeProc.status !== 0) {
    console.error(`Process 2 (resume) failed with status: ${resumeProc.status}`);
    process.exit(resumeProc.status ?? 1);
  }

  console.log(`\n>>> Multi-Process Kernel Proof Completed Successfully!`);
}