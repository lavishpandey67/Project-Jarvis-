import { PythonIntelligenceClient } from "./pythonBridge/client";
import { CognitiveMemoryStore } from "./memory/store";
import { ContextRetrievalEngine } from "./memory/contextEngine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[PythonBridge Test Assertion Failed] ${message}`);
  }
}

export async function runPythonBridgeTestSuite(): Promise<void> {
  console.log("========================================================");
  console.log("   JARVIS BRAIN — PYTHON INTELLIGENCE BRIDGE SUITE       ");
  console.log("========================================================\n");

  const client = new PythonIntelligenceClient();

  // Test 1: Embedding Engine
  console.log(">>> [PYTHON TEST 1] Testing Vector Embedding Service...");
  const embRes = await client.execute({
    operation: "EMBEDDING",
    inputData: { text: "AI Lead Operations System Architecture" },
  });
  console.log("Embedding Status:", embRes.status, "Vector Dim:", embRes.output.dim);
  assert(embRes.status === "success", "Embedding operation should succeed");
  assert(embRes.output.dim === 384, "Embedding vector dimension should be 384");
  console.log("✓ TEST 1 COMPLETE\n");

  // Test 2: Semantic Retrieval & Project Isolation
  console.log(">>> [PYTHON TEST 2] Testing Semantic Retrieval & Project Isolation...");
  const retrievalRes = await client.retrieveSemanticContext({
    query: "Lead Deduplication and AI Enrichment",
    projectId: "proj_lead_ops",
    candidates: [
      {
        id: "mem_lead_dedup",
        title: "Lead Deduplication Strategy",
        content: "Synchronous deduplication prior to triggering AI enrichment saves API tokens.",
        projectId: "proj_lead_ops",
        importance: 5,
        validity: "FACT",
      },
      {
        id: "mem_other",
        title: "Unrelated Project Note",
        content: "Other project data that must be isolated.",
        projectId: "proj_other",
        importance: 4,
        validity: "FACT",
      },
    ],
  });

  console.log("Retrieval Items Returned:", retrievalRes.output.itemsReturned);
  assert(retrievalRes.status === "success", "Semantic retrieval should succeed");
  assert(retrievalRes.output.itemsReturned === 1, "Project isolation should filter out mem_other");
  assert(retrievalRes.output.scoredItems[0].record.id === "mem_lead_dedup", "Top result should be mem_lead_dedup");
  console.log("✓ TEST 2 COMPLETE\n");

  // Test 3: Evaluation Engine
  console.log(">>> [PYTHON TEST 3] Testing Semantic Evaluation Engine...");
  const evalRes = await client.execute({
    operation: "EVALUATE",
    inputData: {
      outputText: "export interface LeadSchema { id: string; } Synchronous lead deduplication prior to triggering AI enrichment.",
      memories: [
        { title: "Lead Deduplication Strategy", content: "Synchronous deduplication prior to triggering AI enrichment saves API tokens." },
      ],
      constraints: ["Strict type safety", "Strict factual grounding"],
    },
  });

  console.log("Evaluation Passed:", evalRes.output.passed, "Confidence:", evalRes.output.confidence);
  assert(evalRes.status === "success", "Evaluation operation should succeed");
  assert(evalRes.output.passed === true, "Evaluator should pass output matching constraints and memories");
  console.log("✓ TEST 3 COMPLETE\n");

  // Test 4: Predictive Cognitive Models
  console.log(">>> [PYTHON TEST 4] Testing Cognitive Model Predictions...");
  const diffRes = await client.execute({
    operation: "PREDICT_DIFFICULTY",
    inputData: { prompt: "Build multi-agent system design and DAG planner" },
  });

  console.log("Predicted Complexity:", diffRes.output.predictedComplexity, "Failure Risk:", diffRes.output.failureRiskProbability);
  assert(diffRes.status === "success", "Predict difficulty operation should succeed");
  assert(diffRes.output.predictedComplexity === "LEVEL_4", "Should predict LEVEL_4 for multi-agent DAG task");
  console.log("✓ TEST 4 COMPLETE\n");

  // Test 5: ContextRetrievalEngine Integration
  console.log(">>> [PYTHON TEST 5] Testing ContextRetrievalEngine with Python Service...");
  const store = new CognitiveMemoryStore();
  await store.addMemory({
    memoryType: "LESSON",
    projectId: "proj_lead_ops",
    title: "Lead Scoring Token Optimization",
    content: "Synchronous lead deduplication prior to triggering AI enrichment to prevent redundant API token costs.",
    importance: 5,
  });

  const engine = new ContextRetrievalEngine({ store, pythonClient: client });
  const pkg = await engine.buildScopedContextPackage({
    objective: "Implement lead ingestion pipeline with deduplication",
    conversationId: 101,
    projectId: "proj_lead_ops",
    agentRole: "builder",
  });

  console.log("Context Package Items:", pkg.relevantMemories.length);
  assert(pkg.relevantMemories.length > 0, "Context retrieval package should contain hydrated memory");
  assert(pkg.relevantMemories[0].content.includes("deduplication"), "Retrieved memory should contain deduplication lesson");
  console.log("✓ TEST 5 COMPLETE\n");

  console.log("========================================================");
  console.log(" ALL 5 PYTHON INTELLIGENCE BRIDGE SCENARIOS PASSED ");
  console.log("========================================================\n");
}

// Run if executed directly via npx tsx
if (process.argv[1]?.endsWith("pythonBridge.test.ts")) {
  runPythonBridgeTestSuite().catch((err) => {
    console.error("Python Bridge Test Suite Failed:", err);
    process.exit(1);
  });
}
