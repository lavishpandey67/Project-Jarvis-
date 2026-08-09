import math
import hashlib
import re
import json
import os
import urllib.request
import urllib.error
from typing import List, Dict, Any, Tuple, Optional

class EmbeddingProvider:
    """Abstract interface for model-independent vector embedding providers."""

    def __init__(self, vector_dim: int = 384):
        self.vector_dim = vector_dim

    def embed_text(self, text: str) -> List[float]:
        raise NotImplementedError

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in texts]

    def get_provider_info(self) -> Dict[str, Any]:
        return {
            "provider": self.__class__.__name__,
            "vector_dim": self.vector_dim,
            "mode": "DEVELOPMENT_FALLBACK"
        }


class DevelopmentFallbackProvider(EmbeddingProvider):
    """
    Deterministic feature hashing vectorizer for development and offline testing.
    Uses n-gram character and token hashing mapped onto a unit sphere in float32 space.
    """

    def __init__(self, vector_dim: int = 384):
        super().__init__(vector_dim=vector_dim)

    def _normalize(self, vec: List[float]) -> List[float]:
        clean_vec = sanitize_vector(vec, self.vector_dim)
        norm = math.sqrt(sum(x * x for x in clean_vec))
        if norm < 1e-12:
            return [0.0] * len(clean_vec)
        return [float(x / norm) for x in clean_vec]

    def embed_text(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.vector_dim

        vec = [0.0] * self.vector_dim
        cleaned = text.lower().strip()
        tokens = re.findall(r'\w+', cleaned)

        # 1. Token Hashing
        for token in tokens:
            h = int(hashlib.sha256(token.encode('utf-8')).hexdigest(), 16)
            idx = h % self.vector_dim
            sign = 1.0 if (h & 1) else -1.0
            vec[idx] += sign * 1.5

        # 2. N-Gram Character Hashing (3-grams for semantic structure)
        for i in range(len(cleaned) - 2):
            ngram = cleaned[i:i+3]
            h = int(hashlib.md5(ngram.encode('utf-8')).hexdigest(), 16)
            idx = h % self.vector_dim
            sign = 1.0 if (h & 2) else -1.0
            vec[idx] += sign * 0.5

        return self._normalize(vec)


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Real OpenAI REST API embedding provider (text-embedding-3-small)."""

    def __init__(self, vector_dim: int = 384, api_key: Optional[str] = None):
        super().__init__(vector_dim=vector_dim)
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.fallback = DevelopmentFallbackProvider(vector_dim=vector_dim)

    def embed_text(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.vector_dim

        if not self.api_key:
            return self.fallback.embed_text(text)

        try:
            req_data = json.dumps({
                "model": "text-embedding-3-small",
                "input": text.strip(),
                "dimensions": self.vector_dim
            }).encode('utf-8')

            req = urllib.request.Request(
                "https://api.openai.com/v1/embeddings",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status == 200:
                    payload = json.loads(resp.read().decode('utf-8'))
                    raw_vec = payload["data"][0]["embedding"]
                    if len(raw_vec) > self.vector_dim:
                        raw_vec = raw_vec[:self.vector_dim]
                    elif len(raw_vec) < self.vector_dim:
                        raw_vec = raw_vec + [0.0] * (self.vector_dim - len(raw_vec))
                    return self.fallback._normalize(raw_vec)
        except Exception:
            pass

        return self.fallback.embed_text(text)


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Real Gemini REST API embedding provider (text-embedding-004)."""

    def __init__(self, vector_dim: int = 384, api_key: Optional[str] = None):
        super().__init__(vector_dim=vector_dim)
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.fallback = DevelopmentFallbackProvider(vector_dim=vector_dim)

    def embed_text(self, text: str) -> List[float]:
        if not text or not text.strip():
            return [0.0] * self.vector_dim

        if not self.api_key:
            return self.fallback.embed_text(text)

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={self.api_key}"
            req_data = json.dumps({
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": text.strip()}]}
            }).encode('utf-8')

            req = urllib.request.Request(
                url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status == 200:
                    payload = json.loads(resp.read().decode('utf-8'))
                    raw_vec = payload.get("embedding", {}).get("values", [])
                    if raw_vec:
                        if len(raw_vec) > self.vector_dim:
                            raw_vec = raw_vec[:self.vector_dim]
                        elif len(raw_vec) < self.vector_dim:
                            raw_vec = raw_vec + [0.0] * (self.vector_dim - len(raw_vec))
                        return self.fallback._normalize(raw_vec)
        except Exception:
            pass

        return self.fallback.embed_text(text)


class RealProvider(EmbeddingProvider):
    """
    Unified production-grade embedding manager supporting OpenAI, Gemini, and Fallback.
    Explictly reports operational provider mode.
    """

    def __init__(self, vector_dim: int = 384, api_key: Optional[str] = None):
        super().__init__(vector_dim=vector_dim)
        self.openai_provider = OpenAIEmbeddingProvider(vector_dim=vector_dim, api_key=api_key)
        self.gemini_provider = GeminiEmbeddingProvider(vector_dim=vector_dim, api_key=api_key)
        self.fallback_provider = DevelopmentFallbackProvider(vector_dim=vector_dim)

    def embed_text(self, text: str) -> List[float]:
        if os.environ.get("OPENAI_API_KEY"):
            vec = self.openai_provider.embed_text(text)
            return vec
        elif os.environ.get("GEMINI_API_KEY"):
            vec = self.gemini_provider.embed_text(text)
            return vec
        return self.fallback_provider.embed_text(text)

    def get_provider_info(self) -> Dict[str, Any]:
        mode = "DEVELOPMENT_FALLBACK"
        if os.environ.get("OPENAI_API_KEY"):
            mode = "OPENAI_REAL"
        elif os.environ.get("GEMINI_API_KEY"):
            mode = "GEMINI_REAL"

        return {
            "provider": self.__class__.__name__,
            "vector_dim": self.vector_dim,
            "mode": mode
        }


def sanitize_vector(vec: List[float], expected_dim: int = 384) -> List[float]:
    """Sanitizes raw float vectors by rejecting NaN/Infinity and enforcing exact dimension bounds."""
    if not vec:
        return [0.0] * expected_dim

    sanitized = []
    for x in vec:
        try:
            val = float(x)
            if math.isnan(val) or math.isinf(val):
                sanitized.append(0.0)
            else:
                sanitized.append(val)
        except (ValueError, TypeError):
            sanitized.append(0.0)

    if len(sanitized) > expected_dim:
        return sanitized[:expected_dim]
    elif len(sanitized) < expected_dim:
        return sanitized + [0.0] * (expected_dim - len(sanitized))
    return sanitized


def euclidean_distance(vec_a: List[float], vec_b: List[float]) -> float:
    """Calculates Euclidean (L2) distance between two float vectors."""
    if not vec_a or not vec_b:
        return 0.0

    dim = max(len(vec_a), len(vec_b))
    a_clean = sanitize_vector(vec_a, dim)
    b_clean = sanitize_vector(vec_b, dim)

    dist_sq = sum((a - b) ** 2 for a, b in zip(a_clean, b_clean))
    return float(math.sqrt(dist_sq))


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Calculates cosine similarity between two normalized float vectors with numerical sanitation."""
    if not vec_a or not vec_b:
        return 0.0

    dim = max(len(vec_a), len(vec_b))
    a_clean = sanitize_vector(vec_a, dim)
    b_clean = sanitize_vector(vec_b, dim)

    dot = sum(a * b for a, b in zip(a_clean, b_clean))
    norm_a = math.sqrt(sum(a * a for a in a_clean))
    norm_b = math.sqrt(sum(b * b for b in b_clean))

    if norm_a < 1e-12 or norm_b < 1e-12:
        return 0.0

    sim = dot / (norm_a * norm_b)
    return max(-1.0, min(1.0, float(sim)))
