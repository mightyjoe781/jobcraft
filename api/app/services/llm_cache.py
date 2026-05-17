"""Redis result cache for LLM responses — keyed by content hash."""
import hashlib
import json

import redis.asyncio as aioredis

from app.config import settings

_PREFIX = "llm_cache:"


def _canonical_json(d: dict) -> str:
    """Deterministic JSON: sorted keys, stripped string values."""
    def _clean(v):
        if isinstance(v, str):
            return v.strip()
        if isinstance(v, dict):
            return {k: _clean(val) for k, val in sorted(v.items())}
        if isinstance(v, list):
            return [_clean(i) for i in v]
        return v
    return json.dumps(_clean(d), sort_keys=True, ensure_ascii=False)


def cache_key(feature: str, provider: str, model: str, inputs: dict) -> str:
    raw = f"{feature}:{provider}:{model}:{_canonical_json(inputs)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def get_cached(key: str) -> dict | None:
    r = _redis()
    try:
        val = await r.get(f"{_PREFIX}{key}")
        return json.loads(val) if val else None
    finally:
        await r.aclose()


async def set_cached(key: str, value: dict) -> None:
    r = _redis()
    try:
        ttl = settings.llm_result_cache_ttl_seconds
        serialized = json.dumps(value)
        if ttl > 0:
            await r.set(f"{_PREFIX}{key}", serialized, ex=ttl)
        else:
            await r.set(f"{_PREFIX}{key}", serialized)
    finally:
        await r.aclose()
