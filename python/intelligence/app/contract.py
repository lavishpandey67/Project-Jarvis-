import json
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, Optional, List

@dataclass
class IntelligenceRequest:
    request_id: str
    task_id: str
    project_id: str
    operation: str  # EMBEDDING, SEMANTIC_RETRIEVAL, RERANK, EVALUATE, PREDICT_DIFFICULTY
    input_data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    options: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntelligenceRequest":
        if not isinstance(data, dict):
            raise ValueError("Payload must be a JSON object")
        
        request_id = str(data.get("requestId") or data.get("request_id") or f"req_{int(time.time() * 1000)}")
        task_id = str(data.get("taskId") or data.get("task_id") or "task_default")
        project_id = str(data.get("projectId") or data.get("project_id") or "proj_default")
        operation = str(data.get("operation") or "UNKNOWN").upper()
        
        input_data = data.get("inputData") or data.get("input_data") or data.get("input") or {}
        metadata = data.get("metadata") or {}
        options = data.get("options") or {}

        if not isinstance(input_data, dict):
            input_data = {"raw_input": input_data}

        return cls(
            request_id=request_id,
            task_id=task_id,
            project_id=project_id,
            operation=operation,
            input_data=input_data,
            metadata=metadata,
            options=options,
        )

@dataclass
class IntelligenceResponse:
    request_id: str
    operation: str
    status: str  # "success", "fallback", "error"
    output: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    latency_ms: float = 0.0
    error: Optional[str] = None
    model_info: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "requestId": self.request_id,
            "operation": self.operation,
            "status": self.status,
            "output": self.output,
            "confidence": self.confidence,
            "latencyMs": round(self.latency_ms, 2),
            "error": self.error,
            "modelInfo": self.model_info,
        }
