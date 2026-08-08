import { TaskGraph, TaskGraphNode, DAGExecutionResult } from "../dag/types";
import { ScopedContext } from "../types";
import { runCriticGate } from "./criticGate";
import { EvaluationResult, GraphEvaluationResult, EvaluationVerdict } from "./types";

export function evaluateTaskResult(
  node: TaskGraphNode,
  agentOutput: string,
  context: ScopedContext,
): EvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const failureReasons: string[] = [];
  const requiredCorrections: string[] = [];

  // 1. Schema Score
  let schemaScore = 1.0;
  if (!agentOutput || agentOutput.trim().length === 0) {
    schemaScore = 0.0;
    failureReasons.push("Output is empty.");
    requiredCorrections.push("Generate non-empty result content.");
  }

  // 2. Goal Score
  let goalScore = 1.0;
  if (node.description) {
    const descWords = node.description.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const outputLower = (agentOutput || "").toLowerCase();
    let matched = 0;
    for (const word of descWords) {
      if (outputLower.includes(word)) matched++;
    }
    if (descWords.length > 0) {
      goalScore = Math.min(1.0, Math.max(0.2, matched / descWords.length + 0.3));
    }
  }

  // 3. Grounding Score
  let groundingScore = 0.8;
  if (node.assignedAgentRole === "research") {
    const hasData = /(fact|data|evidence|source|benchmark|study|paper|result)/i.test(agentOutput || "");
    groundingScore = hasData ? 1.0 : 0.4;
    if (!hasData) {
      failureReasons.push("Research output lacks explicit empirical or factual grounding.");
      requiredCorrections.push("Include explicit data points, study references, or benchmark facts.");
    }
  }

  // 4. Critic Gate Score
  const criticRes = runCriticGate(node, agentOutput, context);
  const criticScore = criticRes.criticScore;
  failureReasons.push(...criticRes.failureReasons, ...criticRes.contradictionsFound);
  requiredCorrections.push(...criticRes.suggestedCorrections);

  // 5. Constraint Score
  let constraintScore = 1.0;
  if (criticRes.contradictionsFound.length > 0) {
    constraintScore = Math.max(0.1, 1.0 - criticRes.contradictionsFound.length * 0.3);
  }

  // 6. Confidence Score
  const confidenceScore = node.confidence ?? 0.8;

  // Weighted Overall Score
  const overallScore = Number(
    (
      schemaScore * 0.15 +
      goalScore * 0.25 +
      constraintScore * 0.2 +
      groundingScore * 0.15 +
      criticScore * 0.25
    ).toFixed(2),
  );

  // Verdict Determination
  let verdict: EvaluationVerdict = "PASS";
  const currentRevisions = node.revisionCount || 0;
  const maxRevisions = node.maxRevisionCycles ?? 2;

  if (overallScore >= 0.75 && failureReasons.length === 0) {
    verdict = "PASS";
  } else if (currentRevisions < maxRevisions) {
    verdict = "REVISE";
  } else if (failureReasons.length > 0) {
    verdict = failureReasons.some((f) => f.includes("Exceeded") || f.includes("Violates") || f.includes("constraint"))
      ? "ESCALATE"
      : "FAIL";
  } else if (overallScore >= 0.5) {
    verdict = "PARTIAL";
  } else {
    verdict = "FAIL";
  }

  return {
    taskId: node.taskId,
    evaluator: "JarvisCriticEvaluator",
    schemaScore,
    goalScore,
    constraintScore,
    groundingScore,
    criticScore,
    confidenceScore,
    overallScore,
    verdict,
    failureReasons: Array.from(new Set(failureReasons)),
    requiredCorrections: Array.from(new Set(requiredCorrections)),
    evaluatedAt,
  };
}

export function evaluateGraphObjective(
  graph: TaskGraph,
  dagResult: DAGExecutionResult,
  context: ScopedContext,
): GraphEvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const unresolvedRisks: string[] = [];
  const missingOutputs: string[] = [];

  let totalScore = 0;
  let evaluatedCount = 0;

  for (const node of graph.nodes) {
    if (node.latestEvaluation) {
      totalScore += node.latestEvaluation.overallScore;
      evaluatedCount++;
      if (node.latestEvaluation.verdict === "FAIL" || node.latestEvaluation.verdict === "ESCALATE") {
        unresolvedRisks.push(`Task '${node.taskId}' (${node.assignedAgentName}) failed evaluation: ${node.latestEvaluation.failureReasons.join(", ")}`);
      }
    } else if (node.status !== "SUCCESS") {
      missingOutputs.push(`Task '${node.taskId}' (${node.description}) did not complete successfully (Status: ${node.status}).`);
    }
  }

  const overallScore = evaluatedCount > 0 ? Number((totalScore / evaluatedCount).toFixed(2)) : 0;
  const objectiveSatisfied = graph.status === "COMPLETED" && unresolvedRisks.length === 0 && missingOutputs.length === 0;

  let overallVerdict: EvaluationVerdict = "PASS";
  if (objectiveSatisfied) {
    overallVerdict = "PASS";
  } else if (graph.status === "PARTIAL" || (graph.status === "COMPLETED" && missingOutputs.length > 0)) {
    overallVerdict = "PARTIAL";
  } else if (unresolvedRisks.length > 0) {
    overallVerdict = "ESCALATE";
  } else {
    overallVerdict = "FAIL";
  }

  return {
    graphId: graph.graphId,
    overallVerdict,
    objectiveSatisfied,
    overallScore,
    unresolvedRisks,
    missingOutputs,
    evaluatedAt,
  };
}
