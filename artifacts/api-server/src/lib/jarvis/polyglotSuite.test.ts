import {
  CodeCapabilityManager,
  TechnologyCapabilityRegistry,
  TechnologyKnowledgeRadar,
  TechnologyRouter,
} from "./polyglot";
import { PythonIntelligenceClient } from "./pythonBridge/client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Polyglot Test Assertion Failed] ${message}`);
  }
}

export async function runPolyglotTestSuite(): Promise<void> {
  console.log("========================================================");
  console.log("   JARVIS BRAIN — POLYGLOT INTELLIGENCE SUITE (3.5)     ");
  console.log("========================================================\n");

  const registry = new TechnologyCapabilityRegistry();
  const radar = new TechnologyKnowledgeRadar(registry);
  const router = new TechnologyRouter(registry, radar);
  const codeCap = new CodeCapabilityManager();
  const pythonClient = new PythonIntelligenceClient();

  // Test 1: Build a semantic retrieval system
  console.log(">>> [SCENARIO 1] Route: Semantic Retrieval System...");
  const res1 = router.route({
    taskId: "scen_1",
    objective: "Build a high-precision semantic retrieval & RAG system",
    requiredCapabilities: ["embeddings", "semantic_retrieval", "reranking"],
  });
  console.log("Recommended Tech:", res1.recommendedTechnology.name);
  assert(
    res1.recommendedTechnology.technologyId.includes("python") ||
      res1.recommendedTechnology.technologyId.includes("rag"),
    "Semantic retrieval should recommend Python / RAG engine"
  );
  assert(res1.decisionArtifact.candidatesEvaluated.length > 1, "Decision artifact should record candidate evaluation");
  console.log("✓ SCENARIO 1 COMPLETE\n");

  // Test 2: Build a high-performance parser
  console.log(">>> [SCENARIO 2] Route: High-Performance Parser...");
  const res2 = router.route({
    taskId: "scen_2",
    objective: "Build an ultra-fast zero-allocation AST parser",
    requiredCapabilities: ["high_performance", "memory_safety", "system_programming"],
  });
  console.log("Recommended Tech:", res2.recommendedTechnology.name);
  assert(res2.recommendedTechnology.technologyId === "lang_rust", "Parser should recommend Rust");
  console.log("✓ SCENARIO 2 COMPLETE\n");

  // Test 3: Build a mobile application
  console.log(">>> [SCENARIO 3] Route: Mobile Application...");
  const res3 = router.route({
    taskId: "scen_3",
    objective: "Build a responsive mobile app UI with local state",
    requiredCapabilities: ["single_page_app", "component_architecture", "reactive_state"],
  });
  console.log("Recommended Tech:", res3.recommendedTechnology.name);
  assert(res3.recommendedTechnology.technologyId === "front_react", "Mobile/Web app should select React UI stack");
  console.log("✓ SCENARIO 3 COMPLETE\n");

  // Test 4: Build an ML data pipeline
  console.log(">>> [SCENARIO 4] Route: ML Data Pipeline...");
  const res4 = router.route({
    taskId: "scen_4",
    objective: "Build statistical data science & probabilistic pipeline",
    requiredCapabilities: ["data_science", "machine_learning", "probabilistic_modeling"],
  });
  console.log("Recommended Tech:", res4.recommendedTechnology.name);
  assert(res4.recommendedTechnology.technologyId === "lang_python", "ML data pipeline should select Python");
  console.log("✓ SCENARIO 4 COMPLETE\n");

  // Test 5: Build a transactional database system
  console.log(">>> [SCENARIO 5] Route: Transactional Database System...");
  const res5 = router.route({
    taskId: "scen_5",
    objective: "Build persistent transactional state system with ACID compliance",
    requiredCapabilities: ["transactional_state", "acid_compliance", "relational_schema"],
  });
  console.log("Recommended Tech:", res5.recommendedTechnology.name);
  assert(res5.recommendedTechnology.technologyId === "data_postgresql", "Transactional DB should select PostgreSQL");
  console.log("✓ SCENARIO 5 COMPLETE\n");

  // Test 6: Build a real-time backend
  console.log(">>> [SCENARIO 6] Route: Real-time Backend...");
  const res6 = router.route({
    taskId: "scen_6",
    objective: "Build concurrent real-time microservices gateway",
    requiredCapabilities: ["concurrency", "microservices", "networking"],
  });
  console.log("Recommended Tech:", res6.recommendedTechnology.name);
  assert(
    res6.recommendedTechnology.technologyId === "lang_go" ||
      res6.recommendedTechnology.technologyId === "lang_typescript",
    "Real-time backend should select Go or TypeScript"
  );
  console.log("✓ SCENARIO 6 COMPLETE\n");

  // Test 7: Build a security-sensitive service
  console.log(">>> [SCENARIO 7] Route: Security-Sensitive Service...");
  const res7 = router.route({
    taskId: "scen_7",
    objective: "Build zero-trust memory safe cryptographic module",
    requiredCapabilities: ["memory_safety", "high_performance"],
    constraints: { securityLevel: "CRITICAL" },
  });
  console.log("Recommended Tech:", res7.recommendedTechnology.name);
  assert(res7.recommendedTechnology.technologyId === "lang_rust", "Security-sensitive service should select Rust");
  console.log("✓ SCENARIO 7 COMPLETE\n");

  // Test 8: Build an offline inference component
  console.log(">>> [SCENARIO 8] Route: Offline Inference Component...");
  const res8 = router.route({
    taskId: "scen_8",
    objective: "Build local offline vector embedding and retrieval engine",
    requiredCapabilities: ["embeddings", "semantic_retrieval"],
    constraints: { offlineRequired: true },
  });
  console.log("Recommended Tech:", res8.recommendedTechnology.name);
  assert(res8.recommendedTechnology.localOfflineCapability === true, "Offline component must support local execution");
  console.log("✓ SCENARIO 8 COMPLETE\n");

  // Test 9: Build a frontend application
  console.log(">>> [SCENARIO 9] Route: Responsive Frontend Application...");
  const res9 = router.route({
    taskId: "scen_9",
    objective: "Build interactive control room dashboard",
    requiredCapabilities: ["frontend_ui", "fullstack", "async_await"],
  });
  console.log("Recommended Tech:", res9.recommendedTechnology.name);
  assert(res9.recommendedTechnology.technologyId === "lang_typescript", "Frontend app orchestration should select TypeScript");
  console.log("✓ SCENARIO 9 COMPLETE\n");

  // Test 10: Code Capability & Multi-Language Project Debugging
  console.log(">>> [SCENARIO 10] Code Capability & Project Diagnostics...");
  const tsProfile = codeCap.getProfile("typescript");
  const pyProfile = codeCap.getProfile("python");
  assert(tsProfile !== undefined, "TypeScript profile should exist");
  assert(pyProfile !== undefined, "Python profile should exist");
  assert(tsProfile!.fileExtensions.includes(".ts"), "TS extension should be .ts");
  assert(pyProfile!.primaryFrameworks.includes("FastAPI"), "Python frameworks should include FastAPI");
  console.log("✓ SCENARIO 10 COMPLETE\n");

  // Test 11: Python Bridge Intelligence Check
  console.log(">>> [SCENARIO 11] Cross-Language Python Contract & RAG Check...");
  const pyRes = await pythonClient.retrieveSemanticContext({
    query: "Multi-language Polyglot Routing",
    candidates: [
      { id: "mem_poly_1", title: "Polyglot Registry", content: "Jarvis technology capability router selects optimal stack." },
    ],
  });
  assert(pyRes.status === "success", "Python bridge call should succeed");
  console.log("✓ SCENARIO 11 COMPLETE\n");

  console.log("========================================================");
  console.log("   ALL 11 POLYGLOT ARCHITECTURE SCENARIOS PASSED        ");
  console.log("========================================================\n");
}

if (process.argv[1]?.endsWith("polyglotSuite.test.ts")) {
  runPolyglotTestSuite().catch((err) => {
    console.error("Polyglot Test Suite Failed:", err);
    process.exit(1);
  });
}
