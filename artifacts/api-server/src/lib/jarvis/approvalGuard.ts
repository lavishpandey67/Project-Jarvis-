import { ToolPermissionClass } from "./memory/types";

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface OperationApprovalRequest {
  taskId: string;
  agentId: string;
  agentRole: string;
  operationName: string;
  permissionClass: ToolPermissionClass;
  riskLevel: ActionRiskLevel;
  targetResource?: string;
  description: string;
  userApprovalGranted?: boolean;
}

export interface ApprovalVerdict {
  approved: boolean;
  status: "APPROVED" | "ESCALATE" | "REJECTED";
  reason: string;
  requiresHumanAction: boolean;
  escalationNotice?: string;
}

export class HumanApprovalGuard {
  private static instance: HumanApprovalGuard;
  private approvalLog: Array<{ request: OperationApprovalRequest; verdict: ApprovalVerdict; timestamp: string }> = [];

  public static getInstance(): HumanApprovalGuard {
    if (!HumanApprovalGuard.instance) {
      HumanApprovalGuard.instance = new HumanApprovalGuard();
    }
    return HumanApprovalGuard.instance;
  }

  /**
   * Evaluate operation against safety policies and human approval boundaries
   */
  public evaluateOperation(req: OperationApprovalRequest): ApprovalVerdict {
    const timestamp = new Date().toISOString();

    // 1. DESTRUCTIVE Class Policy Check
    if (req.permissionClass === "DESTRUCTIVE") {
      if (!req.userApprovalGranted) {
        const verdict: ApprovalVerdict = {
          approved: false,
          status: "ESCALATE",
          reason: `Safety Violation: Operation '${req.operationName}' requires permission class 'DESTRUCTIVE' and explicitly requires human user approval.`,
          requiresHumanAction: true,
          escalationNotice: `Human User Approval Required for task '${req.taskId}': Agent '${req.agentId}' (${req.agentRole}) requested DESTRUCTIVE action on '${req.targetResource || "workspace"}'`,
        };
        this.approvalLog.push({ request: req, verdict, timestamp });
        return verdict;
      }
    }

    // 2. High/Critical Risk Policy Check
    if (req.riskLevel === "CRITICAL" && !req.userApprovalGranted) {
      const verdict: ApprovalVerdict = {
        approved: false,
        status: "ESCALATE",
        reason: `Safety Violation: Operation '${req.operationName}' carries risk level 'CRITICAL' and requires explicit human user sign-off.`,
        requiresHumanAction: true,
        escalationNotice: `Critical Action Escalation for task '${req.taskId}': ${req.description}`,
      };
      this.approvalLog.push({ request: req, verdict, timestamp });
      return verdict;
    }

    // 3. Approved Operation
    const verdict: ApprovalVerdict = {
      approved: true,
      status: "APPROVED",
      reason: `Operation '${req.operationName}' passed safety checks and permission boundary.`,
      requiresHumanAction: false,
    };
    this.approvalLog.push({ request: req, verdict, timestamp });
    return verdict;
  }

  /**
   * Get complete approval log
   */
  public getApprovalLog() {
    return [...this.approvalLog];
  }
}

export const globalApprovalGuard = HumanApprovalGuard.getInstance();
