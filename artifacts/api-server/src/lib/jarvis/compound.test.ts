import { CognitiveMemoryStore } from "./memory/store";
import { RelevanceScorer } from "./memory/scorer";
import { ContextRetrievalEngine } from "./memory/contextEngine";
import { CognitiveStateManager } from "./memory/cognitiveState";
import { classifyCognitiveComplexity } from "./complexity";
import { InternalToolRegistry } from "./tools/registry";
import {
  ALL_WORKFORCE_AGENTS,
  assignAdaptiveTaskProfile,
  clearAdaptiveTaskProfile,
  findBestAgentForCapabilities,
  getActiveTaskProfile,
  getAgentByRole,
} from "./registry";
import { processWithJarvisBrain } from "./index";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runCompoundBatchTests() {
  console.log("=== JARVIS BRAIN: COMPOUND DEVELOPMENT MODE BATCH 1 TESTS ===");

  // TEST 1: 6-Level Cognitive Complexity Classification
  console.log("\n[TEST 1] 6-Level Cognitive Complexity Classification...");
  const level0 = classifyCognitiveComplexity("Hello, how are you today?");
  assert(level0.level === "LEVEL_0", "Greeting should be classified as LEVEL_0");
  assert(!level0.requiresDAG, "LEVEL_0 should not require DAG execution");

  const level1 = classifyCognitiveComplexity("Summarize this text string for me.");
  assert(level1.level === "LEVEL_1", "Simple single operation should be LEVEL_1");

  const level3 = classifyCognitiveComplexity("Research vector DBs, compare pgvector vs milvus, and create an architecture plan.");
  assert(level3.level === "LEVEL_3" || level3.level === "LEVEL_4", "Multi-step research and architecture plan should be LEVEL_3 or LEVEL_4");
  assert(level3.requiresDAG, "LEVEL_3/4 must require DAG execution");

  const level5 = classifyCognitiveComplexity("Execute destructive migration on production database and delete old tables", { risk: "high", reversibility: "irreversible" });
  assert(level5.level === "LEVEL_5", "Destructive high risk request must be LEVEL_5");
  assert(level5.requiresHumanApproval, "LEVEL_5 with destructive action MUST require human user approval");
  console.log("PASS: 6-Level Cognitive Complexity classification verified.");

  // TEST 2: Provider-Agnostic Internal Tool Registry & Permission Gating
  console.log("\n[TEST 2] Provider-Agnostic Internal Tool Registry & Permission Gating...");
  const registry = new InternalToolRegistry();
  const readTools = registry.listTools("READ");
  assert(readTools.every((t) => t.permissionClass === "READ"), "Filter by READ permission should return only READ tools");

  // Attempt executing WRITE tool with READ-only agent permissions -> Expect Permission Denied
  const writeRes = await registry.executeTool(
    "tool_file_write",
    { filePath: "test.ts", content: "const x = 1;" },
    { permissions: ["READ"] },
  );
  assert(!writeRes.success, "Tool execution with insufficient permission MUST fail");
  assert(Boolean(writeRes.error?.includes("Permission Denied")), "Error message should report Permission Denied");

  // Execute WRITE tool with WRITE permission -> Expect Success
  const validWriteRes = await registry.executeTool(
    "tool_file_write",
    { filePath: "test.ts", content: "const x = 1;" },
    { permissions: ["READ", "WRITE"] },
  );
  assert(validWriteRes.success, "Tool execution with valid permissions should succeed");

  // Register DESTRUCTIVE tool -> Attempt execution without user approval -> Expect Safety Guard Violation
  registry.registerTool({
    id: "tool_drop_db",
    name: "Drop Database Table",
    description: "Destructive table deletion",
    permissionClass: "DESTRUCTIVE",
    riskLevel: "high",
    isReversible: false,
    sandboxed: true,
    resourceCost: 5,
    inputSchema: { table: "string" },
    outputSchema: { dropped: "boolean" },
    execute: async () => ({ success: true, executionTimeMs: 0 }),
  });

  const destructiveRes = await registry.executeTool(
    "tool_drop_db",
    { table: "users" },
    { permissions: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"], userApprovalGranted: false },
  );
  assert(!destructiveRes.success, "DESTRUCTIVE tool without user approval MUST be blocked");
  assert(Boolean(destructiveRes.error?.includes("Safety Guard Violation")), "Error message should mention Safety Guard Violation");

  const approvedDestructiveRes = await registry.executeTool(
    "tool_drop_db",
    { table: "users" },
    { permissions: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"], userApprovalGranted: true },
  );
  assert(approvedDestructiveRes.success, "DESTRUCTIVE tool with explicit user approval should succeed");
  console.log("PASS: Internal Tool Registry & Permission Gating verified.");

  // TEST 3: Adaptive Generalist Agents & Task Role Profiles
  console.log("\n[TEST 3] Adaptive Generalist Agents & Task Role Profiles...");
  assert(ALL_WORKFORCE_AGENTS.length === 7, "Workforce contracts MUST contain 7 agents (5 specialists + 2 adaptive generalists)");

  const genA = getAgentByRole("generalist_a");
  assert(genA !== undefined, "Adaptive Generalist Alpha must be registered");

  // Assign temporary task profile 'technical_investigator' to Generalist Alpha
  const profile = assignAdaptiveTaskProfile(
    "agent_generalist_a",
    "technical_investigator",
    ["research", "debugging", "risk_analysis"],
    ["tool_memory_search", "tool_file_read"],
    ["READ", "WRITE"],
    10, // 10 minutes duration
  );

  assert(profile.temporaryRoleName === "technical_investigator", "Profile role name matches");
  const activeProf = getActiveTaskProfile("agent_generalist_a");
  assert(activeProf?.profileId === profile.profileId, "Active profile retrieved for Generalist Alpha");

  // Test best agent matching with adaptive profile capabilities
  const bestAgent = findBestAgentForCapabilities(["debugging", "risk_analysis"]);
  assert(bestAgent.id === "agent_generalist_a", "Generalist Alpha with active profile should match debugging + risk_analysis");

  clearAdaptiveTaskProfile("agent_generalist_a");
  assert(getActiveTaskProfile("agent_generalist_a") === null, "Profile cleared after task completion");
  console.log("PASS: Adaptive Generalist Agents & Role Profiles verified.");

  // TEST 4: Structured Cognitive Reasoning Artifacts
  console.log("\n[TEST 4] Structured Cognitive Reasoning Artifacts...");
  const stateManager = new CognitiveStateManager();
  const artifact = stateManager.createReasoningArtifact({
    objective: "Select vector database architecture for project alpha",
    complexityLevel: "LEVEL_4",
    knownFacts: ["PostgreSQL handles up to 10M vectors with HNSW index"],
    unknowns: ["Network latency under peak cluster load"],
    assumptions: ["Single primary database minimizes operational cost"],
    hypotheses: [{ id: "hyp_1", statement: "pgvector satisfies <50ms query budget", confidence: 0.9, status: "VERIFIED" }],
    tradeoffs: ["Milvus offers better horizontal scaling but introduces extra operations overhead"],
    decisionsMade: [{ decision: "Use pgvector", rationale: "Simplifies architecture and meets performance SLAs", reversibility: "reversible" }],
    overallConfidence: 0.92,
  });

  assert(artifact.hypotheses[0].status === "VERIFIED", "Hypothesis status verified");
  assert(artifact.decisionsMade[0].decision === "Use pgvector", "Decision recorded in reasoning artifact");

  const snapshot = stateManager.createSnapshot({
    objective: "Select vector database architecture for project alpha",
    reasoningArtifact: artifact,
  });
  assert(snapshot.reasoningArtifact?.id === artifact.id, "Reasoning artifact attached to state snapshot");
  console.log("PASS: Structured Cognitive Reasoning Artifacts verified.");

  // TEST 5: Persistent Memory Store & Conflict Supersession
  console.log("\n[TEST 5] Persistent Cognitive Memory Store & Conflict Resolution...");
  const store = new CognitiveMemoryStore();
  const mem1 = await store.addMemory({
    memoryType: "DECISION",
    title: "Initial Tech Selection",
    content: "Selected MySQL for backend store",
    importance: 4,
  });

  const conflict = await store.markConflicted(mem1.id, "User switched preference to PostgreSQL");
  assert(conflict.status === "ACTIVE", "Conflict marked active");

  const mem2 = await store.addMemory({
    memoryType: "DECISION",
    title: "Updated Tech Selection",
    content: "Selected PostgreSQL with pgvector extension",
    importance: 5,
  });

  await store.resolveConflict(conflict.id, "Superceded MySQL with PostgreSQL", mem2.id);
  const updatedMem1 = await store.getMemory(mem1.id);
  assert(updatedMem1?.validity === "INVALIDATED", "Conflicted memory superseded and marked INVALIDATED");
  assert(updatedMem1?.supersededBy === mem2.id, "Superceded memory points to new memory ID");
  console.log("PASS: Memory store & conflict resolution verified.");

  // TEST 6: End-to-End Brain Processing Integration
  console.log("\n[TEST 6] End-to-End Brain Processing Integration...");
  const fastCaller = async () =>
    JSON.stringify({
      summary: "Evaluated vector search options. Recommended pgvector.",
      confidence: 0.95,
      evidence: ["PostgreSQL pgvector performance benchmark verified"],
      output: `Completed architectural comparison and code configuration.
      export interface VectorConfig { dimensions: number; metric: string; }
      export class VectorDatabaseManager { constructor(public config: VectorConfig) {} }`,
    });

  const brainRes = await processWithJarvisBrain(
    "Research vector database options and build strategic plan for project alpha",
    {
      conversationId: 20,
      recentMessages: [],
      memories: [],
      tasks: [],
    },
    fastCaller,
  );

  assert(brainRes.intent.complexityConfig !== undefined, "Brain response includes Cognitive Complexity Configuration");
  assert(brainRes.synthesis.finalAnswer.length > 0, "Brain synthesis produced final answer");
  console.log("PASS: End-to-end brain processing verified.");

  console.log("\n=== ALL COMPOUND DEVELOPMENT MODE BATCH 1 TESTS PASSED SUCCESSFULLY ===");
}

runCompoundBatchTests().catch((err) => {
  console.error("Compound Batch 1 Test Execution Failed:", err);
  process.exit(1);
});
