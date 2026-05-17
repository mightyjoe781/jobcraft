"""Unified LLM provider abstraction — Anthropic and OpenAI."""
import time
import uuid
from dataclasses import dataclass
from typing import AsyncGenerator

# Per-token pricing in USD
_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {
        "input": 3.00 / 1_000_000,
        "output": 15.00 / 1_000_000,
        "cache_read": 0.30 / 1_000_000,
        "cache_write": 3.75 / 1_000_000,
    },
    "gpt-4o": {
        "input": 2.50 / 1_000_000,
        "output": 10.00 / 1_000_000,
        "cache_read": 1.25 / 1_000_000,
        "cache_write": 0.0,
    },
    "gpt-4o-mini": {
        "input": 0.15 / 1_000_000,
        "output": 0.60 / 1_000_000,
        "cache_read": 0.075 / 1_000_000,
        "cache_write": 0.0,
    },
    "claude-haiku-4-5-20251001": {
        "input": 0.80 / 1_000_000,
        "output": 4.00 / 1_000_000,
        "cache_read": 0.08 / 1_000_000,
        "cache_write": 1.00 / 1_000_000,
    },
}


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0


@dataclass
class LLMResponse:
    content: str | dict
    usage: TokenUsage


def _calc_cost(model: str, inp: int, out: int, cr: int, cw: int) -> float:
    p = _PRICING.get(model, _PRICING["claude-sonnet-4-6"])
    return inp * p["input"] + out * p["output"] + cr * p["cache_read"] + cw * p["cache_write"]


