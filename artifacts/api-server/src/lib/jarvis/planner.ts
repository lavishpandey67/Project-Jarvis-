import { findBestAgentForCapabilities, getAgentByRole } from "./registry";
import { IntentAnalysis, JarvisPlan, JarvisTaskNode } from "./types";

export function createPlan(intent: IntentAnalysis): JarvisPlan {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (intent.directResponsePossible && !intent.delegationRequired) {
    return {
      planId,
      objective: intent.objective,
      directResponsePossible: true,
      directAnswer: intent.directAnswer,
      tasks: [],
      summary: "Direct response by Jarvis Brain without workforce delegation.",
    };
  }

  // Capability matching to determine assigned agent
  const matchedAgent = findBestAgentForCapabilities(intent.requiredCapabilities);

  const primaryTaskNode: JarvisTaskNode = {
    taskId: `task_${Date.now()}_1`,
    objective: intent.objective,
    description: `Execute delegated work for objective: ${intent.objective}`,
    requiredCapabilities: intent.requiredCapabilities,
    assignedAgentRole: matchedAgent.role,
    assignedAgentName: matchedAgent.name,
    expectedOutput: `Structured execution result addressing: ${intent.objective}`,
    constraints: [
      "Operate strictly within declared agent permissions.",
      "Identify explicit assumptions and limitations.",
      "Return structured response with confidence and evidence.",
    ],
    risk: intent.risk,
    status: "queued",
  };

  return {
    planId,
    objective: intent.objective,
    directResponsePossible: false,
    tasks: [primaryTaskNode],
    summary: `Jarvis created a structured 1-step plan delegating to ${matchedAgent.name}.`,
  };
}
