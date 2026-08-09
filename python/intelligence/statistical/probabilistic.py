import math
from typing import List, Dict, Any, Tuple

def softmax(scores: List[float], temperature: float = 1.0) -> List[float]:
    """Applies numerically stable softmax with temperature scaling."""
    if not scores:
        return []
    temp = max(1e-5, temperature)
    max_s = max(scores)
    exp_scores = [math.exp((s - max_s) / temp) for s in scores]
    sum_exp = sum(exp_scores)
    if sum_exp < 1e-12:
        return [1.0 / len(scores)] * len(scores)
    return [e / sum_exp for e in exp_scores]


def shannon_entropy(probabilities: List[float]) -> float:
    """Calculates Shannon entropy H(P) in bits as a measure of predictive uncertainty."""
    entropy = 0.0
    for p in probabilities:
        if p > 1e-12:
            entropy -= p * math.log2(p)
    return float(round(entropy, 4))


def platt_calibrate(raw_score: float, a: float = 1.2, b: float = -0.5) -> float:
    """
    Applies Platt scaling logistic transformation to calibrate raw uncalibrated scores
    P(y=1|x) = 1 / (1 + exp(-(a * x + b)))
    """
    logit = a * raw_score + b
    calibrated = 1.0 / (1.0 + math.exp(-max(-50.0, min(50.0, logit))))
    return float(round(calibrated, 4))


def calculate_uncertainty(scores: List[float]) -> Dict[str, float]:
    """Computes distribution statistics, normalized probabilities, and entropy uncertainty."""
    if not scores:
        return {"entropy": 0.0, "maxProbability": 0.0, "uncertaintyLevel": 1.0}

    probs = softmax(scores)
    entropy = shannon_entropy(probs)
    max_p = max(probs)
    
    # Normalized entropy between 0 and 1
    max_possible_entropy = math.log2(len(scores)) if len(scores) > 1 else 1.0
    normalized_entropy = entropy / max_possible_entropy if max_possible_entropy > 0 else 0.0

    return {
        "entropy": entropy,
        "normalizedEntropy": round(normalized_entropy, 4),
        "maxProbability": round(max_p, 4),
        "uncertaintyLevel": round(normalized_entropy, 4)
    }
