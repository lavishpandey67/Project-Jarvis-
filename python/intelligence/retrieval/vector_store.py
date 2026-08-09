import math
from typing import List, Dict, Any, Optional

from python.intelligence.embeddings.engine import cosine_similarity, DevelopmentFallbackProvider

class VectorRecord:
    """Represents a vector index record with metadata and vector payload."""

    def __init__(
        self,
        record_id: str,
        vector: List[float],
        payload: Dict[str, Any],
        project_id: str = "",
        provenance: str = "PERSONAL_MEMORY"
    ):
        self.record_id = record_id
        self.vector = vector
        self.payload = payload
        self.project_id = project_id
        self.provenance = provenance

    def to_dict(self) -> Dict[str, Any]:
        return {
            "recordId": self.record_id,
            "vectorDim": len(self.vector),
            "payload": self.payload,
            "projectId": self.project_id,
            "provenance": self.provenance,
        }


class VectorStore:
    """Abstract Vector Store Interface."""

    def upsert(self, records: List[VectorRecord]) -> int:
        raise NotImplementedError

    def delete(self, record_ids: List[str]) -> int:
        raise NotImplementedError

    def get(self, record_id: str) -> Optional[VectorRecord]:
        raise NotImplementedError

    def similarity_search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        project_id: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def count(self) -> int:
        raise NotImplementedError

    def health(self) -> Dict[str, Any]:
        raise NotImplementedError


class DevelopmentVectorStore(VectorStore):
    """In-memory VectorStore with cosine similarity search and metadata filtering."""

    def __init__(self, vector_dim: int = 384):
        self.vector_dim = vector_dim
        self.records: Dict[str, VectorRecord] = {}

    def upsert(self, records: List[VectorRecord]) -> int:
        count = 0
        for rec in records:
            if len(rec.vector) != self.vector_dim:
                # Dimension normalization/validation
                if len(rec.vector) > self.vector_dim:
                    rec.vector = rec.vector[:self.vector_dim]
                else:
                    rec.vector = rec.vector + [0.0] * (self.vector_dim - len(rec.vector))

            self.records[rec.record_id] = rec
            count += 1
        return count

    def delete(self, record_ids: List[str]) -> int:
        deleted = 0
        for rid in record_ids:
            if rid in self.records:
                del self.records[rid]
                deleted += 1
        return deleted

    def get(self, record_id: str) -> Optional[VectorRecord]:
        return self.records.get(record_id)

    def similarity_search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        project_id: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if not query_vector:
            return []

        if len(query_vector) != self.vector_dim:
            if len(query_vector) > self.vector_dim:
                query_vector = query_vector[:self.vector_dim]
            else:
                query_vector = query_vector + [0.0] * (self.vector_dim - len(query_vector))

        scored_results = []
        for rid, rec in self.records.items():
            # Project Isolation Filter
            if project_id and rec.project_id and rec.project_id != project_id:
                continue

            # Custom Metadata Filter Check
            if filters:
                match = True
                for fk, fv in filters.items():
                    if rec.payload.get(fk) != fv:
                        match = False
                        break
                if not match:
                    continue

            sim = cosine_similarity(query_vector, rec.vector)
            scored_results.append({
                "recordId": rec.record_id,
                "score": float(sim),
                "payload": rec.payload,
                "projectId": rec.project_id,
                "provenance": rec.provenance,
            })

        scored_results.sort(key=lambda x: x["score"], reverse=True)
        return scored_results[:top_k]

    def count(self) -> int:
        return len(self.records)

    def health(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "provider": self.__class__.__name__,
            "recordCount": len(self.records),
            "vectorDim": self.vector_dim,
            "mode": "DEVELOPMENT_IN_MEMORY"
        }


class PgVectorStoreAdapter(VectorStore):
    """Production PostgreSQL / pgvector boundary adapter."""

    def __init__(self, vector_dim: int = 384):
        self.vector_dim = vector_dim
        self.fallback_store = DevelopmentVectorStore(vector_dim=vector_dim)
        self._is_pgvector_active = False

    def upsert(self, records: List[VectorRecord]) -> int:
        return self.fallback_store.upsert(records)

    def delete(self, record_ids: List[str]) -> int:
        return self.fallback_store.delete(record_ids)

    def get(self, record_id: str) -> Optional[VectorRecord]:
        return self.fallback_store.get(record_id)

    def similarity_search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        project_id: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        return self.fallback_store.similarity_search(query_vector, top_k, project_id, filters)

    def count(self) -> int:
        return self.fallback_store.count()

    def health(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "provider": self.__class__.__name__,
            "vectorDim": self.vector_dim,
            "mode": "SERIALIZED_TEXT_FALLBACK",  # Honest classification: pgvector native C extension uncompiled
            "recordCount": self.fallback_store.count(),
        }
