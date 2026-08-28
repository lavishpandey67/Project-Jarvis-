import os
import time
import uuid
import json
import urllib.request
import urllib.error
from enum import Enum
from typing import Dict, Any, Optional, List


class ProviderState(str, Enum):
    CREDENTIAL_MISSING = "CREDENTIAL_MISSING"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    AUTHENTICATED = "AUTHENTICATED"
    CAPABILITY_UNVERIFIED = "CAPABILITY_UNVERIFIED"
    CAPABILITY_VERIFIED = "CAPABILITY_VERIFIED"
    RATE_LIMITED = "RATE_LIMITED"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    PROTOCOL_ERROR = "PROTOCOL_ERROR"
    HEALTHY = "HEALTHY"


class ModelExecutionResult:
    """Structured contract metadata returned by all model providers."""

    def __init__(
        self,
        provider: str,
        model: str,
        output_text: str,
        latency_ms: float,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        estimated_cost_usd: float = 0.0,
        status: str = "LOCAL_VERIFIED",
        provider_state: Optional[str] = None,
        http_status: Optional[int] = None,
        fallback_used: bool = False,
        error_message: Optional[str] = None,
        usage_metadata: Optional[Dict[str, Any]] = None,
    ):
        self.request_id = f"req_{uuid.uuid4().hex[:12]}"
        self.provider = provider
        self.model = model
        self.output_text = output_text
        self.latency_ms = round(latency_ms, 2)
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = prompt_tokens + completion_tokens
        self.estimated_cost_usd = round(estimated_cost_usd, 6)
        self.status = status  # High level status, e.g. "REAL_RUNTIME_VERIFIED", "HEALTHY", "FAILED"
        self.provider_state = provider_state or status
        self.http_status = http_status
        self.fallback_used = fallback_used
        self.error_message = error_message
        self.usage_metadata = usage_metadata or {}
        self.timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "requestId": self.request_id,
            "provider": self.provider,
            "model": self.model,
            "outputText": self.output_text,
            "latencyMs": self.latency_ms,
            "tokenUsage": {
                "promptTokens": self.prompt_tokens,
                "completionTokens": self.completion_tokens,
                "totalTokens": self.total_tokens,
            },
            "estimatedCostUsd": self.estimated_cost_usd,
            "status": self.status,
            "providerState": self.provider_state,
            "httpStatus": self.http_status,
            "fallbackUsed": self.fallback_used,
            "errorMessage": self.error_message,
            "usageMetadata": self.usage_metadata,
            "timestamp": self.timestamp,
        }


def discover_gemini_capabilities(api_key: Optional[str] = None) -> Dict[str, Any]:
    """Capability discovery step: queries ListModels endpoint to verify credential and available models."""
    t0 = time.time()
    key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY")

    if not key:
        return {
            "provider": "GeminiProvider",
            "status": ProviderState.CREDENTIAL_MISSING.value,
            "supportedOperations": [],
            "models": [],
            "latencyMs": round((time.time() - t0) * 1000, 2),
            "lastVerified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": "GEMINI_API_KEY environment variable is missing",
        }

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "aistudio-build", "Accept": "application/json"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            dt = (time.time() - t0) * 1000
            data = json.loads(resp.read().decode("utf-8"))
            raw_models = data.get("models", [])
            
            supported_models = []
            all_operations = set()

            for m in raw_models:
                m_name = m.get("name", "")
                methods = m.get("supportedGenerationMethods", [])
                for method in methods:
                    all_operations.add(method)
                supported_models.append({
                    "name": m_name,
                    "displayName": m.get("displayName", ""),
                    "supportedMethods": methods,
                })

            return {
                "provider": "GeminiProvider",
                "status": ProviderState.CAPABILITY_VERIFIED.value,
                "supportedOperations": list(all_operations),
                "models": supported_models,
                "latencyMs": round(dt, 2),
                "lastVerified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "error": None,
            }
    except urllib.error.HTTPError as e:
        dt = (time.time() - t0) * 1000
        try:
            err_json = json.loads(e.read().decode("utf-8"))
            err_msg = err_json.get("error", {}).get("message", e.reason)
        except Exception:
            err_msg = str(e.reason)

        state = ProviderState.AUTHENTICATION_FAILED.value
        if e.code == 429:
            state = ProviderState.RATE_LIMITED.value
        elif e.code >= 500:
            state = ProviderState.PROVIDER_UNAVAILABLE.value

        return {
            "provider": "GeminiProvider",
            "status": state,
            "supportedOperations": [],
            "models": [],
            "latencyMs": round(dt, 2),
            "lastVerified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": f"HTTP {e.code}: {err_msg}",
        }
    except Exception as e:
        dt = (time.time() - t0) * 1000
        return {
            "provider": "GeminiProvider",
            "status": ProviderState.PROVIDER_UNAVAILABLE.value,
            "supportedOperations": [],
            "models": [],
            "latencyMs": round(dt, 2),
            "lastVerified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": str(e),
        }


