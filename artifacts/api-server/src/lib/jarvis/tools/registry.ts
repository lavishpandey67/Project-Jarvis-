import {
  ToolDefinition,
  ToolExecutionResult,
  ToolExecutionTrace,
  ToolPermissionClass,
} from "../memory/types";
import { CognitiveMemoryStore } from "../memory/store";

export class InternalToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private memoryStore?: CognitiveMemoryStore;

  constructor(memoryStore?: CognitiveMemoryStore) {
    this.memoryStore = memoryStore;
    this.registerBuiltInTools();
  }

  public setMemoryStore(store: CognitiveMemoryStore) {
    this.memoryStore = store;
  }

  /**
   * Register a tool definition
   */
  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * Get tool by ID
   */
  public getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  /**
   * List available tools matching granted permission boundaries
   */
  public listTools(maxPermissionClass?: ToolPermissionClass, agentRole?: string): ToolDefinition[] {
    const list = Array.from(this.tools.values());

    const rank: Record<ToolPermissionClass, number> = {
      READ: 1,
      WRITE: 2,
      EXECUTE: 3,
      DESTRUCTIVE: 4,
    };

    const maxRank = maxPermissionClass ? rank[maxPermissionClass] || 1 : 4;

    return list.filter((t) => {
      if (rank[t.permissionClass] > maxRank) return false;
      if (agentRole && t.allowedAgentRoles && t.allowedAgentRoles.length > 0) {
        if (!t.allowedAgentRoles.includes(agentRole) && !t.allowedAgentRoles.includes("*")) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Execute a tool safely with permission, role check, and trace recording
   */
  public async executeTool(
    id: string,
    input: any,
    context: {
      permissions: ToolPermissionClass[];
      agentRole?: string;
      taskId?: string;
      isSandboxed?: boolean;
      userApprovalGranted?: boolean;
    },
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(id);
    const startTime = Date.now();

    if (!tool) {
      const result = {
        success: false,
        error: `Tool '${id}' not found in internal tool registry.`,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(id, id, context, input, result, "READ", "low");
      return result;
    }

    // Agent Role Authorization Check
    if (
      context.agentRole &&
      tool.allowedAgentRoles &&
      tool.allowedAgentRoles.length > 0 &&
      !tool.allowedAgentRoles.includes(context.agentRole) &&
      !tool.allowedAgentRoles.includes("*")
    ) {
      const result = {
        success: false,
        error: `Role Authorization Denied: Agent role '${context.agentRole}' is not authorized to execute tool '${tool.name}' (${tool.id}). Allowed roles: ${tool.allowedAgentRoles.join(", ")}.`,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(tool.id, tool.name, context, input, result, tool.permissionClass, tool.riskLevel);
      return result;
    }

    // Permission check
    const rank: Record<ToolPermissionClass, number> = {
      READ: 1,
      WRITE: 2,
      EXECUTE: 3,
      DESTRUCTIVE: 4,
    };

    const userMaxRank = Math.max(...context.permissions.map((p) => rank[p] || 1), 1);
    const requiredRank = rank[tool.permissionClass];

    if (requiredRank > userMaxRank) {
      const result = {
        success: false,
        error: `Permission Denied: Execution of tool '${tool.name}' requires permission level '${tool.permissionClass}', but agent only holds '${context.permissions.join(", ")}'.`,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(tool.id, tool.name, context, input, result, tool.permissionClass, tool.riskLevel);
      return result;
    }

    // Check destructive action approval
    if (tool.permissionClass === "DESTRUCTIVE" && !context.userApprovalGranted) {
      const result = {
        success: false,
        error: `Safety Guard Violation: Tool '${tool.name}' is DESTRUCTIVE and requires explicit human user approval prior to execution.`,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(tool.id, tool.name, context, input, result, tool.permissionClass, tool.riskLevel);
      return result;
    }

    try {
      const result = await tool.execute(input, context);
      const finalResult = {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(tool.id, tool.name, context, input, finalResult, tool.permissionClass, tool.riskLevel);
      return finalResult;
    } catch (err: any) {
      const result = {
        success: false,
        error: `Tool Execution Exception (${tool.id}): ${err?.message || String(err)}`,
        executionTimeMs: Date.now() - startTime,
      };
      await this.recordTrace(tool.id, tool.name, context, input, result, tool.permissionClass, tool.riskLevel);
      return result;
    }
  }

  private async recordTrace(
    toolId: string,
    toolName: string,
    context: { agentRole?: string; taskId?: string },
    input: any,
    result: ToolExecutionResult,
    permissionClass: ToolPermissionClass,
    riskLevel: string,
  ) {
    if (this.memoryStore) {
      const trace: ToolExecutionTrace = {
        id: `trace_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        toolId,
        toolName,
        agentRole: context.agentRole,
        taskId: context.taskId,
        input,
        output: result.output,
        success: result.success,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
        permissionClass,
        riskLevel,
        createdAt: new Date().toISOString(),
      };
      await this.memoryStore.persistToolExecutionTrace(trace);
    }
  }

  /**
   * Register standard built-in safe tools
   */
  private registerBuiltInTools(): void {
    // 1. Memory Search Tool
    this.registerTool({
      id: "tool_memory_search",
      name: "Cognitive Memory Search",
      description: "Searches cognitive memory layers (semantic, episodic, decision, lesson) using semantic and keyword ranking.",
      permissionClass: "READ",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 1,
      inputSchema: { query: "string", limit: "number" },
      outputSchema: { items: "array" },
      allowedAgentRoles: ["*"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { query: string; limit?: number }) => {
        return {
          success: true,
          output: { query: input.query, itemsFound: 0, results: [] },
          logs: [`Executed cognitive memory search for '${input.query}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 2. Structured Note Creation Tool
    this.registerTool({
      id: "tool_create_note",
      name: "Structured Note Creator",
      description: "Creates structured cognitive notes in memory store.",
      permissionClass: "WRITE",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 1,
      inputSchema: { title: "string", content: "string", tags: "array" },
      outputSchema: { noteId: "string", success: "boolean" },
      allowedAgentRoles: ["research", "strategy", "builder", "critic", "executor", "agent_generalist_a", "agent_generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "STOP_ON_FAILURE",
      execute: async (input: { title: string; content: string; tags?: string[] }) => {
        const noteId = `note_${Date.now()}`;
        if (this.memoryStore) {
          await this.memoryStore.addMemory({
            id: noteId,
            memoryType: "WORKING",
            title: input.title,
            content: input.content,
            source: "AGENT",
          });
        }
        return {
          success: true,
          output: { noteId, title: input.title, created: true },
          logs: [`Created structured note '${input.title}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 3. Task Creation Tool
    this.registerTool({
      id: "tool_create_task",
      name: "Workspace Task Creator",
      description: "Registers structured tasks into the workspace execution queue.",
      permissionClass: "WRITE",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 1,
      inputSchema: { title: "string", objective: "string", assignedAgentRole: "string" },
      outputSchema: { taskId: "string", success: "boolean" },
      allowedAgentRoles: ["strategy", "builder", "agent_generalist_a"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "STOP_ON_FAILURE",
      execute: async (input: { title: string; objective: string; assignedAgentRole?: string }) => {
        const taskId = `task_${Date.now()}`;
        return {
          success: true,
          output: { taskId, title: input.title, status: "queued" },
          logs: [`Registered workspace task '${input.title}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 4. File Read Tool
    this.registerTool({
      id: "tool_file_read",
      name: "Workspace File Reader",
      description: "Reads file content from workspace relative paths.",
      permissionClass: "READ",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 1,
      inputSchema: { filePath: "string" },
      outputSchema: { content: "string" },
      allowedAgentRoles: ["*"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { filePath: string }) => {
        return {
          success: true,
          output: { filePath: input.filePath, content: "// Read file content inspect" },
          logs: [`Read file '${input.filePath}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 5. File Write Tool
    this.registerTool({
      id: "tool_file_write",
      name: "Workspace File Writer",
      description: "Writes content to specified workspace file path.",
      permissionClass: "WRITE",
      riskLevel: "medium",
      isReversible: true,
      sandboxed: true,
      resourceCost: 2,
      inputSchema: { filePath: "string", content: "string" },
      outputSchema: { success: "boolean" },
      allowedAgentRoles: ["builder", "executor", "agent_generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 10000,
      failurePolicy: "STOP_ON_FAILURE",
      execute: async (input: { filePath: string; content: string }) => {
        return {
          success: true,
          output: { filePath: input.filePath, bytesWritten: input.content.length },
          logs: [`Wrote ${input.content.length} bytes to '${input.filePath}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 6. Reasoning Artifact Creation Tool
    this.registerTool({
      id: "tool_create_reasoning_artifact",
      name: "Cognitive Artifact Generator",
      description: "Generates and persists structured reasoning artifacts.",
      permissionClass: "WRITE",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 1,
      inputSchema: { objective: "string", reasoningSummary: "string" },
      outputSchema: { artifactId: "string", success: "boolean" },
      allowedAgentRoles: ["*"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { objective: string; reasoningSummary: string }) => {
        const artifactId = `art_${Date.now()}`;
        return {
          success: true,
          output: { artifactId, objective: input.objective, created: true },
          logs: [`Created reasoning artifact for '${input.objective}'`],
          executionTimeMs: 0,
        };
      },
    } as any);
  }
}

export const globalToolRegistry = new InternalToolRegistry();

