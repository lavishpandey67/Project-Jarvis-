import hashlib
import time
import re
from typing import List, Dict, Any, Optional

class IngestionChunk:
    """Represents a document-aware chunk preserving lineage, metadata, and provenance."""

    def __init__(
        self,
        chunk_id: str,
        document_id: str,
        project_id: str,
        source_type: str,
        content: str,
        section: str = "",
        source_uri: str = "",
        title: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        provenance: str = "PERSONAL_MEMORY",
        chunk_index: int = 0
    ):
        self.chunk_id = chunk_id
        self.document_id = document_id
        self.project_id = project_id
        self.source_type = source_type
        self.content = content
        self.section = section
        self.source_uri = source_uri
        self.title = title
        self.metadata = metadata or {}
        self.provenance = provenance  # "PERSONAL_MEMORY" or "WORLD_KNOWLEDGE"
        self.chunk_index = chunk_index
        self.content_hash = hashlib.sha256(content.strip().encode("utf-8")).hexdigest()
        self.created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.embedding: Optional[List[float]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunkId": self.chunk_id,
            "documentId": self.document_id,
            "projectId": self.project_id,
            "sourceType": self.source_type,
            "title": self.title,
            "section": self.section,
            "sourceUri": self.source_uri,
            "content": self.content,
            "contentHash": self.content_hash,
            "chunkIndex": self.chunk_index,
            "createdAt": self.created_at,
            "metadata": self.metadata,
            "provenance": self.provenance,
            "embedding": self.embedding,
        }


class DocumentChunker:
    """Document-aware chunking strategy respecting section boundaries and overlap."""

    def __init__(self, chunk_size: int = 400, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk_document(
        self,
        document_id: str,
        title: str,
        content: str,
        project_id: str,
        source_type: str = "DOCUMENT",
        source_uri: str = "",
        provenance: str = "PERSONAL_MEMORY",
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[IngestionChunk]:
        if not content or not content.strip():
            return []

        # 1. Section Boundary Splitting (Headers e.g., # Section, ## Section)
        sections = re.split(r'\n(?=#+\s+)', content)
        chunks: List[IngestionChunk] = []
        chunk_counter = 0

        for sec_idx, section_text in enumerate(sections):
            lines = section_text.strip().split("\n")
            section_title = f"Section {sec_idx + 1}"
            if lines and lines[0].startswith("#"):
                section_title = lines[0].lstrip("#").strip()

            sec_body = section_text.strip()
            if len(sec_body) <= self.chunk_size:
                chunk_id = f"chk_{document_id}_{chunk_counter}"
                chunks.append(
                    IngestionChunk(
                        chunk_id=chunk_id,
                        document_id=document_id,
                        project_id=project_id,
                        source_type=source_type,
                        content=sec_body,
                        section=section_title,
                        source_uri=source_uri,
                        title=title,
                        metadata=metadata,
                        provenance=provenance,
                        chunk_index=chunk_counter
                    )
                )
                chunk_counter += 1
            else:
                # Sliding window chunking within section
                start = 0
                while start < len(sec_body):
                    end = start + self.chunk_size
                    chunk_str = sec_body[start:end]
                    chunk_id = f"chk_{document_id}_{chunk_counter}"

                    chunks.append(
                        IngestionChunk(
                            chunk_id=chunk_id,
                            document_id=document_id,
                            project_id=project_id,
                            source_type=source_type,
                            content=chunk_str,
                            section=section_title,
                            source_uri=source_uri,
                            title=title,
                            metadata=metadata,
                            provenance=provenance,
                            chunk_index=chunk_counter
                        )
                    )
                    chunk_counter += 1
                    start += (self.chunk_size - self.chunk_overlap)

        return chunks


class IngestionPipeline:
    """Document ingestion pipeline eliminating duplicates via content hashing."""

    def __init__(self, chunker: Optional[DocumentChunker] = None):
        self.chunker = chunker or DocumentChunker()
        self.seen_content_hashes = set()

    def process_document(
        self,
        document_id: str,
        title: str,
        content: str,
        project_id: str,
        source_type: str = "DOCUMENT",
        source_uri: str = "",
        provenance: str = "PERSONAL_MEMORY",
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[IngestionChunk]:
        raw_chunks = self.chunker.chunk_document(
            document_id=document_id,
            title=title,
            content=content,
            project_id=project_id,
            source_type=source_type,
            source_uri=source_uri,
            provenance=provenance,
            metadata=metadata
        )

        unique_chunks: List[IngestionChunk] = []
        for chk in raw_chunks:
            if chk.content_hash not in self.seen_content_hashes:
                self.seen_content_hashes.add(chk.content_hash)
                unique_chunks.append(chk)

        return unique_chunks
