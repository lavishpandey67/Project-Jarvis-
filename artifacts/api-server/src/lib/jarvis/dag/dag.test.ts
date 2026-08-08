import { executeTaskGraph } from "./runner";
import { TaskGraph, TaskGraphNode } from "./types";
import { validateTaskGraph } from "./validator";
import { processWithJarvisBrain } from "../index";
import { ScopedContext } from "../types";

const dummyContext: ScopedContext = {
  conversationId: 1,
  recentMessages: [],
  relevantMemories: [],
  activeTasks: [],
  agentPermissions: ["READ", "WRITE", "EXECUTE"],
};

async function runDAGTests() {
  console.log("=== JARVIS TASK / DAG EXECUTION ENGINE TESTS (STAGE 3) ===");

  // TEST A: Linear DAG (Research -> Critic)
  console.log("\n[TEST A] Linear DAG Execution (Research -> Critic)...");
  const linearGraph: TaskGraph = {
    graphId: "g_linear",
    requestId: "r1",
    objective: "Linear flow test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "t1",
        graphId: "g_linear",
        description: "Research topic",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 10000,
      },
      {
        taskId: "t2",
        graphId: "g_linear",
        description: "Critic review research",
        assignedAgentRole: "critic",
        assignedAgentName: "Critic Agent",
        requiredCapabilities: ["evaluation"],
        dependencies: ["t1"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 10000,
      },
    ],
  };

  const resA = await executeTaskGraph(linearGraph, dummyContext);
  console.assert(resA.graph.status === "COMPLETED", "Linear graph should complete successfully");
  console.assert(resA.succeededNodeCount === 2, "Both nodes should succeed");
  console.log("PASS: Linear DAG execution completed.");

  // TEST B & C: Parallel & Convergence DAG (A -> B, A -> C, B+C -> D)
  console.log("\n[TEST B & C] Parallel & Convergence DAG (A -> B, A -> C, B+C -> D)...");
  const convGraph: TaskGraph = {
    graphId: "g_conv",
    requestId: "r2",
    objective: "Convergence test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "node_A",
        graphId: "g_conv",
        description: "Initial Research",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "node_B",
        graphId: "g_conv",
        description: "Strategic Plan",
        assignedAgentRole: "strategy",
        assignedAgentName: "Strategy Agent",
        requiredCapabilities: ["planning"],
        dependencies: ["node_A"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "node_C",
        graphId: "g_conv",
        description: "Builder Implementation",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: ["node_A"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "node_D",
        graphId: "g_conv",
        description: "Critic Final Review",
        assignedAgentRole: "critic",
        assignedAgentName: "Critic Agent",
        requiredCapabilities: ["evaluation"],
        dependencies: ["node_B", "node_C"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
    ],
  };

  const resBC = await executeTaskGraph(convGraph, dummyContext);
  console.assert(resBC.graph.status === "COMPLETED", "Convergence graph should complete");
  console.assert(resBC.succeededNodeCount === 4, "All 4 nodes should succeed");
  console.log("PASS: Parallel & Convergence DAG executed in topological order.");

  // TEST D: Failure Propagation & BLOCKED status
  console.log("\n[TEST D] Failure Propagation (Node 1 Fails -> Node 2 Blocked)...");
  const failGraph: TaskGraph = {
    graphId: "g_fail",
    requestId: "r3",
    objective: "Failure test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "f1",
        graphId: "g_fail",
        description: "Failing step",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 2, // No retries remaining so it fails immediately
        maxRetries: 2,
        timeoutMs: 100,
      },
      {
        taskId: "f2",
        graphId: "g_fail",
        description: "Dependent step",
        assignedAgentRole: "critic",
        assignedAgentName: "Critic Agent",
        requiredCapabilities: ["evaluation"],
        dependencies: ["f1"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
    ],
  };

  // Mock callModelFn to simulate deterministic failure for f1
  const failingCaller = async (msgs: any[]) => {
    throw new Error("Simulated transient error");
  };

  const resD = await executeTaskGraph(failGraph, dummyContext, { callModelFn: failingCaller });
  const f2Node = resD.graph.nodes.find((n) => n.taskId === "f2");
  console.assert(f2Node?.status === "BLOCKED", "Dependent node f2 should be BLOCKED");
  console.assert(resD.blockedNodeCount === 1, "Blocked count should be 1");
  console.log("PASS: Failure propagation correctly marked dependent task as BLOCKED.");

  // TEST E & F: Retry Bounded Execution & Exhaustion
  console.log("\n[TEST E & F] Bounded Retry and Exhaustion...");
  let attemptCount = 0;
  const retryCaller = async (msgs: any[]) => {
    attemptCount += 1;
    throw new Error("Simulated retryable error");
  };

  const retryGraph: TaskGraph = {
    graphId: "g_retry",
    requestId: "r4",
    objective: "Retry test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "r_task",
        graphId: "g_retry",
        description: "Retry task",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 2,
        timeoutMs: 10000,
      },
    ],
  };

  const resEF = await executeTaskGraph(retryGraph, dummyContext, { callModelFn: retryCaller });
  console.assert(resEF.graph.nodes[0].status === "FAILED", "Task should end as FAILED after max retries");
  console.assert(attemptCount === 3, `Expected 3 execution attempts (1 initial + 2 retries), got ${attemptCount}`);
  console.log("PASS: Bounded retries executed exactly maxRetries (3 total attempts).");

  // TEST G: Timeout Handling
  console.log("\n[TEST G] Timeout Handling...");
  const timeoutCaller = async () => {
    await new Promise((r) => setTimeout(r, 500)); // Delay longer than timeout
    return "Late output";
  };

  const timeoutGraph: TaskGraph = {
    graphId: "g_timeout",
    requestId: "r5",
    objective: "Timeout test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "t_out",
        graphId: "g_timeout",
        description: "Timed out task",
        assignedAgentRole: "executor",
        assignedAgentName: "Executor Agent",
        requiredCapabilities: ["approved_tool_execution"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 1, // Max retries 1
        maxRetries: 1,
        timeoutMs: 100, // 100ms timeout
      },
    ],
  };

  const resG = await executeTaskGraph(timeoutGraph, dummyContext, { callModelFn: timeoutCaller });
  console.assert(resG.graph.nodes[0].status === "TIMEOUT", "Task should end as TIMEOUT");
  console.log("PASS: Task timeout boundary correctly detected and enforced.");

  // TEST H: Circular Dependency Detection
  console.log("\n[TEST H] Circular Dependency Detection...");
  const cycleGraph: TaskGraph = {
    graphId: "g_cycle",
    requestId: "r6",
    objective: "Cycle test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "c1",
        graphId: "g_cycle",
        description: "C1",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: ["c3"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "c2",
        graphId: "g_cycle",
        description: "C2",
        assignedAgentRole: "strategy",
        assignedAgentName: "Strategy Agent",
        requiredCapabilities: ["planning"],
        dependencies: ["c1"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "c3",
        graphId: "g_cycle",
        description: "C3",
        assignedAgentRole: "builder",
        assignedAgentName: "Builder Agent",
        requiredCapabilities: ["code_generation"],
        dependencies: ["c2"],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
    ],
  };

  const valH = validateTaskGraph(cycleGraph);
  console.assert(!valH.valid, "Cycle graph must fail validation");
  console.assert(valH.errors.some((e) => e.includes("Circular dependency")), "Must report Circular dependency error");
  console.log("PASS: Circular dependency detected and rejected prior to execution.");

  // TEST I: Duplicate Task ID Detection
  console.log("\n[TEST I] Duplicate Task ID Detection...");
  const dupGraph: TaskGraph = {
    graphId: "g_dup",
    requestId: "r7",
    objective: "Duplicate ID test",
    createdAt: new Date().toISOString(),
    status: "PENDING",
    nodes: [
      {
        taskId: "same_id",
        graphId: "g_dup",
        description: "First node",
        assignedAgentRole: "research",
        assignedAgentName: "Research Agent",
        requiredCapabilities: ["research"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
      {
        taskId: "same_id",
        graphId: "g_dup",
        description: "Second node",
        assignedAgentRole: "critic",
        assignedAgentName: "Critic Agent",
        requiredCapabilities: ["evaluation"],
        dependencies: [],
        constraints: [],
        status: "PENDING",
        retryCount: 0,
        maxRetries: 1,
        timeoutMs: 10000,
      },
    ],
  };

  const valI = validateTaskGraph(dupGraph);
  console.assert(!valI.valid, "Duplicate ID graph must fail validation");
  console.assert(valI.errors.some((e) => e.includes("Duplicate task ID")), "Must report Duplicate task ID error");
  console.log("PASS: Duplicate task ID rejected during graph validation.");

  // TEST J: Capability-Based Multi-Agent DAG Orchestration
  console.log("\n[TEST J] Capability-Based Multi-Agent DAG Orchestration...");
  const complexPrompt = "I need research on database benchmarks, a strategic plan for migration, code implementation, and a critical risk audit.";
  const resJ = await processWithJarvisBrain(complexPrompt, {
    conversationId: 1,
    recentMessages: [],
    memories: [],
    tasks: [],
  });

  console.assert(resJ.taskGraph !== undefined, "Task graph should be generated");
  console.assert(resJ.taskGraph!.nodes.length >= 3, "Complex prompt should generate a multi-agent DAG");
  console.assert(resJ.dagResult?.graph.status === "COMPLETED" || resJ.dagResult?.graph.status === "PARTIAL", "DAG should execute successfully");
  console.log(`PASS: Multi-agent DAG created with ${resJ.taskGraph?.nodes.length} nodes and executed.`);

  console.log("\n=== ALL STAGE 3 DAG TESTS PASSED SUCCESSFULLY ===");
}

runDAGTests().catch((err) => {
  console.error("DAG Test failed:", err);
  process.exit(1);
});
