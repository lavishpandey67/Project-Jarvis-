export type TechnologyCategory =
  | "LANGUAGE"
  | "FRONTEND"
  | "BACKEND"
  | "DATA_SYSTEM"
  | "AI_ML"
  | "DEVOPS_INFRA"
  | "TESTING_OBSERVABILITY";

export type KnowledgeStatus =
  | "KNOWN"
  | "VERIFIED"
  | "LIVE_VERIFIED"
  | "STALE"
  | "UNCERTAIN"
  | "UNKNOWN";

export interface TechnologyRecord {
  technologyId: string;
  name: string;
  category: TechnologyCategory;
  capabilities: string[];
  strengths: string[];
  weaknesses: string[];
  supportedWorkloads: string[];
  runtimeRequirements: string[];
  performanceCharacteristics: {
    latency: "EXTREMELY_LOW" | "LOW" | "MEDIUM" | "HIGH";
    throughput: "EXTREMELY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
    memoryFootprint: "MINIMAL" | "MODERATE" | "HEAVY";
  };
  localOfflineCapability: boolean;
  deploymentCharacteristics: string[];
  ecosystemMaturity: "EMERGING" | "MATURE" | "LEGACY" | "ENTERPRISE_STANDARD";
  securityConsiderations: string[];
  interoperability: string[];
  alternatives: string[];
  confidence: number;
  lastVerified: string;
  status: KnowledgeStatus;
  evidenceSource: string;
}

export interface CandidateScoreFactors {
  capabilityFit: number;        // 0.0 - 1.0
  ecosystemFit: number;         // 0.0 - 1.0
  performance: number;          // 0.0 - 1.0
  security: number;             // 0.0 - 1.0
  maintainability: number;       // 0.0 - 1.0
  deploymentComplexity: number; // 0.0 - 1.0 (higher = easier/better)
  offlineCapability: number;    // 0.0 - 1.0
  integrationCost: number;     // 0.0 - 1.0 (higher = cheaper/lower cost)
  developerTooling: number;     // 0.0 - 1.0
  modelAIEcosystem: number;     // 0.0 - 1.0
  resourceConstraints: number;  // 0.0 - 1.0
}

export interface TechnologyCandidateScore {
  technologyId: string;
  technologyName: string;
  compositeScore: number;
  factors: CandidateScoreFactors;
  reasoning: string;
}

export interface TechnologySelectionResult {
  taskId: string;
  objective: string;
  requiredCapabilities: string[];
  recommendedTechnology: TechnologyRecord;
  scoreBreakdown: TechnologyCandidateScore;
  rejectedAlternatives: Array<{
    technology: TechnologyRecord;
    score: TechnologyCandidateScore;
    rejectionReason: string;
  }>;
  decisionArtifact: EngineeringDecisionArtifact;
}

export interface EngineeringDecisionArtifact {
  artifactId: string;
  timestamp: string;
  problem: string;
  requirements: string[];
  candidatesEvaluated: string[];
  selectedTechnology: {
    id: string;
    name: string;
    justification: string;
  };
  rejectedAlternatives: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  tradeoffs: string[];
  confidence: number;
  assumptions: string[];
  reversibility: "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE";
  evidence: string[];
}
