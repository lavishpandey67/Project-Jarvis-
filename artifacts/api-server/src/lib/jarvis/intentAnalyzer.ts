import { AgentCapability, IntentAnalysis, ScopedContext } from "./types";
import { classifyCognitiveComplexity } from "./complexity";

export interface ModelCaller {
  (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, jsonMode?: boolean): Promise<string>;
}

function parseJsonHelper<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw;
  return JSON.parse(match);
}

export function fallbackIntentAnalysis(userMessage: string): IntentAnalysis {
  const lower = userMessage.toLowerCase();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let domain = "general";
  let requiredCapabilities: AgentCapability[] = [];
  let delegationRequired = false;
  let complexity: "low" | "medium" | "high" = "low";

  let primaryDomainSet = false;

  if (/\b(research|find|compare|source|investigate|market|statistics|report|data)\b/.test(lower)) {
    if (!primaryDomainSet) { domain = "research"; primaryDomainSet = true; }
    requiredCapabilities.push("research", "evidence_extraction", "factual_grounding");
    delegationRequired = true;
  }
  if (/\b(strategy|roadmap|plan|prioritize|tradeoff|resource|goal|decision)\b/.test(lower)) {
    if (!primaryDomainSet) { domain = "strategy"; primaryDomainSet = true; }
    requiredCapabilities.push("planning", "prioritization", "decision_analysis");
    delegationRequired = true;
  }
  if (/\b(code|build|implement|refactor|function|script|bug|fix|create|component|dev)\b/.test(lower)) {
    if (!primaryDomainSet) { domain = "engineering"; primaryDomainSet = true; }
    requiredCapabilities.push("code_generation", "implementation", "debugging");
    delegationRequired = true;
    complexity = "medium";
  }
  if (/\b(critique|review|audit|test|validate|risk|flaw|gaps|eval)\b/.test(lower)) {
    if (!primaryDomainSet) { domain = "review"; primaryDomainSet = true; }
    requiredCapabilities.push("evaluation", "risk_analysis", "contradiction_detection");
    delegationRequired = true;
  }
  if (/\b(execute|run|deploy|operation|perform|workspace|action)\b/.test(lower)) {
    if (!primaryDomainSet) { domain = "operations"; primaryDomainSet = true; }
    requiredCapabilities.push("approved_tool_execution", "workspace_operations");
    delegationRequired = true;
  }

  const baseIntentPartial = {
    domain,
    complexity,
    delegationRequired,
    requiredCapabilities,
  };
  const complexityConfig = classifyCognitiveComplexity(userMessage, baseIntentPartial);

  return {
    requestId,
    objective: userMessage.trim(),
    domain,
    complexity: complexityConfig.level === "LEVEL_0" || complexityConfig.level === "LEVEL_1" ? "low" : (complexityConfig.level === "LEVEL_2" || complexityConfig.level === "LEVEL_3" ? "medium" : "high"),
    complexityConfig,
    ambiguity: lower.length < 15 ? "high" : "low",
    requiredCapabilities,
    externalImpact: false,
    reversibility: "reversible",
    risk: "low",
    delegationRequired: complexityConfig.requiresDelegation,
    directResponsePossible: !complexityConfig.requiresDelegation,
    directAnswer: !complexityConfig.requiresDelegation
      ? `Jarvis Brain Direct Response: ${userMessage}`
      : undefined,
    confidence: 0.8,
  };
}

export async function analyzeIntent(
  userMessage: string,
  context: ScopedContext,
  callModelFn?: ModelCaller,
): Promise<IntentAnalysis> {
  if (!callModelFn) {
    return fallbackIntentAnalysis(userMessage);
  }

  const systemPrompt = `You are the Jarvis Brain Intent Analyzer.
Analyze the user request and return a valid JSON object ONLY with the following schema:
{
  "objective": "Clear string statement of primary user goal",
  "domain": "general" | "research" | "strategy" | "engineering" | "review" | "operations",
  "complexity": "low" | "medium" | "high",
  "ambiguity": "low" | "medium" | "high",
  "requiredCapabilities": array of capability strings from: ["research", "evidence_extraction", "document_analysis", "planning", "prioritization", "decision_analysis", "code_generation", "implementation", "debugging", "evaluation", "risk_analysis", "approved_tool_execution", "workspace_operations"],
  "externalImpact": boolean,
  "reversibility": "reversible" | "irreversible",
  "risk": "low" | "medium" | "high",
  "delegationRequired": boolean,
  "directResponsePossible": boolean,
  "directAnswer": string or null (if directResponsePossible is true, provide the direct answer here; otherwise null),
  "confidence": number between 0.0 and 1.0
}
Rules:
- Simple greetings, casual questions, and direct queries should have "delegationRequired": false and "directResponsePossible": true.
- Complex research, strategic planning, code building, adversarial reviews, and operational execution require "delegationRequired": true.
- Do NOT output extra text or markdown outside JSON.`;

  try {
    const rawResponse = await callModelFn(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User Request: ${userMessage}` },
      ],
      true,
    );
    const parsed = parseJsonHelper<any>(rawResponse);

    const partialIntent = {
      domain: parsed.domain || "general",
      complexity: parsed.complexity || "low",
      ambiguity: parsed.ambiguity || "low",
      risk: parsed.risk || "low",
      delegationRequired: Boolean(parsed.delegationRequired),
      requiredCapabilities: Array.isArray(parsed.requiredCapabilities) ? parsed.requiredCapabilities : [],
    };
    const complexityConfig = classifyCognitiveComplexity(userMessage, partialIntent);

    return {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      objective: parsed.objective || userMessage.trim(),
      domain: parsed.domain || "general",
      complexity: parsed.complexity || "low",
      complexityConfig,
      ambiguity: parsed.ambiguity || "low",
      requiredCapabilities: Array.isArray(parsed.requiredCapabilities) ? parsed.requiredCapabilities : [],
      externalImpact: Boolean(parsed.externalImpact),
      reversibility: parsed.reversibility === "irreversible" ? "irreversible" : "reversible",
      risk: parsed.risk || "low",
      delegationRequired: complexityConfig.requiresDelegation,
      directResponsePossible: !complexityConfig.requiresDelegation,
      directAnswer: parsed.directAnswer || undefined,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
    };
  } catch (err) {
    return fallbackIntentAnalysis(userMessage);
  }
}
