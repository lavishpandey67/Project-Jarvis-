import { CrossLanguageBoundary } from "./types";

export class CrossLanguageTracer {
  private boundaries: CrossLanguageBoundary[] = [];

  constructor() {
    this.registerKnownBoundaries();
  }

  public registerBoundary(boundary: CrossLanguageBoundary): void {
    this.boundaries.push(boundary);
  }

  public getBoundariesForFile(filePath: string): CrossLanguageBoundary[] {
    return this.boundaries.filter(
      (b) => b.sourceFile.includes(filePath) || b.targetFile.includes(filePath)
    );
  }

  public getAllBoundaries(): CrossLanguageBoundary[] {
    return [...this.boundaries];
  }

  private registerKnownBoundaries(): void {
    // Real Jarvis TS -> Python Bridge Boundary
    this.boundaries.push({
      boundaryId: "bnd_ts_python_intelligence",
      sourceLanguage: "typescript",
      sourceFile: "artifacts/api-server/src/lib/jarvis/pythonBridge/client.ts",
      sourceSymbol: "PythonIntelligenceClient.execute",
      protocol: "HTTP",
      targetLanguage: "python",
      targetFile: "python/intelligence/app/server.py",
      targetSymbol: "handle_intelligence_request",
      requestContract: "IntelligenceRequest { requestId, taskId, operation, inputData }",
      responseContract: "IntelligenceResponse { requestId, status, output, confidence }",
      riskLevel: "MEDIUM",
    });

    // Real Jarvis TS Context Retrieval -> Python Semantic RAG
    this.boundaries.push({
      boundaryId: "bnd_ts_python_rag",
      sourceLanguage: "typescript",
      sourceFile: "artifacts/api-server/src/lib/jarvis/memory/contextEngine.ts",
      sourceSymbol: "ContextRetrievalEngine.retrieveSemanticContext",
      protocol: "HTTP",
      targetLanguage: "python",
      targetFile: "python/intelligence/retrieval/semantic.py",
      targetSymbol: "SemanticRetrievalEngine.retrieve",
      requestContract: "SemanticContextQuery { query, candidates, projectId }",
      responseContract: "ScoredContextPackage { scoredItems, itemsReturned }",
      riskLevel: "LOW",
    });
  }
}
