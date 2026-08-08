import { AgentContract, AgentCapability } from "./types";
import { TaskRoleProfile, ToolPermissionClass } from "./memory/types";

export const FIVE_AGENT_WORKFORCE: AgentContract[] = [
  {
    id: "agent_research",
    name: "Research Agent",
    role: "research",
    description:
      "Finds, compares, and synthesizes structured information, source-aware evidence, and document analyses.",
    capabilities: [
      "research",
      "evidence_extraction",
      "document_analysis",
      "source_analysis",
      "factual_grounding",
    ],
    permissions: ["READ"],
    status: "active",
    version: "1.0.0",
  },
  {
    id: "agent_strategy",
    name: "Strategy Agent",
    role: "strategy",
    description:
      "Provides strategic reasoning, task prioritization, decision frameworks, resource allocation, and trade-off analyses.",
    capabilities: [
      "planning",
      "prioritization",
      "decision_analysis",
      "tradeoff_analysis",
      "resource_allocation",
    ],
    permissions: ["READ"],
    status: "active",
    version: "1.0.0",
  },
  {
    id: "agent_builder",
    name: "Builder Agent",
    role: "builder",
    description:
      "Turns clear objectives into executable code, architecture drafts, technical implementations, and refactoring plans.",
    capabilities: [
      "code_generation",
      "implementation",
      "refactoring",
      "testing",
      "debugging",
      "technical_artifact_creation",
    ],
    permissions: ["READ", "WRITE"],
    status: "active",
    version: "1.0.0",
  },
  {
    id: "agent_critic",
    name: "Critic Agent",
    role: "critic",
    description:
      "Stress-tests proposals, detects contradictions, identifies failure modes, and evaluates alignment with requirements.",
    capabilities: [
      "evaluation",
      "contradiction_detection",
      "risk_analysis",
      "validation",
      "adversarial_review",
    ],
    permissions: ["READ"],
    status: "active",
    version: "1.0.0",
  },
  {
    id: "agent_executor",
    name: "Executor Agent",
    role: "executor",
    description:
      "Executes approved operational tasks, manipulates workspace artifacts, and manages system state within granted permissions.",
    capabilities: [
      "approved_tool_execution",
      "workspace_operations",
      "operational_actions",
    ],
    permissions: ["READ", "WRITE", "EXECUTE"],
    status: "active",
    version: "1.0.0",
  },
];

export const ADAPTIVE_GENERALIST_AGENTS: AgentContract[] = [
  {
    id: "agent_generalist_a",
    name: "Adaptive Generalist Alpha",
    role: "generalist_a",
    description:
      "Flexible cognitive worker that dynamically constructs temporary capability profiles for specialized tasks.",
    capabilities: ["research", "planning", "code_generation", "evaluation", "approved_tool_execution"],
    permissions: ["READ", "WRITE", "EXECUTE"],
    status: "active",
    version: "1.0.0",
  },
  {
    id: "agent_generalist_b",
    name: "Adaptive Generalist Beta",
    role: "generalist_b",
    description:
      "Flexible cognitive worker that dynamically constructs temporary capability profiles for investigation, data, and operations.",
    capabilities: ["document_analysis", "decision_analysis", "debugging", "risk_analysis", "workspace_operations"],
    permissions: ["READ", "WRITE", "EXECUTE"],
    status: "active",
    version: "1.0.0",
  },
];

export const ALL_WORKFORCE_AGENTS: AgentContract[] = [
  ...FIVE_AGENT_WORKFORCE,
  ...ADAPTIVE_GENERALIST_AGENTS,
];

// In-memory active temporary role profiles for generalists
const activeRoleProfiles: Map<string, TaskRoleProfile> = new Map();

/**
 * Assign a temporary task profile to an adaptive generalist
 */
export function assignAdaptiveTaskProfile(
  agentId: "agent_generalist_a" | "agent_generalist_b",
  temporaryRoleName: string,
  capabilities: AgentCapability[],
  authorizedToolIds: string[],
  permissionBoundary: ToolPermissionClass[],
  durationMinutes: number = 30,
): TaskRoleProfile {
  const profileId = `profile_${agentId}_${Date.now()}`;
  const now = new Date();
  const expiryTime = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

  const profile: TaskRoleProfile = {
    profileId,
    agentId,
    temporaryRoleName,
    description: `Temporary profile '${temporaryRoleName}' assigned to ${agentId}`,
    capabilities,
    authorizedToolIds,
    permissionBoundary,
    expiryTime,
    createdAt: now.toISOString(),
  };

  activeRoleProfiles.set(agentId, profile);
  return profile;
}

/**
 * Get active task profile for an adaptive generalist if not expired
 */
export function getActiveTaskProfile(agentId: string): TaskRoleProfile | null {
  const profile = activeRoleProfiles.get(agentId);
  if (!profile) return null;

  if (new Date(profile.expiryTime).getTime() < Date.now()) {
    activeRoleProfiles.delete(agentId);
    return null; // Expired
  }

  return profile;
}

/**
 * Clear expired or completed task profiles
 */
export function clearAdaptiveTaskProfile(agentId: string): void {
  activeRoleProfiles.delete(agentId);
}

export function getAgentByRole(role: string): AgentContract | undefined {
  return ALL_WORKFORCE_AGENTS.find((agent) => agent.role === role);
}

export function getAgentByName(name: string): AgentContract | undefined {
  return ALL_WORKFORCE_AGENTS.find((agent) => agent.name.toLowerCase() === name.toLowerCase());
}

export function findBestAgentForCapabilities(requiredCapabilities: AgentCapability[]): AgentContract {
  if (requiredCapabilities.length === 0) {
    return FIVE_AGENT_WORKFORCE[0]; // default to research
  }

  let bestMatch = ALL_WORKFORCE_AGENTS[0];
  let highestScore = -1;

  for (const agent of ALL_WORKFORCE_AGENTS) {
    if (agent.status !== "active") continue;

    // Check if generalist has active profile capabilities
    const activeProfile = getActiveTaskProfile(agent.id);
    const activeCapabilities = activeProfile ? activeProfile.capabilities : agent.capabilities;

    let score = 0;
    for (const cap of requiredCapabilities) {
      if (activeCapabilities.includes(cap)) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = agent;
    }
  }

  return bestMatch;
}

export function getAllAgentContracts(): AgentContract[] {
  return ALL_WORKFORCE_AGENTS;
}

