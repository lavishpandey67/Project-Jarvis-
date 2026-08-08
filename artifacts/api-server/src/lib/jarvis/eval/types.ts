export type EvaluationVerdict = "PASS" | "REVISE" | "PARTIAL" | "FAIL" | "ESCALATE";

export interface EvaluationResult {
  taskId: string;
  evaluator: string;
  schemaScore: number;
  goalScore: number;
  constraintScore: number;
  groundingScore: number;
  criticScore: number;
  confidenceScore: number;
  overallScore: number;
  verdict: EvaluationVerdict;
  failureReasons: string[];
  requiredCorrections: string[];
  evaluatedAt: string;
}

export interface GraphEvaluationResult {
  graphId: string;
  overallVerdict: EvaluationVerdict;
  objectiveSatisfied: boolean;
  overallScore: number;
  unresolvedRisks: string[];
  missingOutputs: string[];
  evaluatedAt: string;
}
