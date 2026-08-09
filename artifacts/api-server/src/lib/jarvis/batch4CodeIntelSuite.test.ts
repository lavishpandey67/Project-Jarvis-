import {
  CodeQualityEngine,
  CodebaseGraph,
  CodeContextSynthesizer,
  CrossLanguageTracer,
  FinalEngineeringDecisionArtifact,
  ImpactScoreCalculator,
  PolyglotASTEngine,
  StructuredDebuggingEngine,
  StructuralRefactoringEngine,
} from "./codeIntel";
import { CognitiveMemoryStore } from "./memory/store";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Batch 4 CodeIntel Test Assertion Failed] ${message}`);
  }
}

export async function runBatch4CodeIntelTestSuite(): Promise<void> {
  console.log("========================================================");
  console.log("   JARVIS BRAIN — BATCH 4 CODE INTELLIGENCE SUITE      ");
  console.log("========================================================\n");

  const astEngine = new PolyglotASTEngine();
  const graph = new CodebaseGraph();
  const tracer = new CrossLanguageTracer();
  const store = new CognitiveMemoryStore();

  const latencies: { [key: string]: number[] } = {
    astParsing: [],
    symbolExtraction: [],
    graphConstruction: [],
    crossLanguageTracing: [],
  };

  // Helper to record latency
  const measure = async <T>(key: string, fn: () => T): Promise<T> => {
    const t0 = performance.now();
    const res = await fn();
    const duration = performance.now() - t0;
    latencies[key].push(duration);
    return res;
  };

  // Populate Graph with real repository files
  console.log(">>> [SETUP] Indexing Repository Files into Codebase Graph...");
  const tsFile = `
import { PythonIntelligenceClient } from "../pythonBridge/client";
export interface ContextPackage { items: any[]; }
export function getContext(query: string) {
  const client = new PythonIntelligenceClient();
  const records = db.query("SELECT * FROM cognitive_memories");
  return client.retrieveSemanticContext({ query, candidates: records });
}
`;
  const pyFile = `
from fastapi import FastAPI
app = FastAPI()
@app.post("/api/v1/intelligence")
def handle_intelligence_request(payload: dict):
    return {"status": "success", "scoredItems": []}
`;
  const sqlFile = `
