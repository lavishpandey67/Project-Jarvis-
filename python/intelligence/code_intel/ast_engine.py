import os
import re
from typing import List, Dict, Any, Optional

class ASTSymbol:
    """Represents a code symbol extracted from source AST analysis."""

    def __init__(
        self,
        name: str,
        kind: str,  # "class", "function", "interface", "type", "import", "export"
        file_path: str,
        line_number: int,
        language: str,
        exported: bool = False
    ):
        self.name = name
        self.kind = kind
        self.file_path = file_path
        self.line_number = line_number
        self.language = language
        self.exported = exported

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind,
            "filePath": self.file_path,
            "lineNumber": self.line_number,
            "language": self.language,
            "exported": self.exported,
        }


class PolyglotASTEngine:
    """Scans repository files and extracts AST symbols, imports, exports, and language boundaries."""

    IGNORE_DIRS = {"node_modules", "dist", "build", ".git", ".cache", "scratch", "coverage"}
    IGNORE_EXTS = {".env", ".key", ".pem", ".log", ".tar.gz", ".zip"}

    def detect_language(self, file_path: str) -> str:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in {".ts", ".tsx"}:
            return "TypeScript"
        elif ext in {".js", ".jsx"}:
            return "JavaScript"
        elif ext in {".py"}:
            return "Python"
        elif ext in {".sql"}:
            return "SQL"
        elif ext in {".json"}:
            return "JSON"
        elif ext in {".md"}:
            return "Markdown"
        return "UNKNOWN"

    def scan_repository(self, root_dir: str, max_files: int = 200) -> List[Dict[str, Any]]:
        discovered_files = []

        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune ignored directories
            dirnames[:] = [d for d in dirnames if d not in self.IGNORE_DIRS]

            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in self.IGNORE_EXTS:
                    continue

                full_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(full_path, root_dir)
                lang = self.detect_language(rel_path)

                if lang != "UNKNOWN":
                    discovered_files.append({
                        "filePath": rel_path,
                        "fullPath": full_path,
                        "language": lang,
                        "sizeBytes": os.path.getsize(full_path)
                    })

                if len(discovered_files) >= max_files:
                    break
            if len(discovered_files) >= max_files:
                break

        return discovered_files

    def parse_symbols(self, file_path: str, content: str) -> List[ASTSymbol]:
        lang = self.detect_language(file_path)
        symbols: List[ASTSymbol] = []
        lines = content.split("\n")

        if lang in {"TypeScript", "JavaScript"}:
            for idx, line in enumerate(lines, start=1):
                # Exported Class / Function / Interface / Type
                m_exp = re.search(r'\bexport\s+(class|function|interface|type|const|let)\s+([A-Za-z0-9_]+)', line)
                if m_exp:
                    kind = m_exp.group(1)
                    name = m_exp.group(2)
                    symbols.append(ASTSymbol(name, kind, file_path, idx, lang, exported=True))
                    continue

                # Standard Class / Function / Interface / Type
                m_std = re.search(r'\b(class|function|interface|type)\s+([A-Za-z0-9_]+)', line)
                if m_std:
                    kind = m_std.group(1)
                    name = m_std.group(2)
                    symbols.append(ASTSymbol(name, kind, file_path, idx, lang, exported=False))
                    continue

                # Imports
                m_imp = re.search(r'\bimport\s+.*?from\s+[\'"](.*?)[\'"]', line)
                if m_imp:
                    mod = m_imp.group(1)
                    symbols.append(ASTSymbol(mod, "import", file_path, idx, lang, exported=False))

        elif lang == "Python":
            for idx, line in enumerate(lines, start=1):
                # Class definition
                m_cls = re.search(r'^\s*class\s+([A-Za-z0-9_]+)', line)
                if m_cls:
                    symbols.append(ASTSymbol(m_cls.group(1), "class", file_path, idx, lang, exported=True))
                    continue

                # Function definition
                m_def = re.search(r'^\s*def\s+([A-Za-z0-9_]+)', line)
                if m_def:
                    name = m_def.group(1)
                    exported = not name.startswith("_")
                    symbols.append(ASTSymbol(name, "function", file_path, idx, lang, exported=exported))
                    continue

                # Imports
                m_imp = re.search(r'^\s*(?:from|import)\s+([A-Za-z0-9_\.]+)', line)
                if m_imp:
                    symbols.append(ASTSymbol(m_imp.group(1), "import", file_path, idx, lang, exported=False))

        return symbols
