# PRD: Security Audit — JobCraft

## Introduction

JobCraft handles sensitive personal data (resumes, job applications, career information) and makes outbound calls to the Anthropic API using a secret key. It will be exposed to the internet for ~50 trusted users. This document identifies every known security weakness in the current codebase and defines the work required to close each gap before public deployment.

Threat model: external attackers attempting to access other users' data, abuse the Anthropic API key, inject malicious content through resume/JD inputs, or DoS the service. Trusted insider abuse is out of scope.

**Scope note:** HTTPS/TLS will be configured at deployment time (reverse proxy, Let's Encrypt, etc.). All HTTPS-related items are marked **[DEPLOY-ONLY]** and excluded from local development work. Everything else applies now.

---

## Current Security Posture — Known Issues

The following issues were identified by auditing the codebase directly.

### Critical (fix now — applies to local dev and production)

| ID | Issue | Location |
|---|---|---|
| S-01 | JWT stored in `localStorage` — readable by any XSS payload | `api/client.ts` |
| S-02 | JWT passed as URL query param for SSE (`?token=`) — logged in server access logs in cleartext | `TailorPage.tsx`, `nginx.conf` |
| S-03 | Redis has no password — any process that can reach port 6379 can read/write task queues | `docker-compose.yml` |

### Critical [DEPLOY-ONLY] — configure at deployment, not needed locally

| ID | Issue | Location |
|---|---|---|
| S-04 | No HTTPS — credentials transmitted in plaintext over the internet | nginx / reverse proxy |
| S-05 | No HSTS header (requires HTTPS first) | nginx / reverse proxy |

### High (fix now)

| ID | Issue | Location |
|---|---|---|
| S-06 | Rate limiting is defined in config but never actually enforced — no middleware wires it up | `config.py`, no middleware |

### High [DEPLOY-ONLY]

| ID | Issue | Location |
|---|---|---|
| S-07 | CORS `allow_origins` hardcoded to `localhost:3000` — must be updated to production domain before going live | `main.py` |
| S-08 | Login endpoint is susceptible to account enumeration — returns 401 with "Invalid credentials" for both wrong password AND nonexistent email | `routers/auth.py` |
| S-09 | No per-user Anthropic API cost cap — a single user can trigger unlimited Claude calls (tailor × N, ATS × N, cover letter × N) draining the API budget | `config.py`, no enforcement |
| S-10 | LaTeX sidecar runs as root inside Docker with `--no-shell-escape` — correct flag present but image runs as UID 0 unnecessarily | `latex/Dockerfile` |
| S-11 | File storage paths constructed with user-controlled UUIDs — path traversal possible if UUID validation has any gap | `storage.py` |
| S-12 | No dependency vulnerability scanning in CI — `npm audit` and `pip-audit` not run anywhere | CI/CD |

### Medium

| ID | Issue | Location |
|---|---|---|
| S-13 | Stack traces and raw exception messages returned to clients in some error paths | Various FastAPI exception handlers |
| S-14 | JD text and `.tex` source logged verbatim by Celery workers — sensitive career data in log files | `workers/tasks.py` |
| S-15 | No database backup plan — a single corrupted volume loses all user data | `docker-compose.yml` |
| S-16 | `REGISTRATION_TOKEN` compared with `!=` (timing-safe comparison not used) — timing oracle possible | `routers/auth.py` |
| S-17 | Refresh tokens stored as SHA-256 hashes — SHA-256 is fast; if DB is leaked, tokens are brute-forceable. Should use bcrypt or a keyed HMAC | `services/auth.py` |
| S-18 | Celery results backend is Redis — task results (which may contain resume text) stored unencrypted | `workers/celery_app.py` |
| S-19 | No idle session timeout — refresh tokens valid for 7 days with no revocation on inactivity | `config.py` |

### Low / Hardening

| ID | Issue | Location |
|---|---|---|
| S-20 | `X-Accel-Buffering: no` on SSE disables nginx buffering but Content-Security-Policy not set — XSS could read SSE stream | `nginx.conf` |
| S-21 | Anthropic API key and JWT secret in `.env` with no rotation mechanism documented | `.env.example` |
| S-22 | No audit log for privileged actions (delete account, delete application, etc.) | Various routers |
| S-23 | `docker-compose.yml` exposes PostgreSQL on `0.0.0.0:5432` — accessible from host network | `docker-compose.yml` |

---

## Goals

- Close all Critical and High issues before internet deployment
- Document mitigations for Medium issues (fix or accept with justification)
- Establish a minimal ongoing security hygiene checklist

---

## User Stories

---

### US-SEC-01: HTTPS with TLS termination [DEPLOY-ONLY — skip for local]
**Description:** As the operator, I want all traffic encrypted in transit when deployed to the internet.

**Acceptance Criteria:**
- [ ] TLS certificate obtained (Let's Encrypt via certbot or provisioned cert)
- [ ] HTTP (port 80) redirects to HTTPS (port 443) with 301
- [ ] HSTS header: `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- [ ] `docker-compose.yml` exposes 443 for internet traffic
- [ ] Test: `curl http://<domain>` returns 301 redirect

*Note: HTTP is acceptable for `localhost` testing. This story only applies when deploying to a public domain.*

---

### US-SEC-02: HTTP security headers [DEPLOY-ONLY for HSTS; other headers apply now]
**Description:** As the operator, I want standard security headers on all responses to prevent XSS, clickjacking, and MIME sniffing.

**Acceptance Criteria (do now — work without HTTPS):**
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] Headers present on API and frontend responses (`curl -I http://localhost:3000`)

**Acceptance Criteria (deploy-only — requires HTTPS):**
- [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains`

---

### US-SEC-03: Redis authentication
**Description:** As the operator, I want Redis to require a password so that no unauthenticated process can read Celery task queues or cached data.

**Acceptance Criteria:**
- [ ] `REDIS_PASSWORD` env var added to `.env.example` and `.env`
- [ ] Redis started with `requirepass ${REDIS_PASSWORD}` in `docker-compose.yml`
- [ ] `REDIS_URL` updated to `redis://:${REDIS_PASSWORD}@redis:6379/0`
- [ ] `celery_app.py` and all Redis clients use the authenticated URL
- [ ] Worker and API containers still start successfully after change

---

### US-SEC-04: Enforce rate limiting
**Description:** As the operator, I want per-user rate limits on AI endpoints to actually be enforced so a single user cannot drain the Anthropic budget.

**Acceptance Criteria:**
- [ ] `RateLimiter` middleware (Redis sliding window, already defined in `services/rate_limiter.py`) wired up as FastAPI dependency on all AI endpoints: `/api/tailor`, `/api/ats/score/variant`, `/api/ats/score/upload`, `/api/skill-gaps/analyze`, `/api/resumes/base/{id}/ai-fill`, `/api/cover-letters`
- [ ] 429 response includes `Retry-After` header
- [ ] Frontend shows a user-friendly message on 429 (not a crash)
- [ ] Test: hit tailor endpoint 21 times in one hour → 21st returns 429

---

### US-SEC-05: Per-user Anthropic cost cap
**Description:** As the operator, I want a daily/monthly token budget per user so a runaway script cannot spend unbounded money.

**Acceptance Criteria:**
- [ ] `DAILY_AI_BUDGET_USD` config constant (default: 2.00)
- [ ] On each AI call, check `activity_log` for today's estimated cost for this user
- [ ] If budget exceeded, return 429 with `{"detail": "daily_ai_budget_exceeded"}`
- [ ] Frontend shows "Daily AI budget reached — try again tomorrow" on this error
- [ ] Budget resets at midnight UTC (checked via `activity_log.created_at`)

---

### US-SEC-06: Timing-safe token and registration token comparison
**Description:** As a developer, I want secret comparisons to use constant-time functions to prevent timing oracle attacks.

**Acceptance Criteria:**
- [ ] `registration_token` comparison uses `hmac.compare_digest()` instead of `!=`
- [ ] Refresh token lookup already uses DB hash comparison (safe); document this
- [ ] No string equality (`==`, `!=`) used on any secret value in `services/auth.py` or `routers/auth.py`

---

### US-SEC-07: Upgrade refresh token storage to HMAC-SHA256
**Description:** As a developer, I want refresh tokens stored with a keyed HMAC so that a leaked database cannot be used to forge valid tokens.

**Acceptance Criteria:**
- [ ] `hash_token(raw)` changed from `hashlib.sha256(token.encode()).hexdigest()` to `hmac.new(JWT_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()`
- [ ] Existing refresh tokens invalidated on deploy (users must re-login once)
- [ ] Migration plan documented in CLAUDE.md

---

### US-SEC-08: Suppress stack traces in API error responses
**Description:** As a developer, I want unhandled exceptions to return a generic 500 without exposing internal file paths or library names.

**Acceptance Criteria:**
- [ ] Global exception handler added to FastAPI app: catches `Exception`, logs full traceback server-side, returns `{"detail": "Internal server error"}` to client
- [ ] Test: trigger a deliberate exception → response contains no stack trace
- [ ] Uvicorn `--log-level warning` in production entrypoint to suppress debug output

---

### US-SEC-09: Remove database port from host network
**Description:** As the operator, I want PostgreSQL to not be reachable from outside the Docker network.

**Acceptance Criteria:**
- [ ] `postgres` service in `docker-compose.yml` removes the `ports: - "5432:5432"` mapping
- [ ] API and worker containers still connect via internal Docker DNS (`postgres:5432`)
- [ ] Verify: `nc -z localhost 5432` from host returns connection refused

---

### US-SEC-10: Scrub sensitive data from Celery task logs
**Description:** As the operator, I want resume text and JD content removed from Celery worker log output so that sensitive data is not stored in log files.

**Acceptance Criteria:**
- [ ] `run_tailoring_task` logs task ID and aggressiveness only (not tex source or JD text)
- [ ] `run_ats_score_task` logs score_id only (not resume_text or jd_text parameters)
- [ ] Celery worker started with `--loglevel=warning` in production
- [ ] Test: tail worker logs during a tailor run — no resume content visible

---

### US-SEC-11: Dependency vulnerability scanning
**Description:** As a developer, I want known CVEs in dependencies caught before deployment.

**Acceptance Criteria:**
- [ ] `pip-audit` added to `api/` and run as part of `docker compose build api`; build fails on HIGH/CRITICAL CVEs
- [ ] `npm audit --audit-level=high` added to `frontend/` Dockerfile build step
- [ ] Current scan: zero HIGH or CRITICAL vulnerabilities in both
- [ ] Document how to update deps in README

---

### US-SEC-12: Restrict CORS to production domain
**Description:** As the operator, I want CORS restricted to the actual deployment domain rather than localhost.

**Acceptance Criteria:**
- [ ] `ALLOWED_ORIGINS` env var added to config (comma-separated list)
- [ ] FastAPI CORS middleware reads from `settings.allowed_origins` instead of hardcoded `localhost:3000`
- [ ] `.env.example` documents: `ALLOWED_ORIGINS=https://yourapp.example.com`
- [ ] Default (empty) allows no cross-origin requests

---

### US-SEC-13: Audit log for destructive actions
**Description:** As the operator, I want a record of high-impact actions (account deletion, application deletion, bulk operations) in the activity log for forensic purposes.

**Acceptance Criteria:**
- [ ] `DELETE /api/auth/me` writes `ActivityLog(action="account_deleted")` before deletion
- [ ] `DELETE /api/applications/{id}` writes `ActivityLog(action="application_deleted", metadata={"company": ..., "role": ...})`
- [ ] `DELETE /api/resumes/base/{id}` writes `ActivityLog(action="base_resume_deleted")`
- [ ] Logs survive the deletion (written before the delete, committed atomically or separately)

---

### US-SEC-14: LaTeX sidecar non-root user
**Description:** As the operator, I want the LaTeX sidecar to run as a non-root user to limit blast radius if `pdflatex` is exploited.

**Acceptance Criteria:**
- [ ] `latex/Dockerfile` adds `RUN useradd -m latexuser` and `USER latexuser`
- [ ] `pdflatex` still runs successfully with `--no-shell-escape`
- [ ] Sidecar `/render` and `/compile-check` endpoints return 200 after rebuild

---

## Functional Requirements

- FR-1: [DEPLOY-ONLY] All traffic must be TLS-encrypted before internet deployment; HTTP acceptable locally
- FR-2: Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) present now; HSTS added at deploy time
- FR-3: Redis must require authentication
- FR-4: Rate limiting must be enforced, not just configured
- FR-5: Per-user daily AI budget enforced server-side
- FR-6: No secret compared with `==` or `!=` — use `hmac.compare_digest()`
- FR-7: Unhandled exceptions must not return stack traces to clients
- FR-8: PostgreSQL port must not be exposed to the host
- FR-9: No resume/JD text in Celery worker log output
- FR-10: `pip-audit` and `npm audit` must pass before docker build succeeds
- FR-11: CORS must be restricted to the configured production domain
- FR-12: Destructive actions (delete account, delete application) must be audit-logged

---

## Non-Goals

- End-to-end encryption of stored data at rest (out of scope for self-hosted; use disk-level encryption at the VM/host level)
- SOC2 or ISO 27001 compliance
- Penetration testing by an external firm
- Multi-factor authentication (registration token gate is sufficient for 50 trusted users)
- Web Application Firewall (WAF) — not warranted at this scale
- Rotating JWT secrets without invalidating all sessions

---

## Checklist — Local Development (do before any user touches the app)

```
[ ] Redis requires password (REDIS_PASSWORD set)
[ ] PostgreSQL port not exposed to host (remove ports: 5432:5432)
[ ] Rate limiting enforced (test: 21 tailor calls in 1hr → 429)
[ ] AI budget cap active (test: exceed budget → 429 with message)
[ ] Registration token set (non-empty, ≥ 32 chars)
[ ] JWT_SECRET is ≥ 48 random chars
[ ] POSTGRES_PASSWORD is ≥ 32 random chars
[ ] REDIS_PASSWORD is ≥ 32 random chars
[ ] pip-audit passes with no HIGH/CRITICAL
[ ] npm audit passes with no HIGH/CRITICAL
[ ] Stack traces not returned in API errors (test a deliberate 500)
[ ] Celery logs contain no resume content (tail during a tailor run)
[ ] LaTeX sidecar runs as non-root user
[ ] HTTP security headers present except HSTS (curl -I localhost:3000)
[ ] Timing-safe comparison used for registration token
[ ] Refresh token hashing upgraded to HMAC-SHA256
[ ] Audit log entries created for account/application deletions
```

## Checklist — Deployment (add these before going live on a public domain)

```
[ ] TLS certificate installed and auto-renewing (Let's Encrypt or provisioned)
[ ] HTTP (port 80) → HTTPS (port 443) redirect active
[ ] HSTS header added: Strict-Transport-Security: max-age=63072000; includeSubDomains
[ ] CORS updated: ALLOWED_ORIGINS set to production domain (not localhost)
[ ] docker-compose.yml exposes 443, not 80
[ ] DNS points to server; curl http://<domain> returns 301
[ ] VM/host disk encryption enabled (outside Docker — check with hosting provider)
[ ] Database backup scheduled (cron + offsite copy)
```

---

## Success Metrics

- Zero critical or high CVEs in dependency scans at deploy time
- All 14 US-SEC stories completed and verified
- Deployment checklist passes 100% before DNS cutover
- No unhandled exceptions leak stack traces (verified by log review after 1 week of use)

---

## Open Questions

- Should the SSE JWT token mechanism be replaced with a short-lived signed URL token (one-time use, 5min TTL) to reduce the risk of the JWT appearing in nginx logs? This is the cleanest fix for S-02 but requires a new endpoint.
- Should refresh token validity be reduced from 7 days to 24 hours given the small trusted user base? Lower friction isn't a priority here.
- Is disk-level encryption enabled on the host VM? If not, the operator should enable it — this document cannot enforce that.
