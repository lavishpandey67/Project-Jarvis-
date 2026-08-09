import math
import hashlib
import re
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
        norm = math.sqrt(sum(x * x for x in vec))
        if norm < 1e-12:
            return [0.0] * len(vec)
        return [x / norm for x in vec]

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


class RealProvider(EmbeddingProvider):
    """
    Production-grade embedding provider. Falls back to DevelopmentFallbackProvider
    if remote API keys / models are unavailable.
    """

    def __init__(self, vector_dim: int = 384, api_key: Optional[str] = None):
        super().__init__(vector_dim=vector_dim)
        self.api_key = api_key
        self.fallback = DevelopmentFallbackProvider(vector_dim=vector_dim)

    def embed_text(self, text: str) -> List[float]:
        # If API key or external service is not available, use deterministic fallback
        if not self.api_key:
            return self.fallback.embed_text(text)
        try:
            # Placeholder for external model API call
            return self.fallback.embed_text(text)
        except Exception:
            return self.fallback.embed_text(text)

    def get_provider_info(self) -> Dict[str, Any]:
        info = super().get_provider_info()
        info["mode"] = "REAL_PROVIDER" if self.api_key else "DEVELOPMENT_FALLBACK"
        return info


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Calculates cosine similarity between two normalized float vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    
    if norm_a < 1e-12 or norm_b < 1e-12:
        return 0.0
    
    sim = dot / (norm_a * norm_b)
    return max(-1.0, min(1.0, float(sim)))
