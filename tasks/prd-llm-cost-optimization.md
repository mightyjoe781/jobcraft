# PRD: LLM Cost Optimization — Caching, Token Tracking, Multi-Provider

## Introduction

JobCraft makes AI calls across 5 features (resume tailoring, ATS scoring, cover letter generation, skill gap analysis, and AI field fill). All 5 already use Anthropic's ephemeral prompt caching on system prompts, but there are three gaps:

1. **No result-level caching** — identical inputs (same JD + same resume) re-call the API every time, wasting money on repeated requests.
2. **No real token tracking** — costs are estimated at a fixed $0.04/tailor run; actual input/output/cache token counts are never recorded.
3. **Single provider** — only Anthropic is supported; there is no path to use OpenAI models or switch providers without code changes.

This PRD covers adding Redis result caching, logging real token usage to Postgres, surfacing accurate cost data in the admin dashboard, and abstracting the LLM client so the provider (Anthropic or OpenAI) is configured via environment variables with no user-facing model selection.

---

## Goals

- Eliminate redundant LLM calls for identical inputs across all 5 AI features via content-hash-keyed Redis caching
- Record actual input/output/cache token counts and estimated cost per AI call to Postgres
- Show real token costs, cache hit rates, and per-feature breakdowns in the admin stats dashboard
- Allow switching between Anthropic and OpenAI by changing two `.env` variables (`LLM_PROVIDER`, `LLM_API_KEY` or `OPENAI_API_KEY`), with no user-facing model selector
- Replace the hardcoded `$0.04` per-tailor estimate with real token-based cost across all 5 features

---

## User Stories

### US-001: LLM Provider Abstraction Layer
**Description:** As a developer, I want a unified LLM client interface so that all AI features work identically regardless of whether Anthropic or OpenAI is configured.

**Acceptance Criteria:**
- [ ] New file `api/app/services/llm.py` exports `get_llm_provider()` factory
- [ ] `get_llm_provider()` reads `LLM_PROVIDER` env var (values: `anthropic` | `openai`, default: `anthropic`)
- [ ] `AnthropicProvider` wraps existing `AsyncAnthropic`, preserves `cache_control` on system prompts, supports tool use
- [ ] `OpenAIProvider` wraps `AsyncOpenAI`, maps tool use to OpenAI function-calling format, silently ignores `cache_control`
- [ ] Both providers expose `.create(messages, system, tools, max_tokens) → LLMResponse` and `.stream(messages, system, max_tokens) → AsyncGenerator[str]`
- [ ] `LLMResponse` dataclass contains `content: str | dict` and `usage: TokenUsage`
- [ ] `TokenUsage` dataclass contains `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`
- [ ] Model pricing table in `llm.py` covers Anthropic Sonnet 4.6 and OpenAI GPT-4o; `cost_usd` is calculated from token counts × per-token price
- [ ] `config.py` gains `llm_provider: str = "anthropic"` and `openai_api_key: str = ""`
- [ ] Typecheck passes

### US-002: OpenAI Provider Wiring
**Description:** As an operator, I want to switch the entire application to use OpenAI GPT-4o by changing `.env`, so I can evaluate costs and quality against Anthropic without touching code.

**Acceptance Criteria:**
- [ ] Setting `LLM_PROVIDER=openai` and `OPENAI_API_KEY=<key>` in `.env` makes all 5 AI features call OpenAI instead of Anthropic
- [ ] Tool use (tailor, ATS, skill gap) works via OpenAI function-calling format
- [ ] Streaming (cover letter) works via OpenAI streaming API
- [ ] If `LLM_PROVIDER=openai` but `OPENAI_API_KEY` is empty, server startup raises a clear `ValueError`
- [ ] Typecheck passes

### US-003: Redis Result Cache
**Description:** As a developer, I want LLM responses to be cached in Redis by content hash so that repeated calls with identical inputs return instantly without hitting the API.

