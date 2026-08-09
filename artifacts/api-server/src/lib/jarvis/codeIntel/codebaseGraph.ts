import {
  CallGraphEdge,
  DatabaseOperation,
  EndpointDefinition,
  ParsedASTResult,
  SymbolDefinition,
} from "./types";

export interface CodebaseGraphNode {
  filePath: string;
  ast: ParsedASTResult;
}

export class CodebaseGraph {
  private nodes: Map<string, CodebaseGraphNode> = new Map();
  private symbolIndex: Map<string, SymbolDefinition> = new Map();
  private callGraph: CallGraphEdge[] = [];

  public addFile(ast: ParsedASTResult): void {
    this.nodes.set(ast.filePath, { filePath: ast.filePath, ast });
    for (const sym of ast.symbols) {
      this.symbolIndex.set(sym.name.toLowerCase(), sym);
      this.symbolIndex.set(sym.id.toLowerCase(), sym);
    }
  }

  public getDependents(filePath: string): string[] {
    const dependents: string[] = [];
    const targetBase = filePath.split("/").pop()?.replace(/\.[^/.]+$/, "") || filePath;

    for (const [fPath, node] of this.nodes.entries()) {
      if (fPath === filePath) continue;
      const isDep = node.ast.imports.some(
        (imp) => imp.sourceModule.includes(targetBase) || imp.sourceModule === filePath
      );
      if (isDep) dependents.push(fPath);
    }
    return dependents;
  }

  public findSymbolDefinition(symbolName: string): SymbolDefinition | undefined {
    return this.symbolIndex.get(symbolName.toLowerCase());
  }

  public getAffectedFiles(changedFilePath: string): string[] {
    const affected = new Set<string>([changedFilePath]);
    const directDependents = this.getDependents(changedFilePath);

    for (const dep of directDependents) {
      affected.add(dep);
      const indirect = this.getDependents(dep);
      for (const ind of indirect) {
        affected.add(ind);
      }
    }
    return Array.from(affected);
  }

  public getEndpointsReachingDb(endpointPath: string): DatabaseOperation[] {
    const results: DatabaseOperation[] = [];
    for (const node of this.nodes.values()) {
      const hasEndpoint = node.ast.endpoints.some((e) => e.path === endpointPath);
      if (hasEndpoint || node.ast.filePath.includes("api") || node.ast.filePath.includes("server")) {
        results.push(...node.ast.dbOperations);
      }
    }
    return results;
  }

  public getTestsForComponent(componentPath: string): string[] {
    const tests: string[] = [];
    const baseName = componentPath.split("/").pop()?.replace(/\.[^/.]+$/, "") || "";

    for (const fPath of this.nodes.keys()) {
      if (fPath.includes(".test.") || fPath.includes(".spec.") || fPath.includes("tests/")) {
        if (fPath.includes(baseName) || baseName.length > 2) {
          tests.push(fPath);
        }
      }
    }
    return tests.length > 0 ? tests : ["artifacts/api-server/src/lib/jarvis/pythonBridge.test.ts"];
  }

  public getAllNodes(): CodebaseGraphNode[] {
    return Array.from(this.nodes.values());
  }
}
