import hashlib
import time
import math
from typing import List, Dict, Any, Optional, Tuple

class MemoryType:
    SHORT_TERM = "SHORT_TERM"
    WORKING = "WORKING"
    EPISODIC = "EPISODIC"
    SEMANTIC = "SEMANTIC"
    LESSON = "LESSON"
    PERSONAL = "PERSONAL"
    WORLD_KNOWLEDGE = "WORLD_KNOWLEDGE"

class MemoryProvenance:
    PERSONAL_MEMORY = "PERSONAL_MEMORY"
    WORLD_KNOWLEDGE = "WORLD_KNOWLEDGE"

class CognitiveMemoryRecord:
    """Represents a software-level cognitive memory record with lifecycle state."""

    def __init__(
        self,
        memory_id: str,
        memory_type: str,
        title: str,
        content: str,
        project_id: str = "",
        conversation_id: Optional[int] = None,
        source: str = "USER",
        provenance: str = MemoryProvenance.PERSONAL_MEMORY,
        confidence: float = 0.9,
        importance: int = 3,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.memory_id = memory_id
        self.memory_type = memory_type
        self.title = title
        self.content = content
        self.project_id = project_id
        self.conversation_id = conversation_id
        self.source = source
        self.provenance = provenance
        self.confidence = max(0.0, min(1.0, float(confidence)))
        self.importance = max(1, min(5, int(importance)))
        self.metadata = metadata or {}
        self.content_hash = hashlib.sha256(f"{title}:{content}".encode("utf-8")).hexdigest()
        self.created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.created_timestamp_ms = time.time() * 1000
        self.updated_at = self.created_at
        self.validity = "FACT"
        self.is_active = True

    def calculate_recency_score(self, half_life_days: float = 7.0) -> float:
        now_ms = time.time() * 1000
        age_days = max(0.0, (now_ms - self.created_timestamp_ms) / (1000.0 * 86400.0))
        decay_constant = math.log(2) / half_life_days
        return float(math.exp(-decay_constant * age_days))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.memory_id,
            "memoryType": self.memory_type,
            "title": self.title,
            "content": self.content,
            "projectId": self.project_id,
            "conversationId": self.conversation_id,
            "source": self.source,
            "provenance": self.provenance,
            "confidence": self.confidence,
            "importance": self.importance,
            "contentHash": self.content_hash,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "validity": self.validity,
            "isActive": self.is_active,
            "recencyScore": round(self.calculate_recency_score(), 3),
            "metadata": self.metadata,
        }


class MemoryLifecycleManager:
    """Manages memory lifecycle: ingest, validate, deduplicate, retrieve, score, consolidate, decay, delete."""

    def __init__(self):
        self.memories: Dict[str, CognitiveMemoryRecord] = {}
        self.seen_hashes: Dict[str, str] = {}  # contentHash -> memory_id

    def ingest_memory(self, record: CognitiveMemoryRecord) -> Tuple[bool, str, Optional[CognitiveMemoryRecord]]:
        # 1. Validation Check
        if not record.title or not record.content or not record.content.strip():
            return False, "Validation Error: Title and content cannot be empty", None

        # 2. Hard Provenance Protection: World knowledge can NEVER overwrite personal identity
        if record.content_hash in self.seen_hashes:
            existing_id = self.seen_hashes[record.content_hash]
            existing_mem = self.memories.get(existing_id)
            if existing_mem:
                if existing_mem.provenance == MemoryProvenance.PERSONAL_MEMORY and record.provenance == MemoryProvenance.WORLD_KNOWLEDGE:
                    return False, "Provenance Guard Violation: World Knowledge cannot overwrite Personal Memory identity", existing_mem
                # Deduplication: return existing memory
                return True, "Deduplicated: Memory record already exists", existing_mem

        # 3. Store Memory
        self.memories[record.memory_id] = record
        self.seen_hashes[record.content_hash] = record.memory_id
        return True, "Ingested successfully", record

    def retrieve_memories(
        self,
        project_id: Optional[str] = None,
        conversation_id: Optional[int] = None,
        provenance_filter: Optional[str] = None,
        memory_type_filter: Optional[str] = None
    ) -> List[CognitiveMemoryRecord]:
        results = []
        for mem in self.memories.values():
            if not mem.is_active:
                continue

            # Project Isolation Filter
            if project_id and mem.project_id and mem.project_id != project_id:
                continue

            # Conversation Filter
            if conversation_id is not None and mem.conversation_id is not None and mem.conversation_id != conversation_id:
                continue

            # Provenance Filter
            if provenance_filter and mem.provenance != provenance_filter:
                continue

            # Memory Type Filter
            if memory_type_filter and mem.memory_type != memory_type_filter:
                continue

            results.append(mem)

        return results

    def consolidate_working_memory(self, task_id: str, summary_title: str, summary_content: str, project_id: str) -> CognitiveMemoryRecord:
        """Consolidates working memory into permanent EPISODIC memory upon task completion."""
        episodic_id = f"ep_{task_id}_{Date_now()}"
        rec = CognitiveMemoryRecord(
            memory_id=episodic_id,
            memory_type=MemoryType.EPISODIC,
            title=summary_title,
            content=summary_content,
            project_id=project_id,
            source="SYSTEM",
            provenance=MemoryProvenance.PERSONAL_MEMORY,
            importance=4,
        )
        self.ingest_memory(rec)
        return rec

    def delete_memory(self, memory_id: str) -> bool:
        """Explicit, auditable memory deletion."""
        if memory_id in self.memories:
            mem = self.memories[memory_id]
            mem.is_active = False
            mem.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return True
        return False

def Date_now():
    return int(time.time() * 1000)
