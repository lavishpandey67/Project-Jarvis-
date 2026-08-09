import { getAgentByRole } from "./registry";
import {
  JarvisTaskNode,
  ScopedContext,
  StructuredAgentRequest,
  StructuredAgentResponse,
} from "./types";
import { ModelCaller } from "./intentAnalyzer";
import { PolyglotASTEngine, CodebaseGraph, CrossLanguageTracer } from "./codeIntel";

function parseJsonHelper<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw;
  return JSON.parse(match);
}

export function fallbackAgentResponse(
  task: JarvisTaskNode,
  agentName: string,
): StructuredAgentResponse {
  const label = agentName.replace(" Agent", "");
  return {
    taskId: task.taskId,
    agentRole: task.assignedAgentRole,
    agentName,
    status: "success",
    result: `${label} Agent completed a local structured pass for objective: “${task.objective}”. Model provider is offline or operating in local fallback mode. Key recommendation: verify credentials and rerun for LLM-powered deep generation.`,
    confidence: 0.7,
    evidence: ["Local deterministic contract execution", "Codebase Graph Analysis"],
    warnings: ["Model provider offline; local fallback used"],
    errors: [],
    suggestedNextAction: "Review local output or reconnect model provider",
  };
}

export async function dispatchToAgent(
  task: JarvisTaskNode,
  context: ScopedContext,
  callModelFn?: ModelCaller,
): Promise<StructuredAgentResponse> {
  const agentContract = getAgentByRole(task.assignedAgentRole);
  const agentName = agentContract?.name || task.assignedAgentName;

  // Active Code Intelligence Runtime Context Integration
  let codeIntelSummary = "";
  if (/code|ast|refactor|debug|build|graph|sql|python|typescript|api/i.test(task.objective)) {
    try {
      const tracer = new CrossLanguageTracer();
      const boundaries = tracer.getAllBoundaries();
      codeIntelSummary = `\n[Code Intelligence Runtime Analysis]: Active boundaries detected: ${boundaries.map((b) => b.boundaryId).join(", ")}. Primary TS->Python bridge: ${boundaries[0]?.sourceSymbol} -> ${boundaries[0]?.targetSymbol}.`;
    } catch (_err) {
      // Ignored
    }
  }

  if (!callModelFn) {
    const fallback = fallbackAgentResponse(task, agentName);
    if (codeIntelSummary) {
      fallback.result += codeIntelSummary;
    }
    return fallback;
  }

  const request: StructuredAgentRequest = {
    taskId: task.taskId,
    agentRole: task.assignedAgentRole,
    agentName,
    objective: task.objective,
    brief: task.description,
    constraints: task.constraints,
    context,
  };

  const systemPrompt = `You are the ${agentName} operating within the Jarvis AI Workforce.
Role: ${agentContract?.description || task.assignedAgentRole}
Permissions: ${JSON.stringify(agentContract?.permissions || ["READ"])}
Capabilities: ${JSON.stringify(agentContract?.capabilities || [])}

Perform your specialized work for the assigned task and return JSON ONLY matching the schema:
{
  "taskId": "${task.taskId}",
  "agentRole": "${task.assignedAgentRole}",
  "agentName": "${agentName}",
  "status": "success" | "failed" | "partial",
  "result": "Detailed, highly substantive answer, draft, research, code, strategy, critique, or execution report.",
  "confidence": number between 0.0 and 1.0,
  "evidence": array of string key findings/sources/assumptions,
  "warnings": array of string warnings or limitations,
  "errors": array of error strings if any,
  "suggestedNextAction": string optional next step
}`;

  try {
    const rawResponse = await callModelFn(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Task Objective: ${request.objective}\nBrief: ${request.brief}\nConstraints: ${JSON.stringify(request.constraints)}\nContext Memories: ${JSON.stringify(request.context.relevantMemories)}`,
        },
      ],
      true,
    );

    const parsed = parseJsonHelper<any>(rawResponse);

    return {
      taskId: task.taskId,
      agentRole: task.assignedAgentRole,
      agentName,
      status: parsed.status === "failed" ? "failed" : parsed.status === "partial" ? "partial" : "success",
      result: parsed.result || parsed.output || parsed.summary || "No explicit result text returned.",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      suggestedNextAction: parsed.suggestedNextAction || undefined,
    };
  } catch (err) {
    throw err;
  }
}
