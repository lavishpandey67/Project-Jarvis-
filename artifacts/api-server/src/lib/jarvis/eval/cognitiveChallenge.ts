import {
  CognitiveChallengeReport,
  CognitiveMemoryRecord,
  CognitiveReasoningArtifact,
} from "../memory/types";
export type { CognitiveChallengeReport };

export interface CognitiveChallengeInput {
  userMessage: string;
  intentComplexity: string;
  intentDomain: string;
  proposedPlanSummary?: string;
  knownMemories?: CognitiveMemoryRecord[];
  reasoningArtifact?: CognitiveReasoningArtifact;
}

export class CognitiveChallengeEngine {
  private scoreThreshold = 60; // Score required to trigger cognitive challenge report

  /**
   * Evaluate request for uncertainty, consequence, contradiction, irreversibility, and evidence weakness
   */
  public evaluateChallenge(input: CognitiveChallengeInput): CognitiveChallengeReport {
    const text = (input.userMessage + " " + (input.proposedPlanSummary || "")).toLowerCase();

    // Measurable signals
    let uncertaintyScore = 0;
    let consequenceScore = 0;
    let contradictionScore = 0;
    let irreversibilityScore = 0;
    let evidenceWeaknessScore = 0;

    // 1. Irreversibility Signals (Permanent data loss or irreversible reputation/domain damage)
    if (
      text.includes("delete") ||
      text.includes("drop") ||
      text.includes("overwrite") ||
      text.includes("deploy") ||
      text.includes("release") ||
      text.includes("permanent") ||
      text.includes("destructive") ||
      text.includes("migrate") ||
      text.includes("blast") ||
      text.includes("unverified") ||
      text.includes("blacklist") ||
      text.includes("spam")
    ) {
      irreversibilityScore += 35;
    }

    // 2. Consequence / High Complexity Signals
    if (
      input.intentComplexity === "LEVEL_4" ||
      input.intentComplexity === "LEVEL_5" ||
      text.includes("architecture") ||
      text.includes("database") ||
      text.includes("schema") ||
      text.includes("security") ||
      text.includes("auth") ||
      text.includes("production") ||
      text.includes("cold email") ||
      text.includes("immediately")
    ) {
      consequenceScore += 30;
    }

    // 3. Uncertainty / Vague Assumptions Signals
    if (
      text.includes("maybe") ||
      text.includes("assume") ||
      text.includes("probably") ||
      text.includes("not sure") ||
      text.includes("or something") ||
      text.includes("hopefully")
    ) {
      uncertaintyScore += 25;
    }

    // 4. Contradiction Detection against existing memories
    const contradictionsDetected: string[] = [];
    if (input.knownMemories && input.knownMemories.length > 0) {
      for (const mem of input.knownMemories) {
        if (mem.validity === "CONFLICTED") {
          contradictionScore += 20;
          contradictionsDetected.push(`Existing conflict in memory '${mem.title}': ${mem.content.slice(0, 80)}`);
        }
        if (text.includes("don't") && mem.content.toLowerCase().includes("always")) {
          contradictionScore += 15;
          contradictionsDetected.push(`Potential contradiction with memory '${mem.title}'`);
        }
      }
    }

    // 5. Evidence Weakness Signals
    if (!input.knownMemories || input.knownMemories.length === 0) {
      evidenceWeaknessScore += 15;
    }

    // Calculate total trigger score
    const totalScore = Math.min(
      100,
      uncertaintyScore + consequenceScore + contradictionScore + irreversibilityScore + evidenceWeaknessScore,
    );

    const triggered = totalScore >= this.scoreThreshold;

    // Generate structured challenge artifact
    const assumptionsIdentified: string[] = [];
    const unsupportedClaims: string[] = [];
    const alternativeHypotheses: string[] = [];
    const alternativeStrategies: Array<{ strategy: string; tradeoffs: string; riskLevel: string }> = [];
    const secondOrderConsequences: string[] = [];
    const counterfactualScenarios: Array<{ scenario: string; potentialOutcome: string }> = [];

    if (triggered) {
      if (irreversibilityScore > 0) {
        assumptionsIdentified.push("Assumes target state can be safely overwritten without data loss.");
        secondOrderConsequences.push("Restoration would require external backup recovery if rollback fails.");
        counterfactualScenarios.push({
          scenario: "What if the current environment contains uncommitted production changes?",
          potentialOutcome: "Uncommitted work will be overwritten permanently.",
        });
        alternativeStrategies.push({
          strategy: "Staged / Dry-run Migration with Snapshot Backup",
          tradeoffs: "Takes 1-2 extra verification steps, but prevents data loss.",
          riskLevel: "low",
        });
      }

      if (consequenceScore > 0) {
        assumptionsIdentified.push("Assumes existing architectural abstractions support the proposed schema change.");
        unsupportedClaims.push("No regression test benchmark provided for the new execution path.");
        alternativeHypotheses.push("Hypothesis B: Current bottleneck is database index latency rather than schema design.");
        alternativeStrategies.push({
          strategy: "Modular Additive Extension instead of Core Refactor",
          tradeoffs: "Preserves existing backward compatibility while enabling new capabilities.",
          riskLevel: "medium",
        });
      }

      if (uncertaintyScore > 0 || evidenceWeaknessScore > 0) {
        unsupportedClaims.push("Target system requirements contain implicit unverified constraints.");
        counterfactualScenarios.push({
          scenario: "What if model provider latency spikes during DAG execution?",
          potentialOutcome: "Task node timeouts will trigger critic retry loops.",
        });
      }
    }

    const reversibilityAssessment =
      irreversibilityScore >= 30
        ? "irreversible"
        : consequenceScore >= 25
        ? "partially_reversible"
        : "reversible";

    return {
      triggered,
      score: totalScore,
      rationale: triggered
        ? `Cognitive challenge triggered (Score: ${totalScore}/100) due to high consequence/irreversibility or uncertainty.`
        : `Request evaluated cleanly (Score: ${totalScore}/100). Standard execution path permitted.`,
      assumptionsIdentified,
      unsupportedClaims,
      contradictionsDetected,
      alternativeHypotheses,
      alternativeStrategies,
      secondOrderConsequences,
      counterfactualScenarios,
      reversibilityAssessment,
      confidenceScore: triggered ? 0.85 : 0.95,
      createdAt: new Date().toISOString(),
    };
  }
}
