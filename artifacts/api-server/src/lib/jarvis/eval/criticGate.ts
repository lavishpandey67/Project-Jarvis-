import { TaskGraphNode } from "../dag/types";
import { ScopedContext } from "../types";

export interface CriticGateResult {
  criticScore: number;
  contradictionsFound: string[];
  failureReasons: string[];
  suggestedCorrections: string[];
  passed: boolean;
}

export function runCriticGate(
  node: TaskGraphNode,
  agentOutput: string,
  context: ScopedContext,
): CriticGateResult {
  const contradictionsFound: string[] = [];
  const failureReasons: string[] = [];
  const suggestedCorrections: string[] = [];

  if (!agentOutput || agentOutput.trim().length === 0) {
    failureReasons.push("Output is completely empty.");
    suggestedCorrections.push("Provide a non-empty, substantive response.");
    return {
      criticScore: 0.0,
      contradictionsFound,
      failureReasons,
      suggestedCorrections,
      passed: false,
    };
  }

  const lower = agentOutput.toLowerCase();

  // Check for explicit error flags or incomplete stubs
  if (lower.includes("[error]") || lower.includes("failed to generate") || lower.includes("todo: implement")) {
    failureReasons.push("Output contains explicit error or placeholder markers.");
    suggestedCorrections.push("Replace placeholder or error markers with actual verified content.");
  }

  // Check constraint compliance
  for (const constraint of node.constraints) {
    const cLower = constraint.toLowerCase();
    if (cLower.includes("type safety") || cLower.includes("strict type")) {
      const hasProperTypes = /\b(interface|type)\s+[A-Z]\w*/i.test(agentOutput) || /:\s*(string|number|boolean|any|void|[A-Z]\w*)/.test(agentOutput);
      if (!hasProperTypes) {
        contradictionsFound.push(`Violates constraint '${constraint}': code lacks explicit TypeScript type annotations/interfaces.`);
        suggestedCorrections.push("Add explicit TypeScript type annotations/interfaces.");
      }
    }
    if (cLower.includes("factual") || cLower.includes("source")) {
      if (!lower.includes("http") && !lower.includes("source") && !lower.includes("according to") && !lower.includes("evidence") && !lower.includes("data")) {
        contradictionsFound.push(`Violates constraint '${constraint}': lacks explicit evidence or source attribution.`);
        suggestedCorrections.push("Include explicit evidence or source attributions.");
      }
    }
  }

  // Role-specific critic heuristics
  if (node.assignedAgentRole === "research") {
    if (agentOutput.length < 50) {
      failureReasons.push("Research output is excessively brief and lacks depth.");
      suggestedCorrections.push("Expand factual findings with detailed citations or data points.");
    }
  } else if (node.assignedAgentRole === "strategy") {
    if (!lower.includes("recommendation") && !lower.includes("trade") && !lower.includes("plan") && !lower.includes("risk") && !lower.includes("priority")) {
      failureReasons.push("Strategy output lacks trade-off analysis or actionable roadmap.");
      suggestedCorrections.push("Include explicit trade-offs and prioritized action steps.");
    }
  } else if (node.assignedAgentRole === "builder") {
    if (!lower.includes("code") && !lower.includes("function") && !lower.includes("class") && !lower.includes("interface") && !lower.includes("import") && !lower.includes("const")) {
      failureReasons.push("Builder output does not contain structured technical code or interface definitions.");
      suggestedCorrections.push("Provide explicit technical code implementation.");
    }
  }

  const totalIssues = contradictionsFound.length + failureReasons.length;
  let criticScore = 1.0;
  if (totalIssues > 0) {
    criticScore = Math.max(0.1, 1.0 - totalIssues * 0.25);
  }

  return {
    criticScore,
    contradictionsFound,
    failureReasons,
    suggestedCorrections,
    passed: totalIssues === 0,
  };
}
