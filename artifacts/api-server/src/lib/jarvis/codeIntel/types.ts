export type ASTOperation =
  | "PARSE_FILE"
  | "PARSE_PROJECT"
  | "EXTRACT_SYMBOLS"
  | "EXTRACT_IMPORTS"
  | "EXTRACT_EXPORTS"
  | "EXTRACT_TYPES"
  | "EXTRACT_FUNCTIONS"
  | "EXTRACT_CLASSES"
  | "EXTRACT_ENDPOINTS"
  | "EXTRACT_DATABASE_OPERATIONS"
  | "EXTRACT_DEPENDENCIES"
  | "FIND_REFERENCES"
  | "FIND_DEFINITIONS"
  | "BUILD_CALL_GRAPH"
  | "BUILD_MODULE_GRAPH"
  | "BUILD_DATA_FLOW"
  | "DETECT_STRUCTURAL_RISK";

export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "sql"
  | "rust"
  | "go"
  | "java"
  | "kotlin"
  | "cpp"
  | "c"
  | "swift"
  | "dart";

export interface SymbolDefinition {
  id: string;
  name: string;
  kind: "function" | "class" | "type" | "interface" | "variable" | "endpoint" | "db_operation";
  filePath: string;
  language: SupportedLanguage;
  lineStart: number;
  lineEnd: number;
  exported: boolean;
  signature?: string;
  documentation?: string;
  dependencies?: string[];
}

export interface ModuleImport {
  sourceModule: string;
  importedSymbols: string[];
  isRelative: boolean;
  line: number;
}

export interface ModuleExport {
  symbolName: string;
  isDefault: boolean;
  line: number;
}

export interface EndpointDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "RPC";
  path: string;
  filePath: string;
  handlerSymbol: string;
  requestContract?: string;
  responseContract?: string;
}

export interface DatabaseOperation {
  operationType: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE_TABLE" | "ALTER_TABLE" | "DROP_TABLE" | "RAW_QUERY";
  tableOrCollection: string;
  filePath: string;
  line: number;
  rawSnippet?: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "DESTRUCTIVE";
}

export interface ParsedASTResult {
  filePath: string;
  language: SupportedLanguage;
  symbols: SymbolDefinition[];
  imports: ModuleImport[];
  exports: ModuleExport[];
  endpoints: EndpointDefinition[];
  dbOperations: DatabaseOperation[];
  dependencies: string[];
  syntaxErrors: string[];
}

export interface CallGraphEdge {
  callerSymbol: string;
  callerFile: string;
  calleeSymbol: string;
  calleeFile: string;
  callType: "DIRECT_FUNCTION" | "HTTP_REQUEST" | "CLI_INVOCATION" | "DB_QUERY";
}

export interface CrossLanguageBoundary {
  boundaryId: string;
  sourceLanguage: SupportedLanguage;
  sourceFile: string;
  sourceSymbol: string;
  protocol: "HTTP" | "CLI" | "IPC" | "GRPC" | "WEBSOCKET" | "SHARED_DB";
  targetLanguage: SupportedLanguage;
  targetFile: string;
  targetSymbol: string;
  requestContract?: string;
  responseContract?: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CodeContextPackage {
  packageId: string;
  timestamp: string;
  objective: string;
  relevantFiles: string[];
  relevantSymbols: SymbolDefinition[];
  dependencyChain: string[];
  callChain: CallGraphEdge[];
  apiContracts: Array<{ endpoint: string; requestSchema?: string; responseSchema?: string }>;
  databaseReferences: DatabaseOperation[];
  tests: string[];
  recentFailures: string[];
  relevantMemories: Array<{ id: string; title: string; content: string }>;
  relevantLessons: Array<{ id: string; lesson: string }>;
  contextBudgetTokens: number;
  actualTokensEstimate: number;
}

export type KnowledgeCertainty = "FACT" | "INFERENCE" | "HYPOTHESIS" | "UNKNOWN";

export interface DebuggingAnalysisResult {
  analysisId: string;
  symptom: string;
  possibleCauses: Array<{ cause: string; certainty: KnowledgeCertainty }>;
  evidence: Array<{ description: string; source: string; certainty: "FACT" }>;
  affectedComponents: string[];
  dependencyChain: string[];
  hypotheses: Array<{ hypothesis: string; confidence: number; rationale: string }>;
  testsRequired: string[];
  recommendedFix: {
    filePath: string;
    description: string;
    proposedSnippet?: string;
  };
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rollbackStrategy: string;
}

export interface ImpactScore {
  score: number; // 0.0 to 100.0
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dependencyCount: number;
  affectedFiles: string[];
  affectedSymbols: string[];
  publicApiChanges: boolean;
  databaseSchemaImpact: boolean;
  crossLanguageBoundaryImpact: boolean;
  testCoverage: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  reversibility: "EASY" | "MODERATE" | "HARD" | "IRREVERSIBLE";
  securityImpact: "NONE" | "LOW" | "HIGH";
  destructivePotential: boolean;
  approvalRequirement: "AUTOMATIC" | "PEER_REVIEW" | "EXPLICIT_APPROVAL_REQUIRED";
}

export interface RefactorPipelineRequest {
  refactorId: string;
  objective: string;
  targetFiles: string[];
  proposedChanges: Array<{ filePath: string; newContent: string }>;
  requireApprovalForHighRisk?: boolean;
}

export interface RefactorPipelineResult {
  refactorId: string;
  status: "COMPLETED" | "REJECTED_HIGH_RISK" | "ROLLED_BACK" | "FAILED";
  impactScore: ImpactScore;
  affectedFiles: string[];
  affectedSymbols: string[];
  beforeAfterDiffs: Array<{ filePath: string; diff: string }>;
  validationResults: {
    typecheckPassed: boolean;
    testsPassed: boolean;
    evaluatorPassed: boolean;
  };
  rollbackExecuted: boolean;
  explanation: string;
}

export type QualityFindingCategory = "STATIC_FINDING" | "HEURISTIC_FINDING" | "MODEL_JUDGMENT";

export interface CodeQualityFinding {
  id: string;
  ruleId: string;
  category: QualityFindingCategory;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  filePath: string;
  line?: number;
  message: string;
  recommendation: string;
}

export interface FinalEngineeringDecisionArtifact {
  artifactId: string;
  timestamp: string;
  problem: string;
  requirements: string[];
  observedArchitecture: string;
  evidence: string[];
  hypotheses: string[];
  alternativesEvaluated: Array<{ option: string; tradeoff: string }>;
  selectedApproach: string;
  rejectedAlternatives: Array<{ option: string; reason: string }>;
  tradeoffs: string[];
  dependencies: string[];
  risk: string;
  blastRadius: {
    affectedFilesCount: number;
    affectedComponents: string[];
  };
  tests: string[];
  rollbackPlan: string;
  confidence: number;
  unknowns: string[];
  nextAction: string;
}
