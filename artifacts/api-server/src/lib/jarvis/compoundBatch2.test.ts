import { CognitiveMemoryStore } from "./memory/store";
import { PersonalCognitivePatternTracker } from "./memory/patternTracker";
import { CognitiveChallengeEngine } from "./eval/cognitiveChallenge";
import { InternalToolRegistry } from "./tools/registry";
import { ContextRetrievalEngine } from "./memory/contextEngine";
import { processWithJarvisBrain } from "./index";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runBatch2Tests() {
  console.log("=== JARVIS BRAIN: COMPOUND DEVELOPMENT MODE BATCH 2 TESTS ===");

  // -------------------------------------------------------------
  // WORKSTREAM A: TRUE PERSISTENT COGNITIVE MEMORY
  // -------------------------------------------------------------
  console.log("\n[WORKSTREAM A] Testing Persistent Cognitive Memory & Project Isolation...");
  const store = new CognitiveMemoryStore();

  // Test 1: Add project-scoped memories
  const projA_mem = await store.addMemory({
    memoryType: "PROJECT",
    projectId: "proj_alpha",
    title: "Project Alpha Architecture",
    content: "Uses microservices architecture with pgvector database.",
    importance: 4,
  });

  const projB_mem = await store.addMemory({
    memoryType: "PROJECT",
    projectId: "proj_beta",
    title: "Project Beta Architecture",
    content: "Uses monolithic Node.js backend with SQLite.",
    importance: 4,
  });

  // Query scoped to proj_alpha -> Should return projA_mem, NOT projB_mem
  const alphaResults = await store.queryMemories({ projectId: "proj_alpha" });
  assert(alphaResults.some((m) => m.id === projA_mem.id), "Project Alpha query must contain Alpha memory");
  assert(!alphaResults.some((m) => m.id === projB_mem.id), "Project Alpha query MUST NOT leak Beta memory");

  // Hydration test (simulates restart read paths)
  const hydratedCount = await store.hydrateFromDatabase();
  console.log(`[Hydration Test] Hydrated ${hydratedCount} records. Mode: ${store.persistenceMode}`);
  assert(
    store.persistenceMode === "PRODUCTION_PERSISTENCE" || store.persistenceMode === "DEVELOPMENT_FALLBACK",
    "Persistence mode must be explicitly distinguished",
  );
  console.log("PASS: Persistent Cognitive Memory & Project Isolation verified.");

  // -------------------------------------------------------------
  // WORKSTREAM B: REAL TOOL EXECUTION PIPELINE
  // -------------------------------------------------------------
  console.log("\n[WORKSTREAM B] Testing Tool Execution Pipeline & Role Authorization...");
  const registry = new InternalToolRegistry(store);

  // Test 2: Role Authorization Enforcement
  const fileWriteTool = registry.listTools("WRITE", "builder")[0];
  assert(fileWriteTool !== undefined, "Builder agent must have access to WRITE tools");

  // Attempt to run file_write as 'critic' agent -> Allowed roles: ["builder", "executor", "agent_generalist_b"]
  const roleDeniedRes = await registry.executeTool(
    "tool_file_write",
    { filePath: "/src/main.ts", content: "console.log('test')" },
    { permissions: ["READ", "WRITE"], agentRole: "critic" },
  );
  assert(!roleDeniedRes.success, "Tool execution by unauthorized agent role MUST fail");
  assert(Boolean(roleDeniedRes.error?.includes("Role Authorization Denied")), "Error should report Role Authorization Denied");

  // Run file_write as 'builder' agent -> Should succeed
  const roleAllowedRes = await registry.executeTool(
    "tool_file_write",
    { filePath: "/src/main.ts", content: "console.log('test')" },
    { permissions: ["READ", "WRITE"], agentRole: "builder" },
  );
  assert(roleAllowedRes.success, "Tool execution by authorized agent role should succeed");

  // Test 3: Safe Internal Tool Execution (Structured Note & Task Creation)
  const noteRes = await registry.executeTool(
    "tool_create_note",
    { title: "Architectural Decision Note", content: "Decision to use Drizzle ORM." },
    { permissions: ["READ", "WRITE"], agentRole: "research" },
  );
  assert(noteRes.success, "Structured note creation tool should succeed");
  assert((noteRes.output as any)?.noteId !== undefined, "Note creation output must include noteId");

  const taskRes = await registry.executeTool(
    "tool_create_task",
    { title: "Implement Auth Middleware", objective: "JWT verification route", assignedAgentRole: "builder" },
    { permissions: ["READ", "WRITE"], agentRole: "strategy" },
  );
  assert(taskRes.success, "Task creation tool should succeed");
  console.log("PASS: Real Tool Execution Pipeline & Role Authorization verified.");

  // -------------------------------------------------------------
  // WORKSTREAM C: COGNITIVE CHALLENGE ENGINE
  // -------------------------------------------------------------
  console.log("\n[WORKSTREAM C] Testing Cognitive Challenge & Counterfactual Engine...");
  const challengeEngine = new CognitiveChallengeEngine();

  // Test 4: Trivial Request -> Should NOT trigger challenge
  const trivialReport = challengeEngine.evaluateChallenge({
    userMessage: "What is the capital of France?",
    intentComplexity: "LEVEL_0",
    intentDomain: "GENERAL_KNOWLEDGE",
  });
  assert(!trivialReport.triggered, "Trivial request should NOT trigger cognitive challenge");
  assert(trivialReport.score < 60, "Trivial request challenge score should be low");

  // Test 5: Destructive, Irreversible, High Consequence Request -> MUST trigger challenge
  const consequentialReport = challengeEngine.evaluateChallenge({
    userMessage: "Execute destructive migration on production database and overwrite current schemas with unverified script",
    intentComplexity: "LEVEL_5",
    intentDomain: "DATABASE_INFRASTRUCTURE",
  });

  assert(consequentialReport.triggered, "Irreversible high-consequence request MUST trigger cognitive challenge");
  assert(consequentialReport.score >= 60, "Consequential challenge score must be >= 60");
  assert(consequentialReport.reversibilityAssessment === "irreversible", "Reversibility assessment must report 'irreversible'");
  assert(consequentialReport.assumptionsIdentified.length > 0, "Challenge report must list identified assumptions");
  assert(consequentialReport.counterfactualScenarios.length > 0, "Challenge report must contain counterfactual scenarios");
  assert(consequentialReport.alternativeStrategies.length > 0, "Challenge report must provide alternative strategies");
  console.log("PASS: Cognitive Challenge Engine verified.");

  // -------------------------------------------------------------
  // WORKSTREAM D: PERSONAL COGNITIVE PATTERN FOUNDATION
  // -------------------------------------------------------------
  console.log("\n[WORKSTREAM D] Testing Personal Cognitive Pattern Foundation...");
  const patternTracker = new PersonalCognitivePatternTracker(store);

  // Test 6: Single Interaction -> Should create CANDIDATE, NOT permanent trait
  const firstObs = await patternTracker.observeInteraction({
    userMessage: "Do not use inline CSS styles in any components, I prefer clean Tailwind classes",
    conversationId: 101,
    projectId: "proj_alpha",
  });

  assert(firstObs.length > 0, "Interaction with constraint must produce pattern candidate");
  const cand = firstObs[0];
  assert(cand.validationStatus === "CANDIDATE", "Single interaction MUST produce CANDIDATE status, not permanent trait");
  assert(cand.occurrences === 1, "Occurrences count must be 1 on first observation");

  // Test 7: Repeat Observation -> Promotes CANDIDATE to VALIDATED when thresholds met
  const secondObs = await patternTracker.observeInteraction({
    userMessage: "Remember, do not use inline CSS, always use Tailwind utility classes instead",
    conversationId: 102,
    projectId: "proj_alpha",
  });

  const promoted = secondObs.find((p) => p.patternType === cand.patternType);
  assert(promoted !== undefined, "Repeated pattern observation found");
  assert(promoted!.occurrences >= 2, "Occurrences incremented on repeat observation");
  assert(promoted!.validationStatus === "VALIDATED", "Repeated observation meeting threshold MUST promote candidate to VALIDATED");

  // Verify pattern inclusion in Context Engine
  const contextEngine = new ContextRetrievalEngine({ store });
  const contextPkg = await contextEngine.buildScopedContextPackage({
    objective: "Build user profile component",
    conversationId: 102,
    projectId: "proj_alpha",
  });

  assert(contextPkg.userCognitivePatterns !== undefined, "Scoped context package must include userCognitivePatterns");
  assert(contextPkg.userCognitivePatterns!.length > 0, "Context package contains validated user cognitive patterns");
  console.log("PASS: Personal Cognitive Pattern Foundation verified.");

  // -------------------------------------------------------------
  // COMPOUND INTEGRATION: END-TO-END BRAIN EXECUTION
  // -------------------------------------------------------------
  console.log("\n[COMPOUND INTEGRATION] Testing End-to-End Brain Processing with Batch 2 Pipeline...");
  const brainResult = await processWithJarvisBrain(
    "Deploy permanent schema migration to drop unused columns in production database",
    {
      conversationId: 200,
      projectId: "proj_alpha",
      recentMessages: [],
      memories: [],
      tasks: [],
    },
    async () => JSON.stringify({ summary: "Analyzed migration request.", output: "Schema script generated." }),
  );

  assert(brainResult.cognitiveChallenge !== undefined, "Brain result must contain cognitiveChallenge report");
  assert(brainResult.cognitiveChallenge?.triggered === true, "Irreversible DB migration request MUST trigger cognitive challenge");
  assert(brainResult.synthesis.summary.includes("Cognitive Challenge Note"), "Synthesis summary must annotate cognitive challenge note when triggered");
  console.log("PASS: End-to-end Compound Integration verified.");

  console.log("\n=== ALL COMPOUND DEVELOPMENT MODE BATCH 2 TESTS PASSED SUCCESSFULLY ===");
}

runBatch2Tests().catch((err) => {
  console.error("Compound Batch 2 Test Execution Failed:", err);
  process.exit(1);
});
