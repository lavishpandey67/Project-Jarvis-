import { TechnologyCapabilityRegistry } from "./registry";
import { TechnologyKnowledgeRadar } from "./radar";
import {
  CandidateScoreFactors,
  EngineeringDecisionArtifact,
  TechnologyCandidateScore,
  TechnologyRecord,
  TechnologySelectionResult,
} from "./types";

export interface RoutingTaskRequest {
  taskId: string;
  objective: string;
  requiredCapabilities: string[];
  constraints?: {
    maxLatencyMs?: number;
    offlineRequired?: boolean;
    securityLevel?: "STANDARD" | "HIGH" | "CRITICAL";
    preferredCategory?: string;
  };
}

export class TechnologyRouter {
  private registry: TechnologyCapabilityRegistry;
  private radar: TechnologyKnowledgeRadar;

  constructor(registry: TechnologyCapabilityRegistry, radar: TechnologyKnowledgeRadar) {
    this.registry = registry;
    this.radar = radar;
  }

  /**
   * Route task to optimal technology stack and generate Engineering Decision Artifact
   */
  public route(request: RoutingTaskRequest): TechnologySelectionResult {
    const taskId = request.taskId || `task_route_${Date.now()}`;
    const requiredCaps = request.requiredCapabilities.map((c) => c.toLowerCase());

    // 1. Candidate Generation
    let candidates = this.registry.getAll();
    if (request.constraints?.preferredCategory) {
      const filtered = candidates.filter(
        (c) => c.category.toLowerCase() === request.constraints?.preferredCategory?.toLowerCase()
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // Filter by offline constraint if required
    if (request.constraints?.offlineRequired) {
      candidates = candidates.filter((c) => c.localOfflineCapability);
    }

    if (candidates.length === 0) {
      candidates = this.registry.getAll(); // fallback if strict filter produced zero
    }

    // 2. Candidate Scoring
    const scoredCandidates: Array<{
      record: TechnologyRecord;
      score: TechnologyCandidateScore;
    }> = [];

    for (const tech of candidates) {
      const score = this.scoreCandidate(tech, requiredCaps, request.constraints);
      scoredCandidates.push({ record: tech, score });
    }

    // Sort descending by composite score
    scoredCandidates.sort((a, b) => b.score.compositeScore - a.score.compositeScore);

    const winner = scoredCandidates[0] || {
      record: this.registry.get("lang_typescript")!,
      score: {
        technologyId: "lang_typescript",
        technologyName: "TypeScript",
        compositeScore: 0.8,
        factors: this.getDefaultFactors(),
        reasoning: "Default fallback choice",
      },
    };

    const rejected = scoredCandidates.slice(1).map((item) => ({
      technology: item.record,
      score: item.score,
      rejectionReason: `Scored ${item.score.compositeScore.toFixed(2)} vs Winner ${winner.score.compositeScore.toFixed(2)} (${item.score.reasoning})`,
    }));

    // 3. Build Engineering Decision Artifact
    const decisionArtifact: EngineeringDecisionArtifact = {
      artifactId: `art_${taskId}`,
      timestamp: new Date().toISOString(),
      problem: request.objective,
      requirements: request.requiredCapabilities,
      candidatesEvaluated: candidates.map((c) => c.name),
      selectedTechnology: {
        id: winner.record.technologyId,
        name: winner.record.name,
        justification: winner.score.reasoning,
      },
      rejectedAlternatives: rejected.map((r) => ({
        id: r.technology.technologyId,
        name: r.technology.name,
        reason: r.rejectionReason,
      })),
      tradeoffs: [
        `Selected ${winner.record.name} for optimal balance of capability fit (${winner.score.factors.capabilityFit}) and performance (${winner.score.factors.performance}).`,
        `Accepted tradeoff on ${winner.record.weaknesses[0] || "ecosystem complexity"}.`,
      ],
      confidence: winner.record.confidence,
      assumptions: [
        `Runtime environment satisfies requirements: ${winner.record.runtimeRequirements.join(", ")}.`,
        `Integration with Jarvis orchestration layer remains clean via standard APIs.`,
      ],
      reversibility: "REVERSIBLE",
      evidence: [winner.record.evidenceSource],
    };

    return {
      taskId,
      objective: request.objective,
      requiredCapabilities: request.requiredCapabilities,
      recommendedTechnology: winner.record,
      scoreBreakdown: winner.score,
      rejectedAlternatives: rejected,
      decisionArtifact,
    };
  }

  private scoreCandidate(
    tech: TechnologyRecord,
    requiredCaps: string[],
    constraints?: RoutingTaskRequest["constraints"]
  ): TechnologyCandidateScore {
    // 1. Capability Fit
    let matchedCaps = 0;
    for (const cap of requiredCaps) {
      if (
        tech.capabilities.some(
          (c) => c.toLowerCase().includes(cap) || cap.includes(c.toLowerCase())
        ) ||
        tech.supportedWorkloads.some(
          (w) => w.toLowerCase().includes(cap) || cap.includes(w.toLowerCase())
        )
      ) {
        matchedCaps++;
      }
    }
    const capabilityFit = requiredCaps.length > 0 ? Math.min(1.0, matchedCaps / requiredCaps.length) : 0.8;

    // 2. Performance
    let performance = 0.7;
    if (tech.performanceCharacteristics.latency === "EXTREMELY_LOW") performance += 0.25;
    if (tech.performanceCharacteristics.latency === "LOW") performance += 0.15;
    if (tech.performanceCharacteristics.throughput === "EXTREMELY_HIGH") performance += 0.1;
    performance = Math.min(1.0, performance);

    // 3. Security
    let security = 0.8;
    if (constraints?.securityLevel === "HIGH" || constraints?.securityLevel === "CRITICAL") {
      security = tech.securityConsiderations.length > 1 ? 0.95 : 0.7;
    }

    // 4. Ecosystem & Tooling
    const ecosystemFit = tech.ecosystemMaturity === "ENTERPRISE_STANDARD" ? 0.95 : 0.8;
    const maintainability = tech.capabilities.includes("type_safety") || tech.capabilities.includes("memory_safety") ? 0.95 : 0.75;
    const deploymentComplexity = tech.deploymentCharacteristics.includes("Static binary") || tech.deploymentCharacteristics.includes("Container") ? 0.9 : 0.7;
    const offlineCapability = tech.localOfflineCapability ? 1.0 : 0.4;
    const integrationCost = tech.interoperability.some((i) => i.toLowerCase().includes("typescript") || i.toLowerCase().includes("http")) ? 0.95 : 0.6;
    const developerTooling = 0.9;
    const modelAIEcosystem = tech.category === "AI_ML" || tech.technologyId.includes("python") ? 0.98 : 0.6;
    const resourceConstraints = tech.performanceCharacteristics.memoryFootprint === "MINIMAL" ? 0.95 : 0.75;

    const factors: CandidateScoreFactors = {
      capabilityFit,
      ecosystemFit,
      performance,
      security,
      maintainability,
      deploymentComplexity,
      offlineCapability,
      integrationCost,
      developerTooling,
      modelAIEcosystem,
      resourceConstraints,
    };

    // Weighted composite score calculation
    const compositeScore =
      factors.capabilityFit * 0.25 +
      factors.performance * 0.15 +
      factors.ecosystemFit * 0.10 +
      factors.security * 0.10 +
      factors.maintainability * 0.10 +
      factors.integrationCost * 0.10 +
      factors.modelAIEcosystem * 0.10 +
      factors.offlineCapability * 0.10;

    const reasoning = `${tech.name} achieved composite score ${compositeScore.toFixed(2)} (Capability Fit: ${(capabilityFit * 100).toFixed(0)}%, Performance: ${(performance * 100).toFixed(0)}%, Ecosystem: ${(ecosystemFit * 100).toFixed(0)}%).`;

    return {
      technologyId: tech.technologyId,
      technologyName: tech.name,
      compositeScore,
      factors,
      reasoning,
    };
  }

  private getDefaultFactors(): CandidateScoreFactors {
    return {
      capabilityFit: 0.8,
      ecosystemFit: 0.8,
      performance: 0.8,
      security: 0.8,
      maintainability: 0.8,
      deploymentComplexity: 0.8,
      offlineCapability: 0.8,
      integrationCost: 0.8,
      developerTooling: 0.8,
      modelAIEcosystem: 0.8,
      resourceConstraints: 0.8,
    };
  }
}

export type ModelSubsystemCategory =
  | "REASONING"
  | "CODING_AGENT"
  | "EMBEDDING"
  | "RERANKER"
  | "WEB_SEARCH"
  | "LOCAL_FALLBACK";

export interface ModelRoutingDecision {
  subsystem: ModelSubsystemCategory;
  selectedProvider: string;
  selectedModel: string;
  offlineAvailable: boolean;
  confidence: number;
  reasoning: string;
  fallbackChain: string[];
}

export class ModelIntelligenceRouter {
  /**
   * Provider-neutral routing for reasoning models, coding agents, embeddings, rerankers, web search, and fallbacks.
   */
  public routeModelRequest(
    subsystem: ModelSubsystemCategory,
    preferOffline: boolean = false
  ): ModelRoutingDecision {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasTavily = Boolean(process.env.TAVILY_API_KEY);

    if (subsystem === "CODING_AGENT") {
      if (preferOffline) {
        return {
          subsystem,
          selectedProvider: "AntigravityLocalExecution",
          selectedModel: "antigravity-code-local",
          offlineAvailable: true,
          confidence: 0.85,
          reasoning: "Selected local sandboxed code execution engine.",
          fallbackChain: ["LocalDeterministicSynthesis"],
        };
      }
      return {
        subsystem,
        selectedProvider: hasOpenAI ? "CodexProvider" : "ClaudeCodeProvider",
        selectedModel: hasOpenAI ? "code-davinci-002" : "claude-3-5-sonnet",
        offlineAvailable: false,
        confidence: 0.92,
        reasoning: "Selected top-tier coding agent provider for static analysis and patch generation.",
        fallbackChain: ["AntigravityLocalExecution", "LocalDeterministicSynthesis"],
      };
    }

    if (subsystem === "EMBEDDING") {
      if (hasOpenAI) {
        return {
          subsystem,
          selectedProvider: "OpenAIEmbeddingProvider",
          selectedModel: "text-embedding-3-small",
          offlineAvailable: false,
          confidence: 0.95,
          reasoning: "Selected OpenAI real embedding API (384 dimensions).",
          fallbackChain: ["DevelopmentFallbackProvider"],
        };
      }
      if (hasGemini) {
        return {
          subsystem,
          selectedProvider: "GeminiEmbeddingProvider",
          selectedModel: "text-embedding-004",
          offlineAvailable: false,
          confidence: 0.92,
          reasoning: "Selected Gemini real embedding API (384 dimensions).",
          fallbackChain: ["DevelopmentFallbackProvider"],
        };
      }
      return {
        subsystem,
        selectedProvider: "DevelopmentFallbackProvider",
        selectedModel: "sha256-md5-ngram-feature-hashing",
        offlineAvailable: true,
        confidence: 0.80,
        reasoning: "Selected deterministic 384-dimensional n-gram feature hashing fallback vectorizer.",
        fallbackChain: [],
      };
    }

    if (subsystem === "WEB_SEARCH") {
      return {
        subsystem,
        selectedProvider: hasTavily ? "TavilyWebSearchProvider" : "DuckDuckGoSandboxSearch",
        selectedModel: hasTavily ? "tavily-search-api" : "ddg-html-sanitizer",
        offlineAvailable: !hasTavily,
        confidence: hasTavily ? 0.90 : 0.75,
        reasoning: hasTavily ? "Selected live web search via Tavily API." : "Selected provider-agnostic sandbox web search.",
        fallbackChain: ["DuckDuckGoSandboxSearch"],
      };
    }

    if (subsystem === "RERANKER") {
      return {
        subsystem,
        selectedProvider: "PythonCompositeReranker",
        selectedModel: "multi-factor-weighted-composite-scorer",
        offlineAvailable: true,
        confidence: 0.90,
        reasoning: "Selected Python multi-factor composite reranker.",
        fallbackChain: [],
      };
    }

    // Default REASONING model
    if (preferOffline || (!hasOpenAI && !hasGemini)) {
      return {
        subsystem: "LOCAL_FALLBACK",
        selectedProvider: "LocalDeterministicSynthesis",
        selectedModel: "jarvis-local-cognitive-synthesis",
        offlineAvailable: true,
        confidence: 0.75,
        reasoning: "Operating in local synthesis fallback mode.",
        fallbackChain: [],
      };
    }

    return {
      subsystem: "REASONING",
      selectedProvider: hasOpenAI ? "OpenAIProvider" : "GeminiProvider",
      selectedModel: hasOpenAI ? "gpt-4o" : "gemini-1.5-pro",
      offlineAvailable: false,
      confidence: 0.95,
      reasoning: "Selected top reasoning model provider.",
      fallbackChain: ["LocalDeterministicSynthesis"],
    };
  }
}

export const globalModelRouter = new ModelIntelligenceRouter();
