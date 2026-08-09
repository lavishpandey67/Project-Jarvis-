from typing import List, Dict, Any, Optional

from python.intelligence.code_intel.ast_engine import PolyglotASTEngine, ASTSymbol

class CodeGraphNode:
    def __init__(self, node_id: str, label: str, node_type: str, language: str, metadata: Optional[Dict[str, Any]] = None):
        self.node_id = node_id
        self.label = label
        self.node_type = node_type  # "FILE", "MODULE", "SYMBOL", "FUNCTION"
        self.language = language
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodeId": self.node_id,
            "label": self.label,
            "nodeType": self.node_type,
            "language": self.language,
            "metadata": self.metadata,
        }


class CodeGraphEdge:
    def __init__(self, source_id: str, target_id: str, edge_type: str, confidence: float = 1.0):
        self.source_id = source_id
        self.target_id = target_id
        self.edge_type = edge_type  # "IMPORTS", "EXPORTS", "CALLS", "DEPENDS_ON", "CROSS_LANGUAGE_BRIDGE"
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sourceId": self.source_id,
            "targetId": self.target_id,
            "edgeType": self.edge_type,
            "confidence": self.confidence,
        }


class CodebaseGraph:
    """Builds codebase dependency graph and detects cross-language boundaries."""

    def __init__(self):
        self.nodes: Dict[str, CodeGraphNode] = {}
        self.edges: List[CodeGraphEdge] = []
        self.cross_language_boundaries: List[Dict[str, Any]] = []

    def add_file_node(self, rel_path: str, language: str) -> CodeGraphNode:
        node_id = f"file:{rel_path}"
        node = CodeGraphNode(node_id, rel_path, "FILE", language)
        self.nodes[node_id] = node
        return node

    def add_symbol_node(self, symbol: ASTSymbol) -> CodeGraphNode:
        node_id = f"sym:{symbol.file_path}:{symbol.name}"
        node = CodeGraphNode(node_id, symbol.name, "SYMBOL", symbol.language, metadata=symbol.to_dict())
        self.nodes[node_id] = node

        # Link File -> Symbol
        file_node_id = f"file:{symbol.file_path}"
        edge_type = "EXPORTS" if symbol.exported else "CONTAINS"
        self.edges.append(CodeGraphEdge(file_node_id, node_id, edge_type))
        return node

    def detect_cross_language_boundaries(self, symbols: List[ASTSymbol]):
        """Detects boundaries between TypeScript, Python, SQL, and Database schemas."""
        for sym in symbols:
            # 1. TypeScript -> Python Bridge Detection
            if sym.language == "TypeScript" and ("pythonBridge" in sym.file_path or "PythonIntelligenceClient" in sym.name):
                boundary = {
                    "sourceLanguage": "TypeScript",
                    "targetLanguage": "Python",
                    "bridgeType": "HTTP_RPC_CLI_BRIDGE",
                    "filePath": sym.file_path,
                    "symbol": sym.name,
                    "confidence": 0.95
                }
                self.cross_language_boundaries.append(boundary)
                self.edges.append(CodeGraphEdge(f"sym:{sym.file_path}:{sym.name}", "module:python_intelligence", "CROSS_LANGUAGE_BRIDGE", 0.95))

            # 2. TypeScript -> SQL Schema Boundary Detection
            elif sym.language == "TypeScript" and ("schema" in sym.file_path or "drizzle" in sym.file_path):
                boundary = {
                    "sourceLanguage": "TypeScript",
                    "targetLanguage": "SQL",
                    "bridgeType": "DRIZZLE_ORM_SCHEMA",
                    "filePath": sym.file_path,
                    "symbol": sym.name,
                    "confidence": 0.90
                }
                self.cross_language_boundaries.append(boundary)
                self.edges.append(CodeGraphEdge(f"sym:{sym.file_path}:{sym.name}", "module:postgresql_db", "CROSS_LANGUAGE_BRIDGE", 0.90))

            # 3. Python -> Vector Store DB Boundary Detection
            elif sym.language == "Python" and ("vector_store" in sym.file_path or "PgVectorStoreAdapter" in sym.name):
                boundary = {
                    "sourceLanguage": "Python",
                    "targetLanguage": "SQL",
                    "bridgeType": "PGVECTOR_ADAPTER",
                    "filePath": sym.file_path,
                    "symbol": sym.name,
                    "confidence": 0.90
                }
                self.cross_language_boundaries.append(boundary)
                self.edges.append(CodeGraphEdge(f"sym:{sym.file_path}:{sym.name}", "module:pgvector_store", "CROSS_LANGUAGE_BRIDGE", 0.90))

    def build_graph_from_repository(self, ast_engine: PolyglotASTEngine, root_dir: str) -> Dict[str, Any]:
        files = ast_engine.scan_repository(root_dir)
        all_symbols = []

        for f in files:
            self.add_file_node(f["filePath"], f["language"])
            try:
                with open(f["fullPath"], "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
                syms = ast_engine.parse_symbols(f["filePath"], content)
                for s in syms:
                    self.add_symbol_node(s)
                    all_symbols.append(s)
            except Exception:
                continue

        self.detect_cross_language_boundaries(all_symbols)

        return {
            "totalNodes": len(self.nodes),
            "totalEdges": len(self.edges),
            "totalCrossLanguageBoundaries": len(self.cross_language_boundaries),
            "boundaries": self.cross_language_boundaries
        }
