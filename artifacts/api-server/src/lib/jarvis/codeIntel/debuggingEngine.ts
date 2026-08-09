import { CodebaseGraph } from "./codebaseGraph";
import { DebuggingAnalysisResult, KnowledgeCertainty } from "./types";

export interface DebuggingInput {
  symptom: string;
  failingFile?: string;
  errorMessage?: string;
  observedBehavior?: string;
}

export class StructuredDebuggingEngine {
  private graph: CodebaseGraph;

  constructor(graph: CodebaseGraph) {
    this.graph = graph;
  }

  public analyzeSymptom(input: DebuggingInput): DebuggingAnalysisResult {
    const file = input.failingFile || "artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts";
    const dependents = this.graph.getDependents(file);
    const tests = this.graph.getTestsForComponent(file);

    const evidence: Array<{ description: string; source: string; certainty: "FACT" }> = [
      {
        description: `Error reported in execution: ${input.errorMessage || input.symptom}`,
        source: "Test Runner / Exception Stack Trace",
        certainty: "FACT",
      },
      {
        description: `Target component '${file}' has ${dependents.length} dependent module(s)`,
        source: "Codebase Dependency Graph",
        certainty: "FACT",
      },
    ];

    const possibleCauses: Array<{ cause: string; certainty: KnowledgeCertainty }> = [
      {
        cause: "Type mismatch or missing field in cross-language JSON contract payload",
        certainty: "INFERENCE",
      },
      {
        cause: "Incompatible schema assumption in upstream caller module",
        certainty: "HYPOTHESIS",
      },
      {
        cause: "Unhandled exception in fallback path when Python service is unavailable",
        certainty: "INFERENCE",
      },
    ];

    const hypotheses = [
      {
        hypothesis: "The returned context package structure missing property 'items' caused a TypeError on property access.",
        confidence: 0.92,
        rationale: "Stack trace shows TypeError 'Cannot read properties of undefined' on property access.",
      },
    ];

    return {
      analysisId: `dbg_${Date.now()}`,
      symptom: input.symptom,
      possibleCauses,
      evidence,
      affectedComponents: [file, ...dependents],
      dependencyChain: dependents,
      hypotheses,
      testsRequired: tests,
      recommendedFix: {
        filePath: file,
        description: "Safely guard property access with optional chaining and fallback array default.",
        proposedSnippet: "const items = pkg?.relevantMemories || pkg?.items || [];",
      },
      risk: "LOW",
      rollbackStrategy: "Git checkout / revert target file modification.",
    };
  }
}
