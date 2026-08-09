export interface ExecutionBudget {
  maxTaskNodes: number;
  maxContextChars: number;
  maxExecutionTimeMs: number;
  maxRetriesPerNode: number;
  maxEstimatedCostUSD: number;
}

export interface BudgetUsage {
  taskNodesCount: number;
  contextCharsCount: number;
  executionTimeMs: number;
  retriesCount: number;
  estimatedCostUSD: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  status: "OK" | "EXHAUSTED";
  breachedLimit?: string;
  remainingBudget: ExecutionBudget;
}

export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
  maxTaskNodes: 10,
  maxContextChars: 32000,
  maxExecutionTimeMs: 60000,
  maxRetriesPerNode: 2,
  maxEstimatedCostUSD: 0.50,
};

export class BudgetController {
  private static instance: BudgetController;
  private activeBudgets: Map<string, ExecutionBudget> = new Map();
  private currentUsage: Map<string, BudgetUsage> = new Map();

  public static getInstance(): BudgetController {
    if (!BudgetController.instance) {
      BudgetController.instance = new BudgetController();
    }
    return BudgetController.instance;
  }

  /**
   * Set execution budget for a specific task or graph execution session
   */
  public setBudget(sessionId: string, customBudget?: Partial<ExecutionBudget>): ExecutionBudget {
    const budget: ExecutionBudget = {
      ...DEFAULT_EXECUTION_BUDGET,
      ...customBudget,
    };
    this.activeBudgets.set(sessionId, budget);
    this.currentUsage.set(sessionId, {
      taskNodesCount: 0,
      contextCharsCount: 0,
      executionTimeMs: 0,
      retriesCount: 0,
      estimatedCostUSD: 0,
    });
    return budget;
  }

  /**
   * Check if current or projected usage satisfies budget limits
   */
  public checkBudget(sessionId: string, projectedIncrement?: Partial<BudgetUsage>): BudgetCheckResult {
    const budget = this.activeBudgets.get(sessionId) || DEFAULT_EXECUTION_BUDGET;
    const usage = this.currentUsage.get(sessionId) || {
      taskNodesCount: 0,
      contextCharsCount: 0,
      executionTimeMs: 0,
      retriesCount: 0,
      estimatedCostUSD: 0,
    };

    const nextTasks = usage.taskNodesCount + (projectedIncrement?.taskNodesCount || 0);
    const nextChars = usage.contextCharsCount + (projectedIncrement?.contextCharsCount || 0);
    const nextTime = usage.executionTimeMs + (projectedIncrement?.executionTimeMs || 0);
    const nextRetries = usage.retriesCount + (projectedIncrement?.retriesCount || 0);
    const nextCost = usage.estimatedCostUSD + (projectedIncrement?.estimatedCostUSD || 0);

    if (nextTasks > budget.maxTaskNodes) {
      return this.buildResult(false, `Task node budget exceeded (${nextTasks} > ${budget.maxTaskNodes})`, budget, usage);
    }
    if (nextChars > budget.maxContextChars) {
      return this.buildResult(false, `Context character budget exceeded (${nextChars} > ${budget.maxContextChars})`, budget, usage);
    }
    if (nextTime > budget.maxExecutionTimeMs) {
      return this.buildResult(false, `Execution time budget exceeded (${nextTime}ms > ${budget.maxExecutionTimeMs}ms)`, budget, usage);
    }
    if (nextRetries > budget.maxRetriesPerNode) {
      return this.buildResult(false, `Task retry limit exceeded (${nextRetries} > ${budget.maxRetriesPerNode})`, budget, usage);
    }
    if (nextCost > budget.maxEstimatedCostUSD) {
      return this.buildResult(false, `Estimated cost budget exceeded ($${nextCost.toFixed(3)} > $${budget.maxEstimatedCostUSD.toFixed(2)})`, budget, usage);
    }

    return this.buildResult(true, undefined, budget, usage);
  }

  /**
   * Record actual resource usage for a task/session
   */
  public recordUsage(sessionId: string, increment: Partial<BudgetUsage>): BudgetUsage {
    const usage = this.currentUsage.get(sessionId) || {
      taskNodesCount: 0,
      contextCharsCount: 0,
      executionTimeMs: 0,
      retriesCount: 0,
      estimatedCostUSD: 0,
    };

    usage.taskNodesCount += increment.taskNodesCount || 0;
    usage.contextCharsCount += increment.contextCharsCount || 0;
    usage.executionTimeMs += increment.executionTimeMs || 0;
    usage.retriesCount += increment.retriesCount || 0;
    usage.estimatedCostUSD += increment.estimatedCostUSD || 0;

    this.currentUsage.set(sessionId, usage);
    return usage;
  }

  /**
   * Get current budget usage for session
   */
  public getUsage(sessionId: string): BudgetUsage {
    return this.currentUsage.get(sessionId) || {
      taskNodesCount: 0,
      contextCharsCount: 0,
      executionTimeMs: 0,
      retriesCount: 0,
      estimatedCostUSD: 0,
    };
  }

  private buildResult(allowed: boolean, breachMessage: string | undefined, budget: ExecutionBudget, usage: BudgetUsage): BudgetCheckResult {
    return {
      allowed,
      status: allowed ? "OK" : "EXHAUSTED",
      breachedLimit: breachMessage,
      remainingBudget: {
        maxTaskNodes: Math.max(0, budget.maxTaskNodes - usage.taskNodesCount),
        maxContextChars: Math.max(0, budget.maxContextChars - usage.contextCharsCount),
        maxExecutionTimeMs: Math.max(0, budget.maxExecutionTimeMs - usage.executionTimeMs),
        maxRetriesPerNode: Math.max(0, budget.maxRetriesPerNode - usage.retriesCount),
        maxEstimatedCostUSD: Math.max(0, budget.maxEstimatedCostUSD - usage.estimatedCostUSD),
      },
    };
  }
}

export const globalBudgetController = BudgetController.getInstance();
