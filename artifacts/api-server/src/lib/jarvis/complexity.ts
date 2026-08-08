import { CognitiveComplexityLevel, ToolPermissionClass } from "./memory/types";
import { IntentAnalysis } from "./types";

export interface ComplexityConfiguration {
  level: CognitiveComplexityLevel;
  score: number; // 0 to 100
  requiresDAG: boolean;
  requiresDelegation: boolean;
  requiresCriticGate: boolean;
  requiresReasoningArtifact: boolean;
  contextBudget: {
    maxTotalItems: number;
    maxTokensApprox: number;
  };
  maxRevisionCycles: number;
  allowedToolPermissions: ToolPermissionClass[];
  requiresHumanApproval: boolean;
  rationale: string;
}

export function classifyCognitiveComplexity(
  userMessage: string,
  intent?: Partial<IntentAnalysis>,
): ComplexityConfiguration {
  const text = (userMessage || "").trim().toLowerCase();
  let score = 10;
  const reasons: string[] = [];

  // Check direct responses / greetings / instant queries
  const isGreeting = /^(hi|hello|hey|greetings|good morning|good evening|thanks|thank you)\b/i.test(text);
  const isDirectQuestion = text.length < 30 && (text.startsWith("what is") || text.startsWith("who is") || text.startsWith("calculate"));

  if (isGreeting || (isDirectQuestion && (!intent || intent.complexity === "low" || !intent.delegationRequired))) {
    return {
      level: "LEVEL_0",
      score: 5,
      requiresDAG: false,
      requiresDelegation: false,
      requiresCriticGate: false,
      requiresReasoningArtifact: false,
      contextBudget: { maxTotalItems: 3, maxTokensApprox: 500 },
      maxRevisionCycles: 0,
      allowedToolPermissions: ["READ"],
      requiresHumanApproval: false,
      rationale: "Instant / direct user query requiring no DAG or multi-agent delegation.",
    };
  }

  // Domain signals
  if (/\b(research|compare|investigate|benchmark|analyze|study)\b/.test(text)) {
    score += 15;
    reasons.push("Research requirement");
  }
  if (/\b(code|build|implement|architecture|refactor|debug|create app|develop)\b/.test(text)) {
    score += 25;
    reasons.push("Engineering & implementation requirement");
  }
  if (/\b(strategy|roadmap|tradeoff|decision|prioritize|resource allocation|plan)\b/.test(text)) {
    score += 20;
    reasons.push("Strategic reasoning & planning requirement");
  }
  if (/\b(review|audit|critique|security|vulnerability|risk|validate)\b/.test(text)) {
    score += 15;
    reasons.push("Evaluation & audit requirement");
  }
  if (/\b(execute|deploy|delete|migration|modify database|destructive|run command)\b/.test(text)) {
    score += 20;
    reasons.push("Operational tool execution requirement");
  }

  // Length and structure complexity
  if (text.length > 200) {
    score += 10;
    reasons.push("Long form input query");
  }
  if (text.includes("and then") || text.includes("after that") || text.includes("step 1") || text.includes("first,")) {
    score += 15;
    reasons.push("Multi-step request structure");
  }

  // Intent hints
  if (intent) {
    if (intent.complexity === "high") score += 20;
    if (intent.ambiguity === "high") score += 15;
    if (intent.risk === "high") score += 20;
    if (intent.requiredCapabilities && intent.requiredCapabilities.length >= 3) score += 15;
  }

  // High risk or destructive override boost
  if (text.includes("destructive") || text.includes("delete") || intent?.risk === "high" || intent?.reversibility === "irreversible") {
    score += 45;
    reasons.push("High risk or destructive operation signal");
  }

  // Level Assignment
  if (score < 25) {
    return {
      level: "LEVEL_1",
      score,
      requiresDAG: false,
      requiresDelegation: true,
      requiresCriticGate: false,
      requiresReasoningArtifact: false,
      contextBudget: { maxTotalItems: 5, maxTokensApprox: 1000 },
      maxRevisionCycles: 1,
      allowedToolPermissions: ["READ"],
      requiresHumanApproval: false,
      rationale: `Single operation task: ${reasons.join(", ") || "low complexity task"}.`,
    };
  } else if (score < 45) {
    return {
      level: "LEVEL_2",
      score,
      requiresDAG: true,
      requiresDelegation: true,
      requiresCriticGate: false,
      requiresReasoningArtifact: false,
      contextBudget: { maxTotalItems: 8, maxTokensApprox: 2000 },
      maxRevisionCycles: 1,
      allowedToolPermissions: ["READ", "WRITE"],
      requiresHumanApproval: false,
      rationale: `Multi-step linear operation: ${reasons.join(", ")}.`,
    };
  } else if (score < 65) {
    return {
      level: "LEVEL_3",
      score,
      requiresDAG: true,
      requiresDelegation: true,
      requiresCriticGate: true,
      requiresReasoningArtifact: true,
      contextBudget: { maxTotalItems: 12, maxTokensApprox: 3500 },
      maxRevisionCycles: 2,
      allowedToolPermissions: ["READ", "WRITE", "EXECUTE"],
      requiresHumanApproval: false,
      rationale: `Multi-agent coordinated task: ${reasons.join(", ")}.`,
    };
  } else if (score < 85) {
    return {
      level: "LEVEL_4",
      score,
      requiresDAG: true,
      requiresDelegation: true,
      requiresCriticGate: true,
      requiresReasoningArtifact: true,
      contextBudget: { maxTotalItems: 18, maxTokensApprox: 5000 },
      maxRevisionCycles: 3,
      allowedToolPermissions: ["READ", "WRITE", "EXECUTE"],
      requiresHumanApproval: false,
      rationale: `Complex DAG with critic gate and revision loop: ${reasons.join(", ")}.`,
    };
  } else {
    return {
      level: "LEVEL_5",
      score,
      requiresDAG: true,
      requiresDelegation: true,
      requiresCriticGate: true,
      requiresReasoningArtifact: true,
      contextBudget: { maxTotalItems: 25, maxTokensApprox: 8000 },
      maxRevisionCycles: 4,
      allowedToolPermissions: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"],
      requiresHumanApproval: text.includes("destructive") || text.includes("delete") || (intent?.risk === "high" && intent?.reversibility === "irreversible"),
      rationale: `Strategic open-ended problem requiring deep deliberation: ${reasons.join(", ")}.`,
    };
  }
}
