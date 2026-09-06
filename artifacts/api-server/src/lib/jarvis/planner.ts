import { createDAGFromIntent } from "./dag/planner";
import { TaskGraph } from "./dag/types";
import { IntentAnalysis, JarvisPlan, JarvisTaskNode } from "./types";

export function planFromTaskGraph(taskGraph: TaskGraph, intent: IntentAnalysis): JarvisPlan {
  const planId = `plan_${taskGraph.graphId}`;

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

  const tasks: JarvisTaskNode[] = taskGraph.nodes.map((node) => ({
    taskId: node.taskId,
    objective: node.description,
    description: node.description,
    requiredCapabilities: node.requiredCapabilities,
    assignedAgentRole: node.assignedAgentRole,
    assignedAgentName: node.assignedAgentName,
    expectedOutput: node.expectedOutputs || `Structured execution result addressing: ${node.description}`,
    constraints: node.constraints,
    risk: intent.risk,
    status: node.status === "PENDING" ? "queued" : (node.status.toLowerCase() as any),
  }));

  const roles = Array.from(new Set(taskGraph.nodes.map((n) => n.assignedAgentName)));
  const summary = tasks.length > 0
    ? `Jarvis derived a structured ${tasks.length}-step execution plan delegating across: ${roles.join(", ")}.`
    : "Direct response by Jarvis Brain without workforce delegation.";

  return {
    planId,
    objective: intent.objective,
    directResponsePossible: tasks.length === 0,
    tasks,
    summary,
  };
}

export function createPlan(intent: IntentAnalysis): JarvisPlan {
  const taskGraph = createDAGFromIntent(intent);
  return planFromTaskGraph(taskGraph, intent);
}

