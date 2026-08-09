import { CodebaseGraph } from "./codebaseGraph";
import { CrossLanguageTracer } from "./crossLanguageTrace";
import { ImpactScore } from "./types";

export class ImpactScoreCalculator {
  private graph: CodebaseGraph;
  private tracer: CrossLanguageTracer;

  constructor(graph: CodebaseGraph, tracer: CrossLanguageTracer) {
    this.graph = graph;
    this.tracer = tracer;
  }

  public calculateImpact(filePath: string, proposedContent: string): ImpactScore {
    const dependents = this.graph.getDependents(filePath);
    const affectedFiles = this.graph.getAffectedFiles(filePath);

    const isPublicApi = filePath.includes("api") || filePath.includes("server") || filePath.includes("index");
    const isDbSchema = filePath.includes("schema") || filePath.includes("migration") || /DROP\s+TABLE|ALTER\s+TABLE/i.test(proposedContent);
    const hasCrossLanguage = this.tracer.getBoundariesForFile(filePath).length > 0;
    const isDestructive = /DELETE\s+FROM|DROP\s+TABLE|rm\s+-rf/i.test(proposedContent);

    let score = dependents.length * 10 + affectedFiles.length * 5;
    if (isPublicApi) score += 25;
    if (isDbSchema) score += 30;
    if (hasCrossLanguage) score += 20;
    if (isDestructive) score += 40;

    score = Math.min(100, Math.max(5, score));

    let riskLevel: ImpactScore["riskLevel"] = "LOW";
    if (score > 75) riskLevel = "CRITICAL";
    else if (score > 50) riskLevel = "HIGH";
    else if (score > 25) riskLevel = "MEDIUM";

    let approvalReq: ImpactScore["approvalRequirement"] = "AUTOMATIC";
    if (riskLevel === "CRITICAL" || isDestructive) {
      approvalReq = "EXPLICIT_APPROVAL_REQUIRED";
    } else if (riskLevel === "HIGH") {
      approvalReq = "PEER_REVIEW";
    }

    return {
      score,
      riskLevel,
      dependencyCount: dependents.length,
      affectedFiles,
      affectedSymbols: [filePath],
      publicApiChanges: isPublicApi,
      databaseSchemaImpact: isDbSchema,
      crossLanguageBoundaryImpact: hasCrossLanguage,
      testCoverage: "HIGH",
      reversibility: isDestructive ? "HARD" : "EASY",
      securityImpact: isPublicApi ? "LOW" : "NONE",
      destructivePotential: isDestructive,
      approvalRequirement: approvalReq,
    };
  }
}
