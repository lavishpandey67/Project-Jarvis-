import {
  DatabaseOperation,
  EndpointDefinition,
  ModuleExport,
  ModuleImport,
  ParsedASTResult,
  SupportedLanguage,
  SymbolDefinition,
} from "./types";

export class PolyglotASTEngine {
  /**
   * Parse a single source file and return structural symbols, imports, exports, endpoints, and DB ops.
   */
  public parseFile(filePath: string, content: string): ParsedASTResult {
    const language = this.detectLanguage(filePath);
    const symbols: SymbolDefinition[] = [];
    const imports: ModuleImport[] = [];
    const exports: ModuleExport[] = [];
    const endpoints: EndpointDefinition[] = [];
    const dbOperations: DatabaseOperation[] = [];
    const dependencies: string[] = [];
    const syntaxErrors: string[] = [];

    const lines = content.split("\n");

    if (language === "typescript" || language === "javascript") {
      this.parseTypeScript(filePath, lines, symbols, imports, exports, endpoints, dbOperations, dependencies);
    } else if (language === "python") {
      this.parsePython(filePath, lines, symbols, imports, exports, endpoints, dbOperations, dependencies);
    } else if (language === "sql") {
      this.parseSQL(filePath, lines, dbOperations);
    }

    return {
      filePath,
      language,
      symbols,
      imports,
      exports,
      endpoints,
      dbOperations,
      dependencies: Array.from(new Set(dependencies)),
      syntaxErrors,
    };
  }

  private detectLanguage(filePath: string): SupportedLanguage {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
    if (filePath.endsWith(".py")) return "python";
    if (filePath.endsWith(".sql")) return "sql";
    if (filePath.endsWith(".rs")) return "rust";
    if (filePath.endsWith(".go")) return "go";
    if (filePath.endsWith(".java")) return "java";
    if (filePath.endsWith(".kt")) return "kotlin";
    if (filePath.endsWith(".cpp") || filePath.endsWith(".hpp")) return "cpp";
    if (filePath.endsWith(".c") || filePath.endsWith(".h")) return "c";
    if (filePath.endsWith(".swift")) return "swift";
    return "typescript";
  }

  private parseTypeScript(
    filePath: string,
    lines: string[],
    symbols: SymbolDefinition[],
    imports: ModuleImport[],
    exports: ModuleExport[],
    endpoints: EndpointDefinition[],
    dbOperations: DatabaseOperation[],
    dependencies: string[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Imports
      if (trimmed.startsWith("import ")) {
        const match = trimmed.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
        if (match) {
          const imported = match[1] ? match[1].split(",").map((s) => s.trim()) : [match[2]];
          const source = match[3];
          imports.push({
            sourceModule: source,
            importedSymbols: imported,
            isRelative: source.startsWith("."),
            line: lineNum,
          });
          dependencies.push(source);
        }
      }

      // Exports & Functions/Classes/Interfaces/Types
      const isExported = trimmed.startsWith("export ");

      // Function
      const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        const name = fnMatch[1];
        symbols.push({
          id: `${filePath}#${name}`,
          name,
          kind: "function",
          filePath,
          language: "typescript",
          lineStart: lineNum,
          lineEnd: lineNum + 10,
          exported: isExported,
          signature: `function ${name}(${fnMatch[2]})`,
        });
        if (isExported) exports.push({ symbolName: name, isDefault: false, line: lineNum });
      }

      // Class
      const classMatch = trimmed.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        symbols.push({
          id: `${filePath}#${name}`,
          name,
          kind: "class",
          filePath,
          language: "typescript",
          lineStart: lineNum,
          lineEnd: lineNum + 20,
          exported: isExported,
          signature: `class ${name}`,
        });
        if (isExported) exports.push({ symbolName: name, isDefault: false, line: lineNum });
      }

      // Interface / Type
      const typeMatch = trimmed.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
      if (typeMatch && !classMatch) {
        const name = typeMatch[1];
        symbols.push({
          id: `${filePath}#${name}`,
          name,
          kind: "interface",
          filePath,
          language: "typescript",
          lineStart: lineNum,
          lineEnd: lineNum + 5,
          exported: isExported,
          signature: `type/interface ${name}`,
        });
        if (isExported) exports.push({ symbolName: name, isDefault: false, line: lineNum });
      }

