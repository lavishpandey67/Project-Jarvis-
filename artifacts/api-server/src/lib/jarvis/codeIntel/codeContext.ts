import { CodebaseGraph } from "./codebaseGraph";
import { CrossLanguageTracer } from "./crossLanguageTrace";
import { CodeContextPackage } from "./types";

export interface CodeContextOptions {
  objective: string;
  targetFilePath: string;
  maxTokensBudget?: number;
}

export class CodeContextSynthesizer {
  private graph: CodebaseGraph;
  private tracer: CrossLanguageTracer;

  constructor(graph: CodebaseGraph, tracer: CrossLanguageTracer) {
    this.graph = graph;
    this.tracer = tracer;
  }

  public synthesizeContext(options: CodeContextOptions): CodeContextPackage {
    const budget = options.maxTokensBudget || 4000;
    const targetFile = options.targetFilePath;

    // Dependents & affected files
    const dependents = this.graph.getDependents(targetFile);
    const affectedFiles = this.graph.getAffectedFiles(targetFile);
    const tests = this.graph.getTestsForComponent(targetFile);

    // Cross-language boundaries
    const boundaries = this.tracer.getBoundariesForFile(targetFile);

    // Database operations
    const dbOps = this.graph.getEndpointsReachingDb("/api/intelligence");

    // Synthesize budget-aware package
    const relevantFiles = Array.from(new Set([targetFile, ...dependents, ...tests]));

    return {
      packageId: `ctx_pkg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      objective: options.objective,
      relevantFiles: relevantFiles.slice(0, 10),
      relevantSymbols: [],
      dependencyChain: dependents,
      callChain: [],
      apiContracts: boundaries.map((b) => ({
        endpoint: b.targetFile,
        requestSchema: b.requestContract,
        responseSchema: b.responseContract,
      })),
      databaseReferences: dbOps,
      tests,
      recentFailures: [],
      relevantMemories: [
        {
          id: "mem_code_intel_1",
          title: "Multi-Language Boundary Safety",
          content: "Always sanitize cross-language JSON serialization inputs when passing data between Node.js and Python.",
        },
      ],
      relevantLessons: [
        {
          id: "lesson_dedup_1",
          lesson: "Synchronous lead deduplication prior to triggering AI enrichment prevents redundant API token costs.",
        },
      ],
      contextBudgetTokens: budget,
      actualTokensEstimate: Math.min(budget, relevantFiles.length * 250 + 500),
    };
  }
}
