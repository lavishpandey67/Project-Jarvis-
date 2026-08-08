import { TaskGraph, TaskGraphNode } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTaskGraph(graph: TaskGraph): ValidationResult {
  const errors: string[] = [];
  const nodeMap = new Map<string, TaskGraphNode>();

  // 1. Check duplicate IDs
  for (const node of graph.nodes) {
    if (!node.taskId || node.taskId.trim() === "") {
      errors.push("Task node missing required taskId.");
      continue;
    }
    if (nodeMap.has(node.taskId)) {
      errors.push(`Duplicate task ID found in graph: '${node.taskId}'`);
    } else {
      nodeMap.set(node.taskId, node);
    }
  }

  // 2. Check missing dependencies
  for (const node of graph.nodes) {
    for (const depId of node.dependencies) {
      if (!nodeMap.has(depId)) {
        errors.push(
          `Task '${node.taskId}' specifies unknown dependency taskId '${depId}'.`,
        );
      }
    }
  }

  // 3. Cycle Detection using DFS
  const visited = new Map<string, "unvisited" | "visiting" | "visited">();
  for (const nodeId of nodeMap.keys()) {
    visited.set(nodeId, "unvisited");
  }

  function hasCycleDFS(currentId: string, path: string[]): boolean {
    visited.set(currentId, "visiting");
    path.push(currentId);

    const node = nodeMap.get(currentId)!;
    for (const depId of node.dependencies) {
      const state = visited.get(depId);
      if (state === "visiting") {
        const cyclePath = [...path, depId].join(" -> ");
        errors.push(`Circular dependency detected in task graph: ${cyclePath}`);
        return true;
      }
      if (state === "unvisited") {
        if (hasCycleDFS(depId, path)) {
          return true;
        }
      }
    }

    path.pop();
    visited.set(currentId, "visited");
    return false;
  }

  for (const nodeId of nodeMap.keys()) {
    if (visited.get(nodeId) === "unvisited") {
      hasCycleDFS(nodeId, []);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