      // Express / HTTP Endpoint
      const endpointMatch = trimmed.match(/(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (endpointMatch) {
        endpoints.push({
          method: endpointMatch[1].toUpperCase() as any,
          path: endpointMatch[2],
          filePath,
          handlerSymbol: `route_handler_l${lineNum}`,
        });
      }

      // DB / SQL Operation
      if (/SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|db\.query|db\.select/i.test(trimmed)) {
        let opType: DatabaseOperation["operationType"] = "SELECT";
        if (/INSERT/i.test(trimmed)) opType = "INSERT";
        else if (/UPDATE/i.test(trimmed)) opType = "UPDATE";
        else if (/DELETE/i.test(trimmed)) opType = "DELETE";

        dbOperations.push({
          operationType: opType,
          tableOrCollection: "detected_table",
          filePath,
          line: lineNum,
          rawSnippet: trimmed,
          riskLevel: opType === "DELETE" ? "HIGH" : "LOW",
        });
      }
    });
  }

  private parsePython(
    filePath: string,
    lines: string[],
    symbols: SymbolDefinition[],
    imports: ModuleImport[],
    exports: ModuleExport[],
    endpoints: EndpointDefinition[],
    dbOperations: DatabaseOperation[],
    dependencies: string[]
  ): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Imports
      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
        const match = trimmed.match(/(?:from\s+([\w.]+)\s+import\s+([\w,\s*]+)|import\s+([\w.]+))/);
        if (match) {
          const mod = match[1] || match[3];
          const symbolsImp = match[2] ? match[2].split(",").map((s) => s.trim()) : [mod];
          imports.push({
            sourceModule: mod,
            importedSymbols: symbolsImp,
            isRelative: mod.startsWith("."),
            line: lineNum,
          });
          dependencies.push(mod);
        }
      }

      // Class / Def
      const defMatch = trimmed.match(/def\s+(\w+)\s*\(([^)]*)\):/);
      if (defMatch) {
        const name = defMatch[1];
        symbols.push({
          id: `${filePath}#${name}`,
          name,
          kind: "function",
          filePath,
          language: "python",
          lineStart: lineNum,
          lineEnd: lineNum + 10,
          exported: !name.startsWith("_"),
          signature: `def ${name}(${defMatch[2]})`,
        });
      }

      const classMatch = trimmed.match(/class\s+(\w+)(?:\(([^)]*)\))?:/);
      if (classMatch) {
        const name = classMatch[1];
        symbols.push({
          id: `${filePath}#${name}`,
          name,
          kind: "class",
          filePath,
          language: "python",
          lineStart: lineNum,
          lineEnd: lineNum + 15,
          exported: !name.startsWith("_"),
          signature: `class ${name}`,
        });
      }

      // FastAPI / Flask Route
      const routeMatch = trimmed.match(/@(?:app|router)\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/i);
      if (routeMatch) {
        endpoints.push({
          method: routeMatch[1].toUpperCase() as any,
          path: routeMatch[2],
          filePath,
          handlerSymbol: `py_route_l${lineNum}`,
        });
      }
    });
  }

  private parseSQL(filePath: string, lines: string[], dbOperations: DatabaseOperation[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      if (/CREATE\s+TABLE\s+([\w.]+)/i.test(trimmed)) {
        const m = trimmed.match(/CREATE\s+TABLE\s+([\w.]+)/i);
        dbOperations.push({
          operationType: "CREATE_TABLE",
          tableOrCollection: m ? m[1] : "unknown",
          filePath,
          line: lineNum,
          rawSnippet: trimmed,
          riskLevel: "MEDIUM",
        });
      } else if (/DROP\s+TABLE/i.test(trimmed)) {
        dbOperations.push({
          operationType: "DROP_TABLE",
          tableOrCollection: "table",
          filePath,
          line: lineNum,
          rawSnippet: trimmed,
          riskLevel: "DESTRUCTIVE",
        });
      }
    });
  }
}
