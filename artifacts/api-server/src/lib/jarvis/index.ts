import { dispatchToAgent } from "./agentDispatcher";
import { scopeContextForTask } from "./contextScoper";
import { createDAGFromIntent } from "./dag/planner";
import { executeTaskGraph } from "./dag/runner";
import { DAGExecutionResult, TaskGraph } from "./dag/types";
import { evaluateGraphObjective } from "./eval/evaluator";
import { GraphEvaluationResult } from "./eval/types";
import { CognitiveChallengeEngine } from "./eval/cognitiveChallenge";
import { CognitiveChallengeReport } from "./memory/types";
import { analyzeIntent, ModelCaller } from "./intentAnalyzer";
import { createPlan } from "./planner";
import { FIVE_AGENT_WORKFORCE, getAllAgentContracts, getAgentByName, getAgentByRole } from "./registry";
import { synthesizeResults } from "./synthesizer";
import {
  AgentContract,
  IntentAnalysis,
  JarvisPlan,
  JarvisSynthesis,
  ScopedContext,
  StructuredAgentResponse,
} from "./types";

export * from "./types";
export * from "./registry";
export * from "./intentAnalyzer";
export * from "./complexity";
export * from "./tools/registry";
export * from "./contextScoper";
export * from "./planner";
export * from "./agentDispatcher";
export * from "./synthesizer";
export * from "./dag/types";
export * from "./dag/validator";
export * from "./dag/runner";
export * from "./dag/planner";
export * from "./eval/types";
export * from "./eval/evaluator";
export * from "./eval/criticGate";
export * from "./memory/types";
export * from "./memory/embedding";
export * from "./memory/scorer";
export * from "./memory/store";
export * from "./memory/contextEngine";
export * from "./memory/cognitiveState";

export * from "./recoveryController";
export * from "./eval/cognitiveChallenge";
export * from "./memory/patternTracker";
export * from "./pythonBridge/client";

export interface JarvisExecutionResult {
  intent: IntentAnalysis;
  plan: JarvisPlan;
  taskGraph?: TaskGraph;
  dagResult?: DAGExecutionResult;
  graphEvaluation?: GraphEvaluationResult;
  cognitiveChallenge?: CognitiveChallengeReport;
  agentResponses: StructuredAgentResponse[];
  synthesis: JarvisSynthesis;
  context: ScopedContext;
  delegatedAgent?: AgentContract;
}

export async function processWithJarvisBrain(
  userMessage: string,
  rawWorkspaceData: {
    conversationId: number;
    projectId?: string;
    recentMessages: Array<{ role: string; content: string }>;
    memories: Array<{ title: string; content: string; importance: number }>;
    tasks: Array<{ id: number; title: string; status: string }>;
  },
  callModelFn?: ModelCaller,
): Promise<JarvisExecutionResult> {
  // Step 1: Scope Context
  const scopedContext = scopeContextForTask(rawWorkspaceData);

  // Step 2: Intent Analysis & Complexity Classification
  const intent = await analyzeIntent(userMessage, scopedContext, callModelFn);

  // Step 3: Cognitive Challenge Engine Evaluation
  const challengeEngine = new CognitiveChallengeEngine();
  const cognitiveChallenge = challengeEngine.evaluateChallenge({
    userMessage,
    intentComplexity: intent.complexity,
    intentDomain: intent.domain,
    proposedPlanSummary: intent.objective,
  });

  // Step 4: Create Plan & DAG Graph
  const plan = createPlan(intent);
  const taskGraph = createDAGFromIntent(intent);

  // Step 5: Execute DAG Graph via Task Engine
  let dagResult: DAGExecutionResult | undefined;
  let graphEvaluation: GraphEvaluationResult | undefined;
  const agentResponses: StructuredAgentResponse[] = [];
  let delegatedAgent: AgentContract | undefined;

  if (taskGraph.nodes.length > 0) {
    dagResult = await executeTaskGraph(taskGraph, scopedContext, { callModelFn });
    graphEvaluation = evaluateGraphObjective(taskGraph, dagResult, scopedContext);

    for (const node of dagResult.graph.nodes) {
      if (node.result) {
        agentResponses.push({
          taskId: node.taskId,
          agentRole: node.assignedAgentRole,
          agentName: node.assignedAgentName,
          status: node.status === "SUCCESS" ? "success" : node.status === "PARTIAL" ? "partial" : "failed",
          result: node.result,
          confidence: node.confidence ?? 0.8,
          evidence: ["DAG Node execution trace"],
          warnings: node.error ? [node.error] : [],
          errors: node.error ? [node.error] : [],
        });
      }
      if (!delegatedAgent) {
        delegatedAgent = getAgentByRole(node.assignedAgentRole);
      }
    }
  }

  // Step 6: Synthesize Results
  const synthesis = await synthesizeResults(intent, plan, agentResponses, callModelFn);

  // If cognitive challenge was triggered, annotate synthesis constructively
  if (cognitiveChallenge.triggered) {
    synthesis.summary += ` [Cognitive Challenge Note: ${cognitiveChallenge.rationale}]`;
  }

  // If graph evaluation indicated failure/escalation, annotate synthesis safely
  if (graphEvaluation && (graphEvaluation.overallVerdict === "FAIL" || graphEvaluation.overallVerdict === "ESCALATE")) {
    synthesis.summary += ` [Jarvis Evaluator Note: Objective encountered unresolved risks/failures during task execution. ${graphEvaluation.unresolvedRisks.join("; ")}]`;
  }

  return {
    intent,
    plan,
    taskGraph,
    dagResult,
    graphEvaluation,
    cognitiveChallenge,
    agentResponses,
    synthesis,
    context: scopedContext,
    delegatedAgent,
  };
}

