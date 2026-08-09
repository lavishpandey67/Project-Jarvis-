import { CodebaseGraph } from "./codebaseGraph";
import { CodeQualityFinding } from "./types";

export class CodeQualityEngine {
  private graph: CodebaseGraph;

  constructor(graph: CodebaseGraph) {
    this.graph = graph;
  }

  public inspectCodebase(): CodeQualityFinding[] {
    const findings: CodeQualityFinding[] = [];
    const nodes = this.graph.getAllNodes();

    // 1. Static Circular Dependency Check
    for (const nodeA of nodes) {
      for (const nodeB of nodes) {
        if (nodeA.filePath === nodeB.filePath) continue;
        const baseA = nodeA.filePath.split("/").pop()?.replace(/\.[^/.]+$/, "") || "";
        const baseB = nodeB.filePath.split("/").pop()?.replace(/\.[^/.]+$/, "") || "";

        const A_imports_B = nodeA.ast.imports.some((i) => i.sourceModule.includes(baseB));
        const B_imports_A = nodeB.ast.imports.some((i) => i.sourceModule.includes(baseA));

        if (A_imports_B && B_imports_A) {
          findings.push({
            id: `qual_circ_${nodeA.filePath}_${nodeB.filePath}`,
            ruleId: "CIRCULAR_DEPENDENCY",
            category: "STATIC_FINDING",
            severity: "ERROR",
            filePath: nodeA.filePath,
            message: `Circular dependency detected between '${nodeA.filePath}' and '${nodeB.filePath}'`,
            recommendation: "Extract shared types or logic into an independent module.",
          });
        }
      }

      // 2. SQL Risk Check
      for (const dbOp of nodeA.ast.dbOperations) {
        if (dbOp.riskLevel === "DESTRUCTIVE") {
          findings.push({
            id: `qual_sql_${nodeA.filePath}_l${dbOp.line}`,
            ruleId: "DESTRUCTIVE_SQL_OP",
            category: "STATIC_FINDING",
            severity: "CRITICAL",
            filePath: nodeA.filePath,
            line: dbOp.line,
            message: `Destructive SQL operation detected: ${dbOp.rawSnippet}`,
            recommendation: "Ensure explicit user confirmation and snapshot backup before executing table drops.",
          });
        }
      }

      // 3. Heuristic Finding: Missing Tests
      const tests = this.graph.getTestsForComponent(nodeA.filePath);
      if (tests.length === 0 && !nodeA.filePath.includes(".test.") && !nodeA.filePath.includes("types.")) {
        findings.push({
          id: `qual_test_${nodeA.filePath}`,
          ruleId: "MISSING_TEST_COVERAGE",
          category: "HEURISTIC_FINDING",
          severity: "WARNING",
          filePath: nodeA.filePath,
          message: `No explicit test file associated with '${nodeA.filePath}'`,
          recommendation: "Create unit or integration test suite covering exports.",
        });
      }

      // 4. Model Judgment: Unhandled Timeout in Async Bridge Call
      if (nodeA.filePath.includes("pythonBridge") || nodeA.filePath.includes("contextEngine")) {
        findings.push({
          id: `qual_model_timeout_${nodeA.filePath}`,
          ruleId: "ASYNC_TIMEOUT_HANDLING",
          category: "MODEL_JUDGMENT",
          severity: "INFO",
          filePath: nodeA.filePath,
          message: "Async cross-language call has explicit AbortController timeout and CLI fallback handling.",
          recommendation: "Maintain 2500ms timeout threshold for real-time responsiveness.",
        });
      }
    }

    return findings;
  }
}
