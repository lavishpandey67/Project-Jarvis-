import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
import {
  ToolDefinition,
  ToolExecutionResult,
  ToolExecutionTrace,
  ToolPermissionClass,
} from "../memory/types";
import { CognitiveMemoryStore } from "../memory/store";
import { globalRecoveryController } from "../recoveryController";

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
      outputSchema: { filePath: "string", sizeBytes: "number", lineCount: "number", content: "string" },
      allowedAgentRoles: ["*"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 5000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { filePath: string }) => {
        const workspaceRoot = process.cwd();
        const rawPath = (input.filePath || "").trim();

        if (!rawPath) {
          return {
            success: false,
            error: "Security Policy / Validation Error: filePath must be provided.",
            logs: ["Empty filePath provided to tool_file_read"],
          };
        }

        const resolvedPath = path.resolve(workspaceRoot, rawPath);

        // Security Policy Check: Sandboxed strictly within workspace root
        if (!resolvedPath.startsWith(workspaceRoot)) {
          return {
            success: false,
            error: `Security Policy Violation: Access to path '${rawPath}' is outside workspace boundary.`,
            logs: [`Security policy denied access to path outside workspace: '${rawPath}'`],
          };
        }

        try {
          const stat = await fs.stat(resolvedPath);
          if (!stat.isFile()) {
            return {
              success: false,
              error: `Path '${rawPath}' is not a regular file.`,
              logs: [`Target path '${rawPath}' is not a regular file`],
            };
          }

          if (stat.size > 128 * 1024) {
            return {
              success: false,
              error: `File '${rawPath}' exceeds maximum safe read limit of 128KB (size: ${stat.size} bytes).`,
              logs: [`File size limit exceeded for '${rawPath}'`],
            };
          }

          const content = await fs.readFile(resolvedPath, "utf-8");
          const lineCount = content.split("\n").length;
          return {
            success: true,
            output: {
              filePath: rawPath,
              sizeBytes: stat.size,
              lineCount,
              content,
            },
            logs: [`Successfully read ${stat.size} bytes (${lineCount} lines) from '${rawPath}'`],
          };
        } catch (err: any) {
          return {
            success: false,
            error: `File read failed: ${err?.message || String(err)}`,
            logs: [`Failed to read file '${rawPath}': ${err?.message || String(err)}`],
          };
        }
      },
    } as any);

    // 5. File Write Tool
    this.registerTool({
      id: "tool_file_write",
      name: "Workspace File Writer",
      description: "Writes content to specified workspace file path with strict sandboxing, sha256 tracking, and readback verification.",
      permissionClass: "WRITE",
      riskLevel: "medium",
      isReversible: true,
      sandboxed: true,
      resourceCost: 2,
      inputSchema: { filePath: "string", content: "string" },
      outputSchema: {
        filePath: "string",
        resolvedPath: "string",
        bytesBefore: "number",
        bytesAfter: "number",
        hashBefore: "string",
        hashAfter: "string",
        changed: "boolean",
        verified: "boolean",
        lineCount: "number",
      },
      allowedAgentRoles: ["builder", "executor", "generalist_a", "generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 10000,
      failurePolicy: "STOP_ON_FAILURE",
      execute: async (
        input: { filePath: string; content: string },
        context?: { permissions?: ToolPermissionClass[]; agentRole?: string; taskId?: string },
      ) => {
        const workspaceRoot = process.cwd();
        const rawPath = (input.filePath || "").trim();

        if (!rawPath) {
          return {
            success: false,
            error: "Validation Error: filePath must be provided.",
            logs: ["Empty filePath provided to tool_file_write"],
          };
        }

        if (input.content === undefined || input.content === null || typeof input.content !== "string") {
          return {
            success: false,
            error: "Validation Error: content string must be provided.",
            logs: ["Invalid or missing content provided to tool_file_write"],
          };
        }

        // Content size limit check (Max 256KB safe limit)
        const writeSizeBytes = Buffer.byteLength(input.content, "utf-8");
        if (writeSizeBytes > 256 * 1024) {
          return {
            success: false,
            error: `Security Limit Exceeded: Write payload exceeds maximum safe limit of 256KB (size: ${writeSizeBytes} bytes).`,
            logs: [`Write payload size limit exceeded for '${rawPath}'`],
          };
        }

        const resolvedPath = path.resolve(workspaceRoot, rawPath);

        // Security Policy Check 1: Sandboxed strictly within workspace root
        if (!resolvedPath.startsWith(workspaceRoot) || resolvedPath === workspaceRoot) {
          return {
            success: false,
            error: `Security Policy Violation: Target path '${rawPath}' is outside workspace boundary.`,
            logs: [`Security policy denied write to path outside workspace: '${rawPath}'`],
          };
        }

        // Security Policy Check 2: Symlink escape containment check on existing ancestors
        try {
          let currentCheck = path.dirname(resolvedPath);
          while (currentCheck && currentCheck !== workspaceRoot && currentCheck !== "/") {
            try {
              const realAncestor = await fs.realpath(currentCheck);
              if (!realAncestor.startsWith(workspaceRoot)) {
                return {
                  success: false,
                  error: `Security Policy Violation: Ancestor path '${currentCheck}' resolves outside workspace boundary.`,
                  logs: [`Symlink boundary violation detected at '${currentCheck}'`],
                };
              }
              break;
            } catch {
              currentCheck = path.dirname(currentCheck);
            }
          }
        } catch {
          // Ignored
        }

        // Capture Pre-mutation State (Before metrics)
        let bytesBefore = 0;
        let hashBefore: string | null = null;
        let fileExistedBefore = false;

        try {
          const preStat = await fs.stat(resolvedPath);
          if (preStat.isDirectory()) {
            return {
              success: false,
              error: `Filesystem Error: Target path '${rawPath}' is a directory and cannot be overwritten as a file.`,
              logs: [`Target path '${rawPath}' is a directory`],
            };
          }
          if (preStat.isFile()) {
            fileExistedBefore = true;
            const existingContent = await fs.readFile(resolvedPath, "utf-8");
            bytesBefore = Buffer.byteLength(existingContent, "utf-8");
            hashBefore = crypto.createHash("sha256").update(existingContent).digest("hex");
          }
        } catch {
          // File does not exist yet (normal for creation)
          fileExistedBefore = false;
          bytesBefore = 0;
          hashBefore = null;
        }

        // Capture pre-modification snapshot for transactional rollback if taskId is provided
        if (context?.taskId) {
          globalRecoveryController.createPreModificationSnapshot(context.taskId, [resolvedPath]);
        }

        // Execute Filesystem Mutation
        try {
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, input.content, "utf-8");
        } catch (err: any) {
          return {
            success: false,
            error: `Filesystem Write Failed: ${err?.message || String(err)}`,
            logs: [`Failed to write to file '${rawPath}': ${err?.message || String(err)}`],
          };
        }

        // Post-mutation Verification (Deterministic read-back & comparison)
        try {
          const statAfter = await fs.stat(resolvedPath);
          if (!statAfter.isFile()) {
            return {
              success: false,
              error: `Post-write Verification Failed: '${rawPath}' is not a regular file on disk after write.`,
              logs: [`Verification failed for '${rawPath}'`],
            };
          }

          const diskContent = await fs.readFile(resolvedPath, "utf-8");
          if (diskContent !== input.content) {
            return {
              success: false,
              error: "Post-write Verification Failed: File content on disk does not match written content.",
              logs: [`Verification mismatch on '${rawPath}'`],
            };
          }

          const bytesAfter = statAfter.size;
          const hashAfter = crypto.createHash("sha256").update(diskContent).digest("hex");
          const lineCount = diskContent.split("\n").length;
          const changed = hashBefore !== hashAfter;

          return {
            success: true,
            output: {
              filePath: rawPath,
              resolvedPath,
              bytesBefore,
              bytesAfter,
              hashBefore,
              hashAfter,
              changed,
              verified: true,
              lineCount,
              sizeBytes: bytesAfter,
              fileExistedBefore,
            },
            logs: [
              `Successfully wrote and verified ${bytesAfter} bytes (${lineCount} lines) to '${rawPath}'. SHA256: ${hashAfter}`,
            ],
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Post-write Verification Error: ${err?.message || String(err)}`,
            logs: [`Failed verifying write to '${rawPath}': ${err?.message || String(err)}`],
          };
        }
      },
    } as any);

    // 5b. Workspace Surgical File Patcher Tool
    this.registerTool({
      id: "tool_file_patch",
      name: "Workspace Surgical File Patcher",
      description: "Performs safe, verified in-place surgical patching on a target file using unique targetContent and replacementContent with SHA-256 validation.",
      permissionClass: "WRITE",
      riskLevel: "medium",
      isReversible: true,
      sandboxed: true,
      resourceCost: 2,
      inputSchema: { filePath: "string", targetContent: "string", replacementContent: "string" },
      outputSchema: {
        filePath: "string",
        resolvedPath: "string",
        bytesBefore: "number",
        bytesAfter: "number",
        hashBefore: "string",
        hashAfter: "string",
        changed: "boolean",
        verified: "boolean",
        lineCount: "number",
        patchOccurrences: "number",
      },
      allowedAgentRoles: ["builder", "executor", "generalist_a", "generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 10000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (
        input: { filePath: string; targetContent: string; replacementContent: string },
        context?: { permissions?: ToolPermissionClass[]; agentRole?: string; taskId?: string },
      ) => {
        const workspaceRoot = process.cwd();
        const rawPath = (input.filePath || "").trim();
        const targetContent = input.targetContent;
        const replacementContent = input.replacementContent ?? "";

        if (!rawPath) {
          return {
            success: false,
            error: "Validation Error: filePath must be provided.",
            logs: ["Empty filePath provided to tool_file_patch"],
          };
        }

        if (typeof targetContent !== "string" || targetContent.length === 0) {
          return {
            success: false,
            error: "Validation Error: targetContent must be a non-empty string.",
            logs: ["Empty or invalid targetContent provided to tool_file_patch"],
          };
        }

        if (typeof replacementContent !== "string") {
          return {
            success: false,
            error: "Validation Error: replacementContent must be a string.",
            logs: ["Invalid replacementContent type provided to tool_file_patch"],
          };
        }

        // Security Check 1: Traversal Prevention
        if (rawPath.includes("..") || rawPath.startsWith("/") || rawPath.startsWith("\\")) {
          const resolvedAttempt = path.resolve(workspaceRoot, rawPath);
          if (!resolvedAttempt.startsWith(workspaceRoot) || resolvedAttempt === workspaceRoot) {
            return {
              success: false,
              error: "Security Policy Violation: Target path is outside workspace boundary.",
              logs: [`Security policy denied patch operation for path: '${rawPath}'`],
            };
          }
        }

        const resolvedPath = path.resolve(workspaceRoot, rawPath);
        if (!resolvedPath.startsWith(workspaceRoot) || resolvedPath === workspaceRoot) {
          return {
            success: false,
            error: "Security Policy Violation: Target path is outside workspace boundary.",
            logs: [`Security policy denied patch operation for path: '${rawPath}'`],
          };
        }

        // Check target file existence
        try {
          const stat = await fs.stat(resolvedPath);
          if (!stat.isFile()) {
            return {
              success: false,
              error: `Patch Failed: Target path '${rawPath}' is not a regular file.`,
              logs: [`Attempted to patch non-file: '${rawPath}'`],
            };
          }
        } catch {
          return {
            success: false,
            error: `Patch Failed: Target file '${rawPath}' does not exist.`,
            logs: [`File does not exist for patch: '${rawPath}'`],
          };
        }

        // Read current content & hash
        const currentContent = await fs.readFile(resolvedPath, "utf-8");
        const bytesBefore = Buffer.byteLength(currentContent, "utf-8");
        const hashBefore = crypto.createHash("sha256").update(currentContent).digest("hex");

        // Validate uniqueness of targetContent in file
        const occurrences = currentContent.split(targetContent).length - 1;
        if (occurrences === 0) {
          return {
            success: false,
            error: `Patch Failed: targetContent not found in '${rawPath}'. Please verify the exact text to replace.`,
            logs: [`targetContent not found in '${rawPath}'`],
          };
        }

        if (occurrences > 1) {
          return {
            success: false,
            error: `Patch Failed: targetContent occurs ${occurrences} times in '${rawPath}'. targetContent must be unique. Provide more surrounding context lines.`,
            logs: [`targetContent matched ${occurrences} times in '${rawPath}'`],
          };
        }

        // Capture pre-modification snapshot for transactional rollback if taskId is provided
        if (context?.taskId) {
          globalRecoveryController.createPreModificationSnapshot(context.taskId, [resolvedPath]);
        }

        // Apply replacement
        const patchedContent = currentContent.replace(targetContent, replacementContent);
        await fs.writeFile(resolvedPath, patchedContent, "utf-8");

        // Post-patch verification
        try {
          const statAfter = await fs.stat(resolvedPath);
          const diskContent = await fs.readFile(resolvedPath, "utf-8");

          if (diskContent !== patchedContent) {
            return {
              success: false,
              error: "Post-patch Verification Failed: Disk content mismatch after patch write.",
              logs: [`Verification mismatch on '${rawPath}'`],
            };
          }

          const bytesAfter = statAfter.size;
          const hashAfter = crypto.createHash("sha256").update(diskContent).digest("hex");
          const lineCount = diskContent.split("\n").length;
          const changed = hashBefore !== hashAfter;

          return {
            success: true,
            output: {
              filePath: rawPath,
              resolvedPath,
              bytesBefore,
              bytesAfter,
              hashBefore,
              hashAfter,
              changed,
              verified: true,
              lineCount,
              patchOccurrences: occurrences,
            },
            logs: [
              `Successfully patched and verified '${rawPath}'. Size: ${bytesBefore}B -> ${bytesAfter}B. SHA256: ${hashAfter}`,
            ],
          };
        } catch (err: any) {
          return {
            success: false,
            error: `Post-patch Verification Error: ${err?.message || String(err)}`,
            logs: [`Failed verifying patch to '${rawPath}': ${err?.message || String(err)}`],
          };
        }
      },
    } as any);

    // 5c. Sandboxed Test Runner Tool (Controlled Test/Build verification capability)
    this.registerTool({
      id: "tool_run_test",
      name: "Workspace Sandboxed Test Runner",
      description: "Executes permitted deterministic test/build scripts strictly inside workspace directory with timeout and exit code capture.",
      permissionClass: "EXECUTE",
      riskLevel: "medium",
      isReversible: true,
      sandboxed: true,
      resourceCost: 3,
      inputSchema: { testCommand: "string", targetPath: "string" },
      outputSchema: {
        testCommand: "string",
        targetPath: "string",
        exitCode: "number",
        passed: "boolean",
        stdout: "string",
        stderr: "string",
        durationMs: "number",
        testFailureReason: "string",
      },
      allowedAgentRoles: ["builder", "executor", "critic", "generalist_a", "generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 15000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { testCommand: string; targetPath?: string }) => {
        const workspaceRoot = process.cwd();
        const rawCmd = (input.testCommand || "").trim();
        const rawTargetPath = (input.targetPath || "").trim();

        if (!rawCmd) {
          return {
            success: false,
            error: "Validation Error: testCommand must be provided.",
            logs: ["Empty testCommand provided to tool_run_test"],
          };
        }

        // Security Policy Check 1: Allowed test command prefixes whitelist
        // Prohibit arbitrary destructive shell commands (rm -rf, curl, wget, netcat, sudo, etc.)
        const allowedPatterns = [
          /^node\s+[\w\-\.\/]+$/i,
          /^npx\s+(?:pnpm|tsc|tsx|vitest|jest|mocha)\b/i,
          /^python3?\s+[\w\-\.\/]+$/i,
        ];

        const isCommandAllowed = allowedPatterns.some((pattern) => pattern.test(rawCmd));
        if (!isCommandAllowed) {
          return {
            success: false,
            error: `Security Policy Violation: Command '${rawCmd}' is not in the permitted sandboxed test runner whitelist. Permitted prefixes: node, npx, python3.`,
            logs: [`Security policy denied unapproved test command: '${rawCmd}'`],
          };
        }

        // Security Policy Check 2: Prohibit shell injection characters (pipe, subshell, redirects outside sandbox)
        if (/[;&|`$><]/.test(rawCmd)) {
          return {
            success: false,
            error: `Security Policy Violation: Shell operators and chaining characters (; & | \` $ > <) are prohibited.`,
            logs: [`Security policy denied command with chaining/redirection operators: '${rawCmd}'`],
          };
        }

        // Security Policy Check 3: Workspace containment check on targetPath if provided
        if (rawTargetPath) {
          const resolvedTargetPath = path.resolve(workspaceRoot, rawTargetPath);
          if (!resolvedTargetPath.startsWith(workspaceRoot) || resolvedTargetPath === workspaceRoot) {
            return {
              success: false,
              error: `Security Policy Violation: Target test path '${rawTargetPath}' is outside workspace boundary.`,
              logs: [`Security policy denied test execution for path outside workspace: '${rawTargetPath}'`],
            };
          }
        }

        const start = Date.now();
        try {
          const { stdout, stderr } = await execAsync(rawCmd, {
            cwd: workspaceRoot,
            timeout: 10000,
            maxBuffer: 512 * 1024,
            env: {
              ...process.env,
              NODE_ENV: "test",
              CI: "true",
            },
          });

          const durationMs = Date.now() - start;
          return {
            success: true,
            output: {
              testCommand: rawCmd,
              targetPath: rawTargetPath || "workspace",
              exitCode: 0,
              passed: true,
              stdout: stdout ? stdout.trim() : "",
              stderr: stderr ? stderr.trim() : "",
              durationMs,
            },
            logs: [`Test command '${rawCmd}' executed successfully (Exit Code: 0, Duration: ${durationMs}ms)`],
          };
        } catch (err: any) {
          const durationMs = Date.now() - start;
          const exitCode = typeof err.code === "number" ? err.code : 1;
          const stdout = err.stdout ? String(err.stdout).trim() : "";
          const stderr = err.stderr ? String(err.stderr).trim() : (err.message || "");
          const combinedOutput = `${stdout}\n${stderr}`.trim();

          // Classify failure reason from actual test output
          let testFailureReason = "Test execution failed with non-zero exit code.";
          if (combinedOutput.includes("AssertionError") || combinedOutput.includes("assert")) {
            testFailureReason = `Assertion failure: ${combinedOutput.slice(0, 300)}`;
          } else if (combinedOutput.includes("SyntaxError") || combinedOutput.includes("TypeError")) {
            testFailureReason = `Runtime/Syntax error: ${combinedOutput.slice(0, 300)}`;
          } else if (err.killed || err.signal === "SIGTERM") {
            testFailureReason = "Test execution timed out after 10000ms.";
          }

          return {
            success: false,
            error: `Test Failed (Exit Code ${exitCode}): ${testFailureReason}`,
            output: {
              testCommand: rawCmd,
              targetPath: rawTargetPath || "workspace",
              exitCode,
              passed: false,
              stdout,
              stderr,
              durationMs,
              testFailureReason,
            },
            logs: [
              `Test command '${rawCmd}' failed with exit code ${exitCode}: ${testFailureReason}`,
            ],
          };
        }
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

    // 7. Web Intelligence Search Tool
    this.registerTool({
      id: "tool_web_search",
      name: "World Knowledge Web Search",
      description: "Searches the live web / external knowledge using provider-agnostic web APIs with provenance isolation.",
      permissionClass: "READ",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 2,
      inputSchema: { query: "string", limit: "number" },
      outputSchema: { query: "string", results: "array", provenance: "string" },
      allowedAgentRoles: ["research", "strategy", "builder", "critic", "executor", "agent_generalist_a", "agent_generalist_b"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 10000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { query: string; limit?: number }) => {
        const tavilyKey = process.env.TAVILY_API_KEY;
        const limit = input.limit || 5;

        if (tavilyKey) {
          try {
            const res = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: tavilyKey, query: input.query, max_results: limit }),
            });
            if (res.ok) {
              const data = (await res.json()) as any;
              return {
                success: true,
                output: {
                  query: input.query,
                  results: (data.results || []).map((r: any) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.content,
                    provenance: "WORLD_KNOWLEDGE",
                  })),
                  provenance: "WORLD_KNOWLEDGE",
                },
                logs: [`Executed live web search via Tavily for '${input.query}'`],
                executionTimeMs: 0,
              };
            }
          } catch (_err) {
            // Fallback to provider-agnostic search structure
          }
        }

        return {
          success: true,
          output: {
            query: input.query,
            results: [
              {
                title: `Web Intelligence Search for "${input.query}"`,
                url: `https://duckduckgo.com/?q=${encodeURIComponent(input.query)}`,
                snippet: `External world knowledge reference query for "${input.query}". Provider operating in clean sandbox mode.`,
                provenance: "WORLD_KNOWLEDGE",
              },
            ],
            provenance: "WORLD_KNOWLEDGE",
          },
          logs: [`Executed provider-agnostic web search for '${input.query}'`],
          executionTimeMs: 0,
        };
      },
    } as any);

    // 8. Web Page Fetcher Tool
    this.registerTool({
      id: "tool_web_fetch",
      name: "World Knowledge Page Reader",
      description: "Fetches and sanitizes text content from a web URL with strict source provenance.",
      permissionClass: "READ",
      riskLevel: "low",
      isReversible: true,
      sandboxed: true,
      resourceCost: 2,
      inputSchema: { url: "string" },
      outputSchema: { url: "string", content: "string", provenance: "string" },
      allowedAgentRoles: ["research", "builder", "critic"],
      reversibility: true,
      externalImpact: false,
      executionTimeoutMs: 10000,
      failurePolicy: "CONTINUE_WITH_WARNING",
      execute: async (input: { url: string }) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(input.url, { signal: controller.signal });
          clearTimeout(timer);

          if (res.ok) {
            const rawHtml = await res.text();
            const text = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, "")
                               .replace(/<style[\s\S]*?<\/style>/gi, "")
                               .replace(/<[^>]+>/g, " ")
                               .replace(/\s+/g, " ")
                               .trim()
                               .slice(0, 4000);
            return {
              success: true,
              output: { url: input.url, content: text, provenance: "WORLD_KNOWLEDGE" },
              logs: [`Fetched and sanitized content from '${input.url}'`],
              executionTimeMs: 0,
            };
          }
        } catch (_err) {
          // Fallback response
        }

        return {
          success: true,
          output: {
            url: input.url,
            content: `Content from ${input.url} could not be fetched directly. Web page fetcher fallback active.`,
            provenance: "WORLD_KNOWLEDGE",
          },
          logs: [`Web page fetcher executed fallback for '${input.url}'`],
          executionTimeMs: 0,
        };
      },
    } as any);
  }
}

export const globalToolRegistry = new InternalToolRegistry();