class AnthropicProvider:
    def __init__(self) -> None:
        from app.config import settings
        import anthropic
        if not settings.jobcraft_anthropic_key:
            raise ValueError("LLM_PROVIDER=anthropic requires JOBCRAFT_ANTHROPIC_KEY to be set in .env")
        self._client = anthropic.AsyncAnthropic(api_key=settings.jobcraft_anthropic_key)
        self._model = settings.llm_model or "claude-sonnet-4-6"

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider_name(self) -> str:
        return "anthropic"

    def _parse_usage(self, u) -> TokenUsage:
        inp = u.input_tokens or 0
        out = u.output_tokens or 0
        cr = getattr(u, "cache_read_input_tokens", 0) or 0
        cw = getattr(u, "cache_creation_input_tokens", 0) or 0
        return TokenUsage(inp, out, cr, cw, _calc_cost(self._model, inp, out, cr, cw))

    async def create(
        self,
        *,
        system: list[dict],
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_choice: dict | None = None,
        max_tokens: int,
    ) -> LLMResponse:
        kwargs: dict = dict(
            model=self._model, max_tokens=max_tokens,
            system=system, messages=messages,
        )
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice or {"type": "auto"}
        response = await self._client.messages.create(**kwargs)
        usage = self._parse_usage(response.usage)
        if tools:
            tool_block = next(b for b in response.content if b.type == "tool_use")
            return LLMResponse(content=tool_block.input, usage=usage)
        return LLMResponse(content=response.content[0].text, usage=usage)

    async def stream(
        self,
        *,
        system: list[dict],
        messages: list[dict],
        max_tokens: int,
        usage_out: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        async with self._client.messages.stream(
            model=self._model, max_tokens=max_tokens,
            system=system, messages=messages,
        ) as s:
            async for chunk in s.text_stream:
                yield chunk
            if usage_out is not None:
                try:
                    # get_final_message() is synchronous in the Anthropic SDK
                    msg = s.get_final_message()
                    u = self._parse_usage(msg.usage)
                    usage_out.update(
                        input_tokens=u.input_tokens,
                        output_tokens=u.output_tokens,
                        cache_read_tokens=u.cache_read_tokens,
                        cache_write_tokens=u.cache_write_tokens,
                        cost_usd=u.cost_usd,
                    )
                except Exception:
                    pass  # usage tracking is best-effort; don't break streaming


class OpenAIProvider:
    def __init__(self) -> None:
        from app.config import settings
        if not settings.openai_api_key:
            raise ValueError("LLM_PROVIDER=openai requires OPENAI_API_KEY to be set in .env")
        import openai
        self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.llm_model or "gpt-4o-mini"

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider_name(self) -> str:
        return "openai"

    @staticmethod
    def _convert_tools(tools: list[dict]) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t["input_schema"],
                },
            }
            for t in tools
        ]

    @staticmethod
    def _convert_tool_choice(tc: dict) -> dict:
        if tc.get("type") == "tool":
            return {"type": "function", "function": {"name": tc["name"]}}
        return {"type": "auto"}

    @staticmethod
    def _system_text(system: list[dict]) -> str:
        return " ".join(s["text"] for s in system if s.get("type") == "text")

    def _build_messages(self, system: list[dict], messages: list[dict]) -> list[dict]:
        return [{"role": "system", "content": self._system_text(system)}, *messages]

    def _parse_usage(self, u) -> TokenUsage:
        inp = u.prompt_tokens or 0
        out = u.completion_tokens or 0
        cr = 0
        if hasattr(u, "prompt_tokens_details") and u.prompt_tokens_details:
            cr = getattr(u.prompt_tokens_details, "cached_tokens", 0) or 0
        return TokenUsage(inp, out, cr, 0, _calc_cost(self._model, inp, out, cr, 0))

    async def create(
        self,
        *,
        system: list[dict],
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_choice: dict | None = None,
        max_tokens: int,
    ) -> LLMResponse:
        import json
        kwargs: dict = dict(
            model=self._model, max_tokens=max_tokens,
            messages=self._build_messages(system, messages),
        )
        if tools:
            kwargs["tools"] = self._convert_tools(tools)
            kwargs["tool_choice"] = self._convert_tool_choice(tool_choice or {})
        response = await self._client.chat.completions.create(**kwargs)
        usage = self._parse_usage(response.usage)
        if tools:
            fn_call = response.choices[0].message.tool_calls[0].function
            return LLMResponse(content=json.loads(fn_call.arguments), usage=usage)
        return LLMResponse(content=response.choices[0].message.content, usage=usage)

    async def stream(
        self,
        *,
        system: list[dict],
        messages: list[dict],
        max_tokens: int,
        usage_out: dict | None = None,
    ) -> AsyncGenerator[str, None]:
        response = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=self._build_messages(system, messages),
            stream=True,
            stream_options={"include_usage": True},
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
            if chunk.usage and usage_out is not None:
                u = self._parse_usage(chunk.usage)
                usage_out.update(
                    input_tokens=u.input_tokens,
                    output_tokens=u.output_tokens,
                    cache_read_tokens=u.cache_read_tokens,
                    cache_write_tokens=u.cache_write_tokens,
                    cost_usd=u.cost_usd,
                )


_provider: AnthropicProvider | OpenAIProvider | None = None


def get_llm_provider() -> AnthropicProvider | OpenAIProvider:
    global _provider
    if _provider is None:
        from app.config import settings
        if settings.llm_provider == "anthropic":
            _provider = AnthropicProvider()
        elif settings.llm_provider == "openai":
            _provider = OpenAIProvider()
        else:
            raise ValueError(
                f"Unknown LLM_PROVIDER: {settings.llm_provider!r}. Use 'anthropic' or 'openai'."
            )
    return _provider


async def log_ai_usage(
    db,
    user_id: uuid.UUID,
    feature: str,
    usage: TokenUsage,
    duration_ms: int,
    cache_hit: bool = False,
) -> None:
    from app.models.ai_usage import AiUsageLog
    provider = get_llm_provider()
    log = AiUsageLog(
        user_id=user_id,
        feature=feature,
        provider=provider.provider_name,
        model=provider.model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        estimated_cost_usd=usage.cost_usd,
        result_cache_hit=cache_hit,
        duration_ms=duration_ms,
    )
    db.add(log)
    await db.commit()
