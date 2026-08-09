import time
import sys
import os
from typing import Dict, Any

# Ensure repo root in sys.path
sys.path.insert(0, "/root/Project-Jarvis-")

from python.intelligence.retrieval.ingestion import IngestionPipeline, DocumentChunker
from python.intelligence.retrieval.vector_store import DevelopmentVectorStore, VectorRecord
from python.intelligence.embeddings.engine import DevelopmentFallbackProvider
from python.intelligence.reranking.reranker import RerankingEngine

def run_scale_benchmark(chunk_counts=[10, 100, 500, 1000]) -> Dict[int, Dict[str, float]]:
    provider = DevelopmentFallbackProvider(vector_dim=384)
    chunker = DocumentChunker(chunk_size=300, chunk_overlap=30)
    pipeline = IngestionPipeline(chunker=chunker)
    reranker = RerankingEngine()

    benchmark_results = {}

    for count in chunk_counts:
        store = DevelopmentVectorStore(vector_dim=384)

        # 1. Measure Ingestion Latency
        start_ingest = time.time()
        chunks = []
        for i in range(count):
            doc_content = f"# Section {i}\nPostgreSQL vector database index query performance optimization section {i}."
            chks = pipeline.process_document(f"doc_{i}", f"Title {i}", doc_content, "proj_scale")
            chunks.extend(chks)
        ingest_latency_ms = (time.time() - start_ingest) * 1000

        # 2. Measure Embedding Latency
        start_embed = time.time()
        records = []
        for chk in chunks:
            vec = provider.embed_text(chk.content)
            records.append(VectorRecord(chk.chunk_id, vec, chk.to_dict(), project_id="proj_scale"))
        embed_latency_ms = (time.time() - start_embed) * 1000

        # Upsert records into store
        store.upsert(records)

        # 3. Measure Retrieval Latency
        query_text = "PostgreSQL vector database query performance"
        query_vec = provider.embed_text(query_text)

        start_retrieve = time.time()
        retrieved_results = store.similarity_search(query_vec, top_k=10, project_id="proj_scale")
        retrieve_latency_ms = (time.time() - start_retrieve) * 1000

        # 4. Measure Reranking Latency
        candidates = [r["payload"] for r in retrieved_results]
        start_rerank = time.time()
        ranked = []
        for c, r in zip(candidates, retrieved_results):
            scored = reranker.score_candidate(query_text, c, r["score"], target_project_id="proj_scale")
            ranked.append(scored)
        rerank_latency_ms = (time.time() - start_rerank) * 1000

        total_latency_ms = ingest_latency_ms + embed_latency_ms + retrieve_latency_ms + rerank_latency_ms

        benchmark_results[count] = {
            "ingestLatencyMs": round(ingest_latency_ms, 2),
            "embedLatencyMs": round(embed_latency_ms, 2),
            "retrieveLatencyMs": round(retrieve_latency_ms, 2),
            "rerankLatencyMs": round(rerank_latency_ms, 2),
            "totalLatencyMs": round(total_latency_ms, 2),
        }

    return benchmark_results

if __name__ == "__main__":
    results = run_scale_benchmark()
    print("==================================================")
    print("RAG SCALE BENCHMARK LATENCY METRICS")
    print("==================================================")
    for count, metrics in results.items():
        print(f"Chunks: {count:4d} | Ingest: {metrics['ingestLatencyMs']:6.2f}ms | Embed: {metrics['embedLatencyMs']:6.2f}ms | Retrieve: {metrics['retrieveLatencyMs']:6.2f}ms | Rerank: {metrics['rerankLatencyMs']:5.2f}ms | Total: {metrics['totalLatencyMs']:7.2f}ms")
