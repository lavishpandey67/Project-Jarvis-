import { processWithJarvisBrain } from "../index";
import { executeTaskGraph } from "../dag/runner";
import { TaskGraph, TaskGraphNode } from "../dag/types";
import { evaluateTaskResult, evaluateGraphObjective } from "./evaluator";
import { runCriticGate } from "./criticGate";
import { ScopedContext } from "../types";

const dummyContext: ScopedContext = {
  conversationId: 1,
  recentMessages: [],
  relevantMemories: [],
  activeTasks: [],
  agentPermissions: ["READ", "WRITE", "EXECUTE"],
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runStage4EvalTests() {
  console.log("=== STAGE 4: VERIFICATION, SELF-CORRECTION & EVALUATION TESTS ===");

  // TEST A: Valid output -> PASS
  console.log("\n[TEST A] Valid Output Evaluation -> PASS...");
  const validNode: TaskGraphNode = {
    taskId: "t_valid",
    graphId: "g_eval",
    description: "Gather database benchmark facts",
    assignedAgentRole: "research",
    assignedAgentName: "Research Agent",
    requiredCapabilities: ["research"],
    dependencies: [],
    constraints: [],
    status: "RUNNING",
    retryCount: 0,
    maxRetries: 1,
    timeoutMs: 10000,
  };
  const validOutput = "According to empirical benchmark data, PostgreSQL vector index yields 98% recall at 15ms latency.";
  const evalA = evaluateTaskResult(validNode, validOutput, dummyContext);
  assert(evalA.verdict === "PASS", `Expected PASS, got ${evalA.verdict}`);
  assert(evalA.overallScore >= 0.75, "Overall score should be >= 0.75 for valid output");
  console.log("PASS: Valid output evaluated as PASS with high overall score.");

  // TEST B: Empty output -> FailureReason & REVISE
  console.log("\n[TEST B] Empty Output Evaluation -> REVISE...");
  const emptyNode: TaskGraphNode = { ...validNode, taskId: "t_empty", revisionCount: 0, maxRevisionCycles: 2 };
  const evalB = evaluateTaskResult(emptyNode, "", dummyContext);
  assert(evalB.verdict === "REVISE", `Expected REVISE for empty output, got ${evalB.verdict}`);
  assert(evalB.failureReasons.includes("Output is empty."), "Should record empty output failure reason");
  console.log("PASS: Empty output evaluated as REVISE.");

  // TEST C & D: Critic detects contradiction / missing requirement -> REVISE
  console.log("\n[TEST C & D] Critic Contradiction Detection -> REVISE...");
  const builderNode: TaskGraphNode = {
    taskId: "t_builder",
    graphId: "g_eval",
    description: "Generate type safe code implementation",
    assignedAgentRole: "builder",
    assignedAgentName: "Builder Agent",
    requiredCapabilities: ["code_generation"],
    dependencies: [],
    constraints: ["Strict type safety"],
    status: "RUNNING",
    retryCount: 0,
    maxRetries: 1,
    revisionCount: 0,
    maxRevisionCycles: 2,
    timeoutMs: 10000,
  };
  const untypedCodeOutput = "function add(a, b) { return a + b; } // untyped JS";
  const evalCD = evaluateTaskResult(builderNode, untypedCodeOutput, dummyContext);
  assert(evalCD.verdict === "REVISE", `Expected REVISE for constraint violation, got ${evalCD.verdict}`);
  assert(evalCD.requiredCorrections.length > 0, "Should generate required corrections");
  console.log("PASS: Constraint violation detected and REVISE requested with corrections.");

  // TEST E: Self-Correction Revision Cycle Succeeds -> PASS
  console.log("\n[TEST E & I] Self-Correction Revision Cycle (Builder -> Critic Revision)...");
  let callCount = 0;
  const revisingCaller = async (msgs: any[]) => {
    callCount++;
    const promptText = JSON.stringify(msgs);
    if (promptText.includes("REVISION CYCLE")) {
      return JSON.stringify({
        summary: "Revised code with strict type safety.",
        confidence: 0.95,
        evidence: ["TypeScript interface included"],
        output: "export interface AddParams { a: number; b: number; }\nexport function add(params: AddParams): number { return params.a + params.b; }",
      });
    } else {
      return JSON.stringify({
        summary: "Untyped implementation",
        confidence: 0.5,
        evidence: [],
        output: "function add(a, b) { return a + b; }",
      });
    }
  };

  const revisionGraph: TaskGraph = {
    graphId: "g_revision",
    requestId: "r_rev",
    objective: "Generate type safe code implementation",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "t_rev_builder",
        graphId: "g_revision",
        description: "Generate type safe code implementation",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        constraints: ["Strict type safety"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        revisionCount: 0,
        maxRevisionCycles: 2,
        timeoutMs: 10000,
      },
    ],
  };

  const resE = await executeTaskGraph(revisionGraph, dummyContext, { callModelFn: revisingCaller });
  assert(resE.graph.nodes[0].status === "SUCCESS", "Revised task should succeed");
  assert(resE.graph.nodes[0].revisionCount === 1, "Should have executed 1 revision cycle");
  console.log("PASS: Self-correction loop successfully corrected output on revision cycle 1.");

  // TEST F & L: Revision Repeatedly Fails -> ESCALATE / Max Revision Limit Exceeded
  console.log("\n[TEST F & L] Max Revision Cycles Exceeded -> ESCALATE...");
  const persistentFailureCaller = async () => {
    return JSON.stringify({
      summary: "Persistently invalid output",
      confidence: 0.3,
      output: "function add(a, b) { return a + b; }",
    });
  };

  const maxRevGraph: TaskGraph = {
    graphId: "g_max_rev",
    requestId: "r_max_rev",
    objective: "Generate type safe code implementation",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "t_max_rev",
        graphId: "g_max_rev",
        description: "Generate type safe code implementation",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        constraints: ["Strict type safety"],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        revisionCount: 0,
        maxRevisionCycles: 2,
        timeoutMs: 10000,
      },
    ],
  };

  const resFL = await executeTaskGraph(maxRevGraph, dummyContext, { callModelFn: persistentFailureCaller });
  const failedNode = resFL.graph.nodes[0];
  assert(failedNode.status === "FAILED", "Task should fail when max revisions are exceeded");
  assert(failedNode.revisionCount === 2, `Expected revision count 2, got ${failedNode.revisionCount}`);
  assert(Boolean(failedNode.error?.includes("Exceeded maximum revision cycles")), "Error should report max revisions exceeded");
  console.log("PASS: Revision loop capped at configured maxRevisionCycles and escalated to FAILED.");

  // TEST G & K: Graph-level Evaluation (Partial / Incomplete Objective)
  console.log("\n[TEST G, H & K] Graph-Level Evaluation & Objective Satisfaction...");
  const partialGraph: TaskGraph = {
    graphId: "g_graph_eval",
    requestId: "r_ge",
    objective: "Full end-to-end research and build",
    createdAt: new Date().toISOString(),
    status: "PARTIAL",
    nodes: [
      {
        taskId: "g_n1",
        graphId: "g_graph_eval",
        description: "Research topic",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: [],
        constraints: [],
        status: "SUCCESS",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
        latestEvaluation: {
          taskId: "g_n1",
          evaluator: "Evaluator",
          schemaScore: 1,
          goalScore: 1,
          constraintScore: 1,
          groundingScore: 1,
          criticScore: 1,
          confidenceScore: 1,
          overallScore: 1.0,
          verdict: "PASS",
          failureReasons: [],
          requiredCorrections: [],
          evaluatedAt: new Date().toISOString(),
        },
      },
      {
        taskId: "g_n2",
        graphId: "g_graph_eval",
        description: "Build component",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: ["g_n1"],
        constraints: [],
        status: "FAILED",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
        latestEvaluation: {
          taskId: "g_n2",
          evaluator: "Evaluator",
          schemaScore: 0.2,
          goalScore: 0.2,
          constraintScore: 0.2,
          groundingScore: 0.2,
          criticScore: 0.2,
          confidenceScore: 0.2,
          overallScore: 0.2,
          verdict: "FAIL",
          failureReasons: ["Violates strict type safety"],
          requiredCorrections: [],
          evaluatedAt: new Date().toISOString(),
        },
      },
    ],
  };

  const graphEvalRes = evaluateGraphObjective(partialGraph, {
    graph: partialGraph,
    traces: [],
    succeededNodeCount: 1,
    failedNodeCount: 1,
    blockedNodeCount: 0,
    totalDurationMs: 100,
  }, dummyContext);

  assert(!graphEvalRes.objectiveSatisfied, "Objective should NOT be satisfied when a node failed");
  assert(graphEvalRes.overallVerdict === "ESCALATE" || graphEvalRes.overallVerdict === "PARTIAL", "Overall verdict should reflect incomplete graph");
  assert(graphEvalRes.unresolvedRisks.length > 0, "Unresolved risks should be captured");
  console.log("PASS: Graph-level evaluation correctly caught unresolved task risks.");

  // TEST J: End-to-End Brain Flow with Verification & Trace Integration
  console.log("\n[TEST J] End-to-End Brain Processing with Evaluation Traces...");
  const fastE2ECaller = async () => JSON.stringify({
    summary: "Vector database benchmark research complete.",
    confidence: 0.9,
    evidence: ["PostgreSQL vs Milvus vs Qdrant benchmark data"],
    output: "Vector databases evaluated: PostgreSQL pgvector, Milvus, Qdrant. Recommendation: pgvector for existing SQL infrastructure.",
  });

  const resE2E = await processWithJarvisBrain(
    "Research vector databases and write a strategic plan",
    {
      conversationId: 1,
      recentMessages: [],
      memories: [],
      tasks: [],
    },
    fastE2ECaller,
  );

  assert(resE2E.graphEvaluation !== undefined, "Execution result should include graphEvaluation");
  assert(resE2E.dagResult?.traces[0].evaluator !== undefined, "Execution trace should include evaluator metadata");
  console.log("PASS: End-to-end Jarvis brain flow integrated evaluation results and traces.");

  console.log("\n=== ALL STAGE 4 EVALUATION & SELF-CORRECTION TESTS PASSED ===");
}

runStage4EvalTests().catch((err) => {
  console.error("Stage 4 Eval Test failed:", err);
  process.exit(1);
});