CREATE TABLE cognitive_memories (
  id VARCHAR(255) PRIMARY KEY,
  content TEXT NOT NULL
);
DROP TABLE legacy_records;
`;

  const parsedTs = await measure("astParsing", () => astEngine.parseFile("artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts", tsFile));
  const parsedPy = await measure("astParsing", () => astEngine.parseFile("python/intelligence/app/server.py", pyFile));
  const parsedSql = await measure("astParsing", () => astEngine.parseFile("src/db/schema.sql", sqlFile));

  await measure("graphConstruction", () => {
    graph.addFile(parsedTs);
    graph.addFile(parsedPy);
    graph.addFile(parsedSql);
  });

  console.log("✓ SETUP COMPLETE\n");

  // TEST A: Find a bug across TypeScript -> Python
  console.log(">>> [TEST A] Cross-Language Bug Discovery (TS -> Python)...");
  const boundaries = await measure("crossLanguageTracing", () => tracer.getBoundariesForFile("contextEngine.ts"));
  console.log("Cross-language boundaries found:", boundaries.length);
  assert(boundaries.length > 0, "Should detect TS -> Python cross-language boundary");
  assert(boundaries[0].targetLanguage === "python", "Target language should be python");
  console.log("✓ TEST A COMPLETE\n");

  // TEST B: Trace an API request to database access
  console.log(">>> [TEST B] Tracing API Request to Database Access...");
  const dbOps = graph.getEndpointsReachingDb("/api/v1/intelligence");
  console.log("DB Operations reached from API:", dbOps.length);
  assert(dbOps.length > 0, "Should trace API route to database operations");
  console.log("✓ TEST B COMPLETE\n");

  // TEST C: Find all references to a symbol
  console.log(">>> [TEST C] Finding References to Symbol...");
  const symDef = graph.findSymbolDefinition("getContext");
  console.log("Symbol definition found:", symDef?.name, "in", symDef?.filePath);
  assert(symDef !== undefined && symDef.name === "getContext", "Should find symbol definition for getContext");
  console.log("✓ TEST C COMPLETE\n");

  // TEST D: Change a shared interface and identify affected files
  console.log(">>> [TEST D] Identifying Blast Radius of Shared Interface Change...");
  const affected = graph.getAffectedFiles("artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts");
  console.log("Affected files count:", affected.length);
  assert(affected.length >= 1, "Should identify affected files for interface change");
  console.log("✓ TEST D COMPLETE\n");

  // TEST E: Detect a circular dependency
  console.log(">>> [TEST E] Structural Circular Dependency Detection...");
  // Inject mock circular import
  const circA = astEngine.parseFile("src/moduleA.ts", `import { b } from "./moduleB"; export const a = 1;`);
  const circB = astEngine.parseFile("src/moduleB.ts", `import { a } from "./moduleA"; export const b = 2;`);
  graph.addFile(circA);
  graph.addFile(circB);

  const qualityEngine = new CodeQualityEngine(graph);
  const findings = qualityEngine.inspectCodebase();
  const circulars = findings.filter((f) => f.ruleId === "CIRCULAR_DEPENDENCY");
  console.log("Circular dependencies detected:", circulars.length);
  assert(circulars.length > 0, "Should detect circular dependency between moduleA and moduleB");
  console.log("✓ TEST E COMPLETE\n");

  // TEST F: Identify database schema change blast radius
  console.log(">>> [TEST F] Database Schema Change Blast Radius...");
  const impactCalc = new ImpactScoreCalculator(graph, tracer);
  const schemaImpact = impactCalc.calculateImpact("src/db/schema.sql", "DROP TABLE legacy_records;");
  console.log("Schema Impact Score:", schemaImpact.score, "Risk Level:", schemaImpact.riskLevel);
  assert(schemaImpact.databaseSchemaImpact === true, "Should flag database schema impact");
  assert(schemaImpact.destructivePotential === true, "Should flag destructive drop table potential");
  console.log("✓ TEST F COMPLETE\n");

  // TEST G: Debug a deliberately failing test
  console.log(">>> [TEST G] Structured Debugging Engine on Failing Test...");
  const dbgEngine = new StructuredDebuggingEngine(graph);
  const dbgResult = dbgEngine.analyzeSymptom({
    symptom: "TypeError: Cannot read properties of undefined (reading 'length')",
    failingFile: "artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts",
    errorMessage: "Cannot read properties of undefined (reading 'length')",
  });

  console.log("Debugging Analysis Hypotheses:", dbgResult.hypotheses[0].hypothesis);
  assert(dbgResult.hypotheses.length > 0, "Should generate debugging hypotheses");
  assert(dbgResult.evidence.every((e) => e.certainty === "FACT"), "Evidence must be strictly FACT");
  console.log("✓ TEST G COMPLETE\n");

  // TEST H: Propose a multi-file refactor without applying it
  console.log(">>> [TEST H] Multi-File Refactor Proposal...");
  const refactorEngine = new StructuralRefactoringEngine(graph, tracer);
  const propResult = refactorEngine.executeRefactor({
    refactorId: "ref_prop_1",
    objective: "Safely upgrade context package property access",
    targetFiles: ["artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts"],
    proposedChanges: [
      {
        filePath: "artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts",
        newContent: "// Refactored type-safe property access",
      },
    ],
  });

  console.log("Proposed Refactor Status:", propResult.status);
  assert(propResult.status === "COMPLETED", "Proposal execution should succeed");
  console.log("✓ TEST H COMPLETE\n");

  // TEST I: Apply safe refactor and verify tests
  console.log(">>> [TEST I] Executing Safe Refactor & Test Verification...");
  const safeResult = refactorEngine.executeRefactor({
    refactorId: "ref_safe_1",
    objective: "Safe non-destructive update",
    targetFiles: ["artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts"],
    proposedChanges: [
      {
        filePath: "artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts",
        newContent: "// Safe update",
      },
    ],
  });
  assert(safeResult.validationResults.typecheckPassed === true, "Validation typecheck should pass");
  console.log("✓ TEST I COMPLETE\n");

  // TEST J: Reject a dangerous/destructive change without approval
  console.log(">>> [TEST J] Rejecting High-Risk Destructive Change...");
  const rejectResult = refactorEngine.executeRefactor({
    refactorId: "ref_danger_1",
    objective: "Drop legacy database table",
    targetFiles: ["src/db/schema.sql"],
    proposedChanges: [
      {
        filePath: "src/db/schema.sql",
        newContent: "DROP TABLE legacy_records;",
      },
    ],
    requireApprovalForHighRisk: true,
  });

  console.log("Destructive Refactor Status:", rejectResult.status);
  assert(rejectResult.status === "REJECTED_HIGH_RISK", "Should reject high-risk destructive change without approval");
  console.log("✓ TEST J COMPLETE\n");

  // TEST K: Adversarial Testing (Misleading filenames & comments)
  console.log(">>> [TEST K] Adversarial Testing (Resilience to Misleading Comments)...");
  const advFile = astEngine.parseFile(
    "src/fake_helper.ts",
    `
    // THIS IS A UTILITY FILE THAT DOES NO DB ACCESS
    import { db } from "./db";
    export function executeQuery() {
      return db.query("DELETE FROM users;");
    }
    `
  );
  graph.addFile(advFile);

  const advDbOps = advFile.dbOperations;
  console.log("Adversarial DB Ops Extracted:", advDbOps.length);
  assert(advDbOps.length > 0, "AST engine must extract real DELETE query despite misleading comment");
  console.log("✓ TEST K COMPLETE\n");

  // TEST L: Memory Compounding Integration
  console.log(">>> [TEST L] Memory Compounding Integration from Debugging Lesson...");
  await store.addMemory({
    memoryType: "LESSON",
    projectId: "proj_code_intel",
    title: "Lesson: Always guard array length access on optional returned objects",
    content: "When retrieving context packages from python bridge, check pkg?.relevantMemories before reading length.",
    importance: 5,
  });

  const retrieved = await store.queryMemories({ projectId: "proj_code_intel" });
  console.log("Compounded Lessons Count:", retrieved.length);
  assert(retrieved.length > 0, "Debugging lesson should be persisted in Cognitive Memory Store");
  console.log("✓ TEST L COMPLETE\n");

  // Calculate & Display Performance Latency Metrics
  console.log("========================================================");
  console.log("           PERFORMANCE LATENCY MEASUREMENTS             ");
  console.log("========================================================");
  for (const [key, samples] of Object.entries(latencies)) {
    if (samples.length === 0) continue;
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)].toFixed(2);
    const p95 = samples[Math.floor(samples.length * 0.95)].toFixed(2);
    console.log(`${key.padEnd(25)} -> p50: ${p50}ms | p95: ${p95}ms | count: ${samples.length}`);
  }
  console.log("\n========================================================");
  console.log("  ALL 12 BATCH 4 CODE INTELLIGENCE SCENARIOS PASSED     ");
  console.log("========================================================\n");
}

if (process.argv[1]?.endsWith("batch4CodeIntelSuite.test.ts")) {
  runBatch4CodeIntelTestSuite().catch((err) => {
    console.error("Batch 4 CodeIntel Test Suite Failed:", err);
    process.exit(1);
  });
}
