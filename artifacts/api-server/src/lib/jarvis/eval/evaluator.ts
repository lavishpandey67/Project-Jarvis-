import { TaskGraph, TaskGraphNode, DAGExecutionResult, StructuredObservation } from "../dag/types";
import { ScopedContext } from "../types";
import { runCriticGate } from "./criticGate";
import { EvaluationResult, GraphEvaluationResult, EvaluationVerdict } from "./types";

export function evaluateTaskResult(
  node: TaskGraphNode,
  agentOutput: string,
  context: ScopedContext,
  observations?: StructuredObservation[],
): EvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const failureReasons: string[] = [];
  const requiredCorrections: string[] = [];

  const allObservations: StructuredObservation[] = [
    ...(node.observations || []),
    ...(observations || []),
  ];

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

  // 5. Tool Observation Evaluation (Requirement 2, 3, 5)
  let observationScore = 1.0;
  if (allObservations.length > 0) {
    // For evaluating current state in multi-cycle revision loops, evaluate latest observation per unique action/tool/target
    const latestObservationsMap = new Map<string, StructuredObservation>();
    for (const obs of allObservations) {
      const key = `${obs.action}_${obs.tool || ""}`;
      latestObservationsMap.set(key, obs);
    }
    const currentCycleObservations = Array.from(latestObservationsMap.values());

    let failedToolsCount = 0;
    let successfulToolsCount = 0;

    for (const obs of currentCycleObservations) {
      if (!obs.success) {
        failedToolsCount++;
        const failureDetail = obs.stderr || obs.error || obs.status || "Tool execution failed";
        failureReasons.push(
          `Concrete tool execution failed for '${obs.tool || obs.action}' (status: ${obs.status}${obs.exitCode !== undefined ? `, exit code: ${obs.exitCode}` : ""}): ${failureDetail}`
        );
        requiredCorrections.push(`Resolve failure in '${obs.tool || obs.action}': ${failureDetail}`);
      } else {
        successfulToolsCount++;
      }

      if (obs.degraded || obs.status === "UNAVAILABLE") {
        failureReasons.push(`Required provider unavailable: ${obs.error || "Service unavailable"}`);
        requiredCorrections.push("Retry operation when provider service is restored.");
      }
    }

    if (failedToolsCount > 0) {
      observationScore = Math.max(0.0, 1.0 - (failedToolsCount / currentCycleObservations.length));
      groundingScore = Math.min(groundingScore, 0.3);
    } else if (successfulToolsCount > 0) {
      observationScore = 1.0;
      groundingScore = Math.max(groundingScore, 0.95);
      goalScore = Math.max(goalScore, 0.9);
    }
  }

  // 6. Constraint Score
  let constraintScore = 1.0;
  if (criticRes.contradictionsFound.length > 0) {
    constraintScore = Math.max(0.1, 1.0 - criticRes.contradictionsFound.length * 0.3);
  }

  // 7. Confidence Score
  const confidenceScore = node.confidence ?? 0.8;

  // Weighted Overall Score
  const overallScore = Number(
    (
      schemaScore * 0.10 +
      goalScore * 0.20 +
      constraintScore * 0.20 +
      groundingScore * 0.15 +
      criticScore * 0.20 +
      observationScore * 0.15
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
    verdict = failureReasons.some((f) => f.includes("Exceeded") || f.includes("Violates") || f.includes("constraint") || f.includes("Safety Violation"))
      ? "ESCALATE"
      : "FAIL";
  } else if (overallScore >= 0.5) {
    verdict = "PARTIAL";
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
