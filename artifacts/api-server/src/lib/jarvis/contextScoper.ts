import { AgentCapability, ScopedContext } from "./types";

export interface RawWorkspaceData {
  conversationId: number;
  recentMessages: Array<{ role: string; content: string }>;
  memories: Array<{ title: string; content: string; importance: number }>;
  tasks: Array<{ id: number; title: string; status: string }>;
}

export function scopeContextForTask(
  data: RawWorkspaceData,
  capabilities: AgentCapability[] = [],
  maxMessages = 6,
  maxMemories = 5,
): ScopedContext {
  // Filter messages to most recent relevant conversation turns
  const scopedMessages = data.recentMessages.slice(-maxMessages);

  // Filter memories based on importance and keyword matching if capabilities provided
  const sortedMemories = [...data.memories].sort((a, b) => b.importance - a.importance);
  const scopedMemories = sortedMemories.slice(0, maxMemories);

  // Filter active/open tasks
  const activeTasks = data.tasks.filter(
    (t) => t.status === "running" || t.status === "queued" || t.status === "needs_approval",
  );

  return {
    conversationId: data.conversationId,
    recentMessages: scopedMessages,
    relevantMemories: scopedMemories,
    activeTasks,
    agentPermissions: ["READ"],
  };
}