**Acceptance Criteria:**
- [ ] New file `api/app/services/llm_cache.py` with `get_cached()`, `set_cached()`, `cache_key()` functions
- [ ] `cache_key(feature, provider, model, inputs_dict)` returns `sha256("feature:provider:model:" + canonical_json(inputs_dict))`
- [ ] `canonical_json()` sorts keys and strips leading/trailing whitespace from string values before hashing, so minor formatting differences don't produce different keys
- [ ] Cache is stored in Redis under key `llm_cache:{hash}` as JSON
- [ ] `config.py` gains `llm_result_cache_ttl_seconds: int = 604800` (7 days); `0` means no TTL (rely purely on hash-based invalidation)
- [ ] For streaming responses (cover letter): assembled full text is cached; on a cache hit the text is replayed as an async generator chunk-by-chunk at the same chunk size as the original
- [ ] All 5 service files check cache before calling LLM; on a hit the cached result is returned and a `cache_hit=True` usage record is logged
- [ ] Typecheck passes

### US-004: Token Usage DB Logging
**Description:** As an operator, I want actual token counts and cost estimates for every AI call persisted to Postgres so I can audit real spend rather than guessing from fixed estimates.

**Acceptance Criteria:**
- [ ] New SQLAlchemy model `AiUsageLog` in `api/app/models/ai_usage.py` with columns: `id` (uuid PK), `user_id` (FK), `feature` (varchar), `provider` (varchar), `model` (varchar), `input_tokens` (int), `output_tokens` (int), `cache_read_tokens` (int), `cache_write_tokens` (int), `estimated_cost_usd` (numeric 10,6), `result_cache_hit` (bool), `duration_ms` (int), `created_at` (timestamptz default now)
- [ ] Alembic migration creates `ai_usage_logs` table
- [ ] `log_ai_usage(db, user_id, feature, usage, duration_ms, cache_hit)` helper in `llm.py` inserts a row
- [ ] Every AI service function calls `log_ai_usage` after every call (including cache hits with all-zero token counts and `result_cache_hit=True`)
- [ ] `rate_limiter.py` `check_daily_budget()` queries real cost from `ai_usage_logs` for today instead of counting estimated tailor runs at $0.04
- [ ] Budget check covers all 5 features, not just tailoring
- [ ] Typecheck passes

### US-005: Update All 5 AI Services
**Description:** As a developer, I want all 5 AI service functions to use the new provider abstraction, result cache, and usage logger so that no feature still calls the Anthropic SDK directly.

**Acceptance Criteria:**
- [ ] `api/app/services/ai.py` (`fill_resume_placeholders`) uses `get_llm_provider()` + cache + logs usage
- [ ] `api/app/services/tailor.py` (`run_tailoring`) uses `get_llm_provider()` + cache + logs usage
- [ ] `api/app/services/cover_letter.py` (`generate_cover_letter`) uses `get_llm_provider()` + streaming cache + logs usage
- [ ] `api/app/services/ats.py` (`score_resume`) uses `get_llm_provider()` + cache + logs usage
- [ ] `api/app/services/skill_gap.py` (`analyze_gaps`) uses `get_llm_provider()` + cache + logs usage
- [ ] No direct `anthropic.AsyncAnthropic` imports remain in the 5 service files
- [ ] Typecheck passes

### US-006: Admin Dashboard — Real AI Cost and Cache Stats
**Description:** As an admin, I want to see real token costs, cache hit rates, and per-feature breakdowns in the admin stats dashboard so I can understand actual spend and optimization impact.

