import sys
import json
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any

from python.intelligence.app.contract import IntelligenceRequest, IntelligenceResponse
from python.intelligence.embeddings.engine import DevelopmentFallbackProvider, RealProvider, cosine_similarity
from python.intelligence.retrieval.semantic import SemanticRetrievalEngine
from python.intelligence.reranking.reranker import RerankingEngine
from python.intelligence.evaluation.evaluator import SemanticEvaluationEngine
from python.intelligence.statistical.probabilistic import calculate_uncertainty, platt_calibrate
from python.intelligence.cognitive.models import TaskDifficultyPredictor, RoutingPredictor, UserPreferenceModel

# Service Singleton Instances
embedding_provider = RealProvider(vector_dim=384)
retrieval_engine = SemanticRetrievalEngine(provider=embedding_provider)
reranking_engine = RerankingEngine()
evaluation_engine = SemanticEvaluationEngine()
difficulty_predictor = TaskDifficultyPredictor()
routing_predictor = RoutingPredictor()
preference_model = UserPreferenceModel()


def process_intelligence_request(req_data: Dict[str, Any]) -> Dict[str, Any]:
    start_time = time.time()
    try:
        request = IntelligenceRequest.from_dict(req_data)
        op = request.operation
        inp = request.input_data

        status = "success"
        output: Dict[str, Any] = {}
        confidence = 1.0

        if op == "EMBEDDING":
            text = str(inp.get("text") or "")
            batch = inp.get("batch") or []
            if batch:
                vecs = embedding_provider.embed_batch(batch)
                output = {"vectors": vecs, "count": len(vecs), "dim": embedding_provider.vector_dim}
            else:
                vec = embedding_provider.embed_text(text)
                output = {"vector": vec, "dim": len(vec)}

        elif op == "SEMANTIC_RETRIEVAL":
            query = str(inp.get("query") or "")
            candidates = inp.get("candidates") or []
            project_id = inp.get("projectId") or request.project_id
            allow_cross = bool(inp.get("allowCrossProject", False))
            limit = int(inp.get("limit", 10))

            output = retrieval_engine.retrieve_context(
                query=query,
                candidates=candidates,
                project_id=project_id,
                allow_cross_project=allow_cross,
                limit=limit
            )

        elif op == "RERANK":
            query = str(inp.get("query") or "")
            candidates = inp.get("candidates") or []
            project_id = inp.get("projectId") or request.project_id
            
            query_vec = embedding_provider.embed_text(query)
            ranked = []
            for c in candidates:
                txt = f"{c.get('title', '')} {c.get('content', '')}"
                c_vec = embedding_provider.embed_text(txt)
                sim = cosine_similarity(query_vec, c_vec)
                scored = reranking_engine.score_candidate(query, c, sim, target_project_id=project_id)
                ranked.append(scored)
            
            ranked.sort(key=lambda x: x["compositeScore"], reverse=True)
            output = {"query": query, "rankedItems": ranked}

        elif op == "EVALUATE":
            output_text = str(inp.get("outputText") or inp.get("text") or "")
            memories = inp.get("memories") or []
            constraints = inp.get("constraints") or []

            output = evaluation_engine.evaluate_output(
                output_text=output_text,
                context_memories=memories,
                constraints=constraints
            )
            confidence = output.get("confidence", 0.9)

        elif op == "PREDICT_DIFFICULTY":
            output = difficulty_predictor.predict(inp)

        elif op == "ROUTING":
            output = routing_predictor.predict(inp)

        elif op == "UNCERTAINTY":
            scores = inp.get("scores") or []
            output = calculate_uncertainty(scores)

        else:
            status = "fallback"
            output = {"message": f"Unsupported operation '{op}'. Executing generic baseline response."}

        latency = (time.time() - start_time) * 1000

        res = IntelligenceResponse(
            request_id=request.request_id,
            operation=op,
            status=status,
            output=output,
            confidence=confidence,
            latency_ms=latency,
            model_info=embedding_provider.get_provider_info()
        )
        return res.to_dict()

    except Exception as err:
        latency = (time.time() - start_time) * 1000
        res = IntelligenceResponse(
            request_id=str(req_data.get("requestId", "req_err")),
            operation=str(req_data.get("operation", "UNKNOWN")),
            status="error",
            output={},
            confidence=0.0,
            latency_ms=latency,
            error=str(err),
            model_info=embedding_provider.get_provider_info()
        )
        return res.to_dict()


class IntelligenceHTTPHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Suppress noisy HTTP request logging
        pass

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            health_body = {
                "status": "healthy",
                "service": "Jarvis Python Intelligence Service",
                "version": "1.0.0",
                "provider": embedding_provider.get_provider_info()
            }
            self.wfile.write(json.dumps(health_body).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ["/api/v1/intelligence", "/"]:
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            try:
                req_json = json.loads(post_body.decode("utf-8"))
            except Exception:
                req_json = {}

            response_payload = process_intelligence_request(req_json)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response_payload).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


def run_server(port: int = 5050):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, IntelligenceHTTPHandler)
    print(f"[Jarvis Python Intelligence Service] Listening on http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Python Intelligence Service...")
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Jarvis Python Intelligence Service")
    parser.add_argument("--port", type=int, default=5050, help="Port to run HTTP service on")
    parser.add_argument("--cli", type=str, help="Execute single JSON request via stdin/string")
    args = parser.parse_args()

    if args.cli:
        try:
            req_dict = json.loads(args.cli)
        except Exception:
            req_dict = {"inputData": {"prompt": args.cli}, "operation": "SEMANTIC_RETRIEVAL"}
        print(json.dumps(process_intelligence_request(req_dict)))
    else:
        run_server(port=args.port)
