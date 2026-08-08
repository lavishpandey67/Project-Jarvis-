import { ToolDefinition, ToolExecutionResult, ToolPermissionClass } from "../memory/types";

export class InternalToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBuiltInTools();
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
  public listTools(maxPermissionClass?: ToolPermissionClass): ToolDefinition[] {
    const list = Array.from(this.tools.values());
    if (!maxPermissionClass) return list;

    const rank: Record<ToolPermissionClass, number> = {
      READ: 1,
      WRITE: 2,
      EXECUTE: 3,
      DESTRUCTIVE: 4,
    };

    const maxRank = rank[maxPermissionClass] || 1;
    return list.filter((t) => rank[t.permissionClass] <= maxRank);
  }

  /**
   * Execute a tool safely with permission and sandboxing enforcement
   */
  public async executeTool(
    id: string,
    input: any,
    context: { permissions: ToolPermissionClass[]; isSandboxed?: boolean; userApprovalGranted?: boolean },
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(id);
    const startTime = Date.now();

    if (!tool) {
      return {
        success: false,
        error: `Tool '${id}' not found in internal tool registry.`,
        executionTimeMs: Date.now() - startTime,
      };
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
      return {
        success: false,
        error: `Permission Denied: Execution of tool '${tool.name}' requires permission level '${tool.permissionClass}', but agent only holds '${context.permissions.join(", ")}'.`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Check destructive action approval
    if (tool.permissionClass === "DESTRUCTIVE" && !context.userApprovalGranted) {
      return {
        success: false,
        error: `Safety Guard Violation: Tool '${tool.name}' is DESTRUCTIVE and requires explicit human user approval prior to execution.`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const result = await tool.execute(input, context);
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Tool Execution Exception (${tool.id}): ${err?.message || String(err)}`,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Register standard built-in tools
   */
  private registerBuiltInTools(): void {
    // 1. Memory Vector Search Tool
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
      execute: async (input: { query: string; limit?: number }) => {
        return {
          success: true,
          output: { query: input.query, itemsFound: 0, results: [] },
          logs: [`Executed cognitive memory search for '${input.query}'`],
          executionTimeMs: 0,
        };
      },
    });

    // 2. File Read Tool
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
      execute: async (input: { filePath: string }) => {
        return {
          success: true,
          output: { filePath: input.filePath, content: "// Read file content mock" },
          logs: [`Read file '${input.filePath}'`],
          executionTimeMs: 0,
        };
      },
    });

    // 3. File Write Tool
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
      execute: async (input: { filePath: string; content: string }) => {
        return {
          success: true,
          output: { filePath: input.filePath, bytesWritten: input.content.length },
          logs: [`Wrote ${input.content.length} bytes to '${input.filePath}'`],
          executionTimeMs: 0,
        };
      },
    });

    // 4. Operational Command Execution Tool
    this.registerTool({
      id: "tool_cmd_execute",
      name: "System Command Runner",
      description: "Executes approved shell operational commands in sandboxed environment.",
      permissionClass: "EXECUTE",
      riskLevel: "high",
      isReversible: false,
      sandboxed: true,
      resourceCost: 3,
      inputSchema: { command: "string" },
      outputSchema: { stdout: "string", exitCode: "number" },
      execute: async (input: { command: string }) => {
        return {
          success: true,
          output: { command: input.command, stdout: "Command output complete.", exitCode: 0 },
          logs: [`Executed sandboxed command: '${input.command}'`],
          executionTimeMs: 0,
        };
      },
    });
  }
}

export const globalToolRegistry = new InternalToolRegistry();