class RealGeminiProvider:
    """Real Gemini Provider performing actual REST requests with complete telemetry."""

    def invoke_model(
        self,
        model_name: str,
        prompt: str,
        api_key: Optional[str] = None,
    ) -> ModelExecutionResult:
        t0 = time.time()
        key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY")

        if not key:
            latency = (time.time() - t0) * 1000
            return ModelExecutionResult(
                provider="GeminiProvider",
                model=model_name,
                output_text="",
                latency_ms=latency,
                status="FAILED",
                provider_state=ProviderState.CREDENTIAL_MISSING.value,
                http_status=None,
                fallback_used=False,
                error_message="GEMINI_API_KEY environment variable is missing",
            )

        # Normalize model identifier
        clean_model = model_name if model_name.startswith("models/") else f"models/{model_name}"
        url = f"https://generativelanguage.googleapis.com/v1beta/{clean_model}:generateContent?key={key}"

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ]
        }
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "aistudio-build",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                latency = (time.time() - t0) * 1000
                res_data = json.loads(resp.read().decode("utf-8"))
                
                # Extract text output
                candidates = res_data.get("candidates", [])
                out_text = ""
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    out_text = "".join(p.get("text", "") for p in parts)

                # Extract tokens
                usage = res_data.get("usageMetadata", {})
                p_tokens = usage.get("promptTokenCount", len(prompt.split()))
                c_tokens = usage.get("candidatesTokenCount", len(out_text.split()))

                return ModelExecutionResult(
                    provider="GeminiProvider",
                    model=model_name,
                    output_text=out_text,
                    latency_ms=latency,
                    prompt_tokens=p_tokens,
                    completion_tokens=c_tokens,
                    estimated_cost_usd=round((p_tokens * 0.00000015) + (c_tokens * 0.00000060), 6),
                    status="HEALTHY",
                    provider_state=ProviderState.HEALTHY.value,
                    http_status=resp.status,
                    fallback_used=False,
                    error_message=None,
                    usage_metadata=usage,
                )

        except urllib.error.HTTPError as e:
            latency = (time.time() - t0) * 1000
            err_msg = ""
            try:
                err_payload = json.loads(e.read().decode("utf-8"))
                err_msg = err_payload.get("error", {}).get("message", str(e.reason))
            except Exception:
                err_msg = str(e.reason)

            # Map exact provider state
            if e.code == 400 or e.code == 401 or e.code == 403:
                p_state = ProviderState.AUTHENTICATION_FAILED.value
            elif e.code == 404:
                p_state = ProviderState.MODEL_UNAVAILABLE.value
            elif e.code == 429:
                p_state = ProviderState.RATE_LIMITED.value
            elif e.code >= 500:
                p_state = ProviderState.PROVIDER_UNAVAILABLE.value
            else:
                p_state = ProviderState.PROTOCOL_ERROR.value

            return ModelExecutionResult(
                provider="GeminiProvider",
                model=model_name,
                output_text="",
                latency_ms=latency,
                status="FAILED",
                provider_state=p_state,
                http_status=e.code,
                fallback_used=False,
                error_message=f"HTTP {e.code}: {err_msg}",
            )

        except Exception as e:
            latency = (time.time() - t0) * 1000
            return ModelExecutionResult(
                provider="GeminiProvider",
                model=model_name,
                output_text="",
                latency_ms=latency,
                status="FAILED",
                provider_state=ProviderState.PROVIDER_UNAVAILABLE.value,
                http_status=None,
                fallback_used=False,
                error_message=f"Network/Execution Error: {str(e)}",
            )


class RealModelProviderHarness:
    """Unified harness executing real API calls when credentials exist or returning structured failure states."""

    def __init__(self):
        self.gemini_provider = RealGeminiProvider()

    def discover_capabilities(self, provider_name: str = "GeminiProvider") -> Dict[str, Any]:
        if provider_name == "GeminiProvider":
            return discover_gemini_capabilities()
        return {
            "provider": provider_name,
            "status": ProviderState.PROVIDER_UNAVAILABLE.value,
            "error": f"Discovery not implemented for {provider_name}",
        }

    def invoke_model(self, provider_name: str, model_name: str, prompt: str) -> ModelExecutionResult:
        if provider_name == "GeminiProvider":
            return self.gemini_provider.invoke_model(model_name, prompt)

        # Non-Gemini providers without credentials
        t0 = time.time()
        time.sleep(0.001)
        latency = (time.time() - t0) * 1000
        fallback_output = f"[LOCAL_SYNTHESIS_FALLBACK] Output for prompt: '{prompt[:40]}...'"
        return ModelExecutionResult(
            provider="LocalDeterministicSynthesis",
            model="jarvis-local-synthesis-v1",
            output_text=fallback_output,
            latency_ms=max(latency, 0.01),
            prompt_tokens=len(prompt.split()),
            completion_tokens=20,
            estimated_cost_usd=0.0,
            status="BLOCKED_CREDENTIALS_MISSING",
            provider_state=ProviderState.CREDENTIAL_MISSING.value,
            fallback_used=True,
            error_message=f"Environment credentials for '{provider_name}' missing. Falling back to local deterministic synthesis.",
        )
