import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PythonIntelligenceRequest {
  requestId?: string;
  taskId?: string;
  projectId?: string;
  operation: "EMBEDDING" | "SEMANTIC_RETRIEVAL" | "RERANK" | "EVALUATE" | "PREDICT_DIFFICULTY" | "ROUTING" | "UNCERTAINTY";
  inputData: Record<string, any>;
  metadata?: Record<string, any>;
  options?: Record<string, any>;
}

export interface PythonIntelligenceResponse {
  requestId: string;
  operation: string;
  status: "success" | "fallback" | "error";
  output: Record<string, any>;
  confidence: number;
  latencyMs: number;
  error?: string | null;
  modelInfo: Record<string, any>;
}

export class PythonIntelligenceClient {
  private serviceUrl: string;
  private timeoutMs: number;

  constructor(serviceUrl = "http://127.0.0.1:5050/api/v1/intelligence", timeoutMs = 2500) {
    this.serviceUrl = serviceUrl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Execute intelligence request against Python Intelligence Service with HTTP & CLI fallback
   */
  public async execute(request: PythonIntelligenceRequest): Promise<PythonIntelligenceResponse> {
    const startTime = Date.now();
    const requestId = request.requestId || `req_ts_${Date.now()}`;
    const payload = {
      requestId,
      taskId: request.taskId || "task_default",
      projectId: request.projectId || "proj_default",
      operation: request.operation,
      inputData: request.inputData,
      metadata: request.metadata || {},
      options: request.options || {},
    };

    // 1. Try HTTP request if server is running
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(this.serviceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as PythonIntelligenceResponse;
        return data;
      }
    } catch (_httpErr) {
      // HTTP server not reachable or timed out; fallback to direct Python CLI invocation
    }

    // 2. Fallback to CLI Python Execution
    try {
      const jsonStr = JSON.stringify(payload).replace(/'/g, "'\\''");
      const { stdout } = await execAsync(`python3 -m python.intelligence.app.server --cli '${jsonStr}'`, {
        timeout: this.timeoutMs,
        env: { ...process.env, PYTHONPATH: "." },
      });

      const parsed = JSON.parse(stdout.trim()) as PythonIntelligenceResponse;
      return parsed;
    } catch (cliErr: any) {
      const latency = Date.now() - startTime;
      return {
        requestId,
        operation: request.operation,
        status: "fallback",
        output: { message: "Python Intelligence Service unreachable, falling back to local TypeScript execution." },
        confidence: 0.5,
        latencyMs: latency,
        error: cliErr.message || "Execution error",
        modelInfo: { provider: "TypeScriptFallback", mode: "LOCAL_FALLBACK" },
      };
    }
  }

  /**
   * Dedicated shortcut for Semantic Context Retrieval via Python RAG engine
   */
  public async retrieveSemanticContext(params: {
    query: string;
    candidates: Array<Record<string, any>>;
    projectId?: string;
    allowCrossProject?: boolean;
    limit?: number;
  }): Promise<PythonIntelligenceResponse> {
    return this.execute({
      operation: "SEMANTIC_RETRIEVAL",
      projectId: params.projectId,
      inputData: {
        query: params.query,
        candidates: params.candidates,
        projectId: params.projectId,
        allowCrossProject: params.allowCrossProject ?? false,
        limit: params.limit || 10,
      },
    });
  }
}