**Acceptance Criteria:**
- [ ] New endpoint `GET /api/admin/stats/ai-usage` returns: total tokens (input/output/cache) this month, total cost this month, per-feature breakdown (calls, tokens, cost, cache hit %), per-user top 10 by cost, daily trend for last 30 days
- [ ] `frontend/src/api/admin.ts` gains `fetchAiUsageStats()` typed client
- [ ] `AdminStatsPage.tsx` replaces the `$0.04 × tailor_runs` estimate with real cost from the new endpoint
- [ ] New "AI Token Usage" section shows: total spend this month, cache hit rate (%), tokens saved by caching (estimated), per-feature cost breakdown table
- [ ] Existing charts and user management sections are unaffected
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- **FR-1**: `LLM_PROVIDER` env var (values: `anthropic` | `openai`) selects the active provider at startup; invalid values raise a `ValueError` with a clear message.
- **FR-2**: `JOBCRAFT_ANTHROPIC_KEY` continues to work as the Anthropic API key; `OPENAI_API_KEY` is used when `LLM_PROVIDER=openai`.
- **FR-3**: All 5 AI service functions must check the Redis result cache before calling the LLM API.
- **FR-4**: Cache keys must be deterministic: same feature + provider + model + inputs always produce the same key regardless of Python dict ordering or minor whitespace in inputs.
- **FR-5**: Every LLM call (cache hit or miss) must insert a row into `ai_usage_logs`.
- **FR-6**: For cache hits, `result_cache_hit=True`, all token counts are 0, and `estimated_cost_usd=0`.
- **FR-7**: `estimated_cost_usd` for cache misses must be calculated from actual token counts using the model's per-token price, not a fixed rate.
- **FR-8**: The daily budget check in `rate_limiter.py` must query `ai_usage_logs` for today's real cost across all features, not just tailoring.
- **FR-9**: `GET /api/admin/stats/ai-usage` is accessible only to admin users (same auth as existing admin endpoints).
- **FR-10**: The OpenAI provider must translate Anthropic-style tool definitions into OpenAI function-calling format automatically; service files must not contain provider-specific tool formatting.

---

## Non-Goals

- No user-facing model selector or per-user provider override
- No automatic failover from one provider to another on error (static config only)
- No streaming token counting during streamed responses (token counts logged after stream completes)
- No prompt optimization or rewriting (existing prompts stay as-is)
- No UI for users to view their own token usage (admin only)
- No multi-model routing (one provider, one model per deployment)

---

## Technical Considerations

- Redis is already initialized per-request via `aioredis.from_url(settings.redis_url)` — reuse this pattern in `llm_cache.py`
- Celery worker tasks (tailoring) also need the provider abstraction; `workers/tasks.py` calls `run_tailoring()` which will pick up the change automatically
- OpenAI tool use format uses `"type": "function"` with `"function": {"name": ..., "parameters": ...}` — the `OpenAIProvider` must convert the Anthropic-style tool list to this format
- Anthropic cache tokens (`cache_read_input_tokens`, `cache_creation_input_tokens`) are in the `usage` field of the API response — extract them for accurate cost calculation
- OpenAI does not surface prompt caching tokens in its usage object; `cache_read_tokens` and `cache_write_tokens` will be 0 for OpenAI calls
- The `ai_usage_logs` table will grow quickly; add a Postgres index on `(user_id, created_at)` and `(feature, created_at)` for the admin queries

---

## Success Metrics

- Cache hit rate ≥ 30% within 2 weeks of deployment (users re-run ATS/skill gap on same JD)
- Real cost data available in admin dashboard within 24 hours of deployment
- Budget enforcement covers all 5 AI features (not just tailoring)
- Switching `LLM_PROVIDER=openai` produces working results for all 5 features in under 5 minutes of config change + restart

---

## Open Questions

- Should cache hits count against rate limits? (Current assumption: yes — rate limits are per-hour request counts, not costs)
- Should the `llm_result_cache_ttl_seconds=0` (no TTL) be the default, or should it default to 7 days? PRD defaults to 7 days but this is configurable.
- Should the OpenAI model be configurable (e.g., `gpt-4o` vs `gpt-4o-mini`) or hardcoded to `gpt-4o`?
