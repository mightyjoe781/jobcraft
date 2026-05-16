# JobCraft — Product Requirements Document

## Vision

A self-hosted, AI-powered job application workspace that takes the friction out of tailoring resumes, tracking applications, and beating ATS filters — all from a single web interface. Designed to scale from a personal tool to a multi-user SaaS product.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), TypeScript, TailwindCSS |
| Backend | FastAPI (Python) |
| AI | Anthropic Claude API (claude-sonnet-4-6) with prompt caching |
| PDF Rendering | LaTeX → PDF via `tectonic` or `pdflatex` in Docker |
| Database | PostgreSQL (via SQLAlchemy + Alembic) |
| File Storage | Local filesystem (Docker volume) now → S3-compatible object store when public |
| Containerization | Docker + Docker Compose |
| Task Queue | Celery + Redis (async PDF rendering, ATS scoring) |
| Auth | JWT-based (FastAPI Users or custom) with email/password; OAuth (Google) as Phase 2 |

---

## Storage & Format Design Principle

**`.tex` is the canonical format.** Every resume in JobCraft — whether created from a platform template, assembled in the editor, or uploaded — is stored and manipulated as a `.tex` source file. Rendered PDFs are derived artifacts; if deleted they can always be regenerated from the `.tex`. No feature operates on PDFs as its primary input except the external ATS upload flow.

All file references (`.tex` sources, rendered PDFs, uploaded resumes) are stored as **opaque paths** in Postgres. The storage backend is abstracted behind a `StorageService` interface so swapping local disk for S3/GCS requires changing one env var, not the data model. File paths use the format `{backend}://{bucket_or_volume}/{key}` internally.

---

## Phased Rollout

| Phase | Scope |
|---|---|
| **MVP** | Auth + user profile + resume tailoring + PDF preview + ATS scoring + application tracker |
| **Phase 2** | Cover letter generator + skill gap analysis + dashboard analytics |
| **Phase 3** | Chrome extension for application tracker import |
| **Phase 4** | Auto-apply engine (Playwright-based, Greenhouse/Lever/Ashby) |
| **Phase 5** | Job discovery + saved searches + multi-user / team features |

Phases 3–5 are surfaced in the UI as **"Coming Soon"** tabs so the navigation structure is established early and the design intent is clear.

---

## Module 1 — Auth & User Profile (MVP, Critical)

**Goal:** Secure, minimal auth that doesn't get in the way. Every resource is scoped to a user.

**Features:**

- **Registration / Login** — email + password; bcrypt hashing; JWT access + refresh tokens
- **Session management** — refresh token rotation; logout invalidates token
- **User profile page:**
  - Display name, email (read-only after registration), avatar (initials fallback)
  - Default AI tailoring preferences: aggressiveness level (conservative / balanced / aggressive), preferred resume tone
  - Linked accounts panel (Google OAuth — Phase 2 placeholder shown but disabled)
  - Danger zone: delete account + all data
- **Protected routes** — all app routes require valid JWT; unauthenticated users land on login page
- **Future-proof schema** — user table includes `plan` field (free / pro) and `org_id` for future team scoping; unused now but schema is ready

---

## Module 2 — Resume Management (MVP)

**Goal:** Manage base `.tex` resumes and all tailored variants. Users can start from a platform-provided template, build one in the editor, or upload an existing `.tex` — every path produces the same first-class `.tex` source that all other modules consume.

### 2a — Platform Template Library

The platform ships a curated set of `.tex` resume templates stored at the system level (`storage/system/templates/`). Templates are read-only system assets; users derive their own base resume from them.

**Bundled templates (initial set):**

| Template | Best for | Layout |
|---|---|---|
| `ats-clean` | SDE, general engineering | Single column, no graphics |
| `ats-data` | Data engineering / data science | Single column, skills-first |
| `ats-minimal` | Any role, ultra-clean | Single column, no color |
| `two-column-modern` | Roles where design matters | Two column, subtle color |
| `academic` | Research / PhD applications | Single column, publications section |

- **Template gallery** — card grid showing a small PDF thumbnail, template name, category badge, and "Use this template" CTA
- **Preview** — click any template card to see a full rendered PDF preview before choosing
- **Category filter** — filter by role type (Engineering, Data, Research, Design, General)
- **Template metadata** — each template has a `README` section embedded in a `%% JOBCRAFT` comment block at the top of the `.tex` describing its sections, placeholder conventions (e.g., `%%FULLNAME%%`, `%%SUMMARY%%`), and any required LaTeX packages

### 2b — Resume Creation Flow

Three paths to creating a base resume, all producing a `.tex` source:

**Path 1 — From template:**
1. User picks a template from the gallery
2. UI opens a split-panel: Monaco `.tex` editor on the left, live PDF preview on the right (preview re-renders on save or manual trigger to avoid thrashing)
3. User fills in their details directly in `.tex`; placeholder comments guide each section
4. Optional: **AI fill assist** — user pastes their background as free text (LinkedIn bio, old resume copy), Claude rewrites the `.tex` placeholders using that content; user reviews and edits
5. Save → becomes a named base resume

**Path 2 — Upload own `.tex`:**
- Upload an existing `.tex` file; give it a label
- Platform validates it compiles without errors (render attempt in the latex sidecar)
- On success, stored as base resume; user can open it in the editor to modify

**Path 3 — Fork a variant:**
- Any tailored variant can be promoted to a new base resume ("Fork as base")
- Useful when a heavily tailored version becomes the new canonical document

### 2c — Base Resume Editor

- **Monaco editor** — full `.tex` syntax highlighting, bracket matching, multi-cursor
- **Live preview pane** — renders PDF on demand (button trigger, not keystroke); displays inline without leaving the page
- **Compile error panel** — if `tectonic` returns a non-zero exit, show the raw LaTeX error log in a collapsible panel below the editor
- **Section navigator** — sidebar listing detected `\section{}` blocks as jump links
- **Save history** — every explicit save creates a snapshot; user can diff or restore any snapshot (stored as `base_resume_snapshots` in DB)

### 2d — Base Resume List & Variants

- **Base resume cards** — label, template origin (if applicable), last modified, PDF thumbnail, variant count; actions: open editor, preview PDF, fork, delete
- **Variant history per base** — table listing all tailored variants: job title, company, ATS score badge, created date, download PDF / `.tex`, promote to base
- **Storage abstraction** — `StorageService.put(path, bytes)` / `StorageService.get(path)` wraps local disk; path stored in Postgres; no direct filesystem references in business logic

---

## Module 3 — Resume Tailor (MVP, Core)

**Goal:** Given a base `.tex` resume and a job description, produce a lightly modified resume optimized for that specific job.

**Features:**

- **Input form:**
  - Select base resume (dropdown of user's uploaded bases)
  - Paste JD text directly, or enter a job posting URL for auto-fetch and parse
  - Tailoring aggressiveness slider: conservative (reorder bullets only) / balanced / aggressive (rewrite bullets)
  - Optional custom instruction field (e.g., "emphasize distributed systems experience")
- **AI tailoring — what Claude does:**
  - Reorders bullet points to surface JD-relevant experience first
  - Adjusts summary / objective line to echo JD language
  - Swaps synonyms to match JD terminology (e.g., "data pipeline" → "ETL pipeline" if JD uses that phrasing)
  - At aggressive level: rewrites individual bullets to be more quantified or role-specific
  - **Hard constraint:** never fabricates experience, certifications, companies, dates, or metrics
- **Streaming progress** — SSE stream from backend to UI with live status messages ("Analyzing JD...", "Modifying bullets...", "Compiling PDF...")
- **Diff view** — side-by-side `.tex` diff (original vs modified) so user can review changes before finalizing
- **PDF preview** — inline rendered PDF displayed on the same page via `<iframe>`; no navigation away from the page
- **Actions:** Download PDF, Download `.tex`, Regenerate (re-run with same or adjusted settings), Save as named variant
- **Auto-save** — variant is persisted to DB automatically after successful render; user can rename or discard

---

## Module 4 — ATS Score & Analysis (MVP, Core)

**Goal:** Simulate ATS evaluation and give actionable, specific feedback.

**Features:**

- **Two entry points:**
  1. Score a tailored variant already in the system (no upload needed)
  2. Upload any external PDF resume + paste a JD for ad-hoc scoring
- **PDF parsing** — extract text via `pdfplumber`; fall back to `pymupdf` for scanned or complex layouts
- **AI evaluation — Claude scores on:**
  - Keyword match rate (hard skills, tools, certifications mentioned in JD)
  - Semantic relevance of experience to JD requirements
  - Formatting compliance (single column, no graphics, standard section headers)
  - Action verb strength and variety
  - Quantification of achievements (% of bullets with numbers / metrics)
  - Education and seniority level match
- **Score output:**
  - Overall ATS score (0–100)
  - Per-category breakdown returned as structured JSON via Claude `tool_use`
  - Radar / spider chart visualization in the UI
- **Missing keywords panel** — high-priority JD terms absent from resume, with suggested insertion points (e.g., "Add 'Kafka' to your Skills section or the data pipeline bullet in Role X")
- **Ranked improvements list** — specific, actionable edits sorted by estimated score impact
- **Tailor from score** — one-click: take a scored upload and send it through Module 3 as the starting base
- **Score history** — track score across versions for the same job to show improvement arc

---

## Module 5 — Application Tracker (MVP)

**Goal:** A lightweight but complete CRM for the job search.

**Features:**

- **Application record fields:** company, role title, JD URL, JD text snapshot, resume variant used, status, applied date, source (manual), referral contact, notes, follow-up date
- **Status pipeline:** `Saved` → `Tailoring` → `Applied` → `OA / Phone Screen` → `Interview` → `Offer` → `Rejected` / `Withdrawn`
- **Kanban board** — drag-and-drop cards between status columns; card shows company name, role, ATS score badge, days in current status
- **Table view** — sortable / filterable list with inline status dropdown and notes field
- **Per-application detail page:**
  - All fields editable inline
  - Activity timeline (status changes + notes, timestamped)
  - Linked artifacts: tailored PDF, ATS score breakdown
  - Follow-up date picker with overdue highlighting
- **Quick-add** — minimal form (company + role + URL) to capture a job fast; fill details later
- **Bulk actions** — mark multiple as rejected, archive, export to CSV
- **Stats sidebar** — response rate, interview rate, offer rate; updated in real time
- **Chrome Extension placeholder** — "Import from browser extension — coming soon" hint in the quick-add form; no functionality, establishes the design pattern

---

## Module 6 — Cover Letter Generator (Phase 2)

**Goal:** Generate targeted, non-generic cover letters from the same JD + resume context.

**Features:**

- Tone selector: formal / conversational / enthusiastic
- Optional personal hook input (e.g., "I met the CTO at PyCon")
- AI generates 3-paragraph letter: specific company interest → resume highlights mapped to JD → call to action
- Rich text editor for manual tweaks post-generation
- Export as PDF or copy as plain text
- Saved templates for reuse across similar roles
- Linked to application record in the tracker

---

## Module 7 — Skill Gap Analysis (Phase 2)

**Goal:** Identify what's missing from the user's profile for a target role and suggest a learning plan.

**Features:**

- Compare JD requirements against resume skills and experience
- Gap report: hard skills, tools/frameworks, domain knowledge, seniority signals
- Priority ranking by frequency across similar JDs (signals market demand)
- Suggested learning resources per gap (course, project idea, certification)
- Track progress per gap: "learning" / "acquired" / "not pursuing"

---

## Module 8 — Dashboard & Analytics (Phase 2)

**Panels:**

- Application funnel (status breakdown — bar or funnel chart)
- ATS score distribution across all tailored resumes
- Response rate and interview conversion rate (rolling 30 days)
- Top missing keywords across all scored JDs (word cloud or ranked bar chart)
- Upcoming follow-ups (next 7 days)
- Skill gap progress summary
- Recent activity feed (last 10 actions across all modules)
- AI usage and cost tracker (tokens used, estimated cost this month)

---

## Module 9 — Chrome Extension: Application Import (Phase 3 — Upcoming)

**UI placeholder:** "Browser Extension — Coming Soon" shown in tracker quick-add and as a navigation hint.

**Planned:** Extension detects job posting pages (LinkedIn, Greenhouse, Lever, Indeed), extracts JD metadata, and POSTs to the JobCraft API to create an application record in one click with the JD pre-filled.

---

## Module 10 — Auto-Apply Engine (Phase 4 — Upcoming)

**UI placeholder:** "Auto-Apply" tab visible in main navigation, locked with a "Coming Soon" badge. Clicking shows a one-sentence description.

**Planned:** Playwright-based headless submission to Greenhouse / Lever / Ashby; mandatory human review gate before any form submission; rate limiting; screenshot receipts stored per application.

---

## Module 11 — Job Discovery (Phase 5 — Upcoming)

**UI placeholder:** "Discover Jobs" tab visible in main navigation, locked with a "Coming Soon" badge.

**Planned:** Saved searches, URL import with auto-scrape, notifications for new matches matching user-defined criteria.

---

## Navigation Structure

The full navigation is present from day one. Locked tabs establish the product roadmap visually and ensure the design accommodates all future modules without restructuring.

```
JobCraft
├── Dashboard                    [Phase 2 — MVP shows placeholder cards]
├── Resumes
│   ├── Template Gallery         [browse & preview platform templates]
│   ├── My Resumes               [base resumes: create, edit, fork]
│   └── Variants / History       [all tailored outputs]
├── Tailor Resume                [MVP — primary flow]
├── ATS Score                    [MVP — primary flow]
├── Applications                 [MVP — tracker]
├── Cover Letters                [Phase 2 — "Coming Soon" badge]
├── Skill Gaps                   [Phase 2 — "Coming Soon" badge]
├── Auto-Apply                   [Phase 4 — locked tab]
└── Discover Jobs                [Phase 5 — locked tab]
```

---

## Data Model (PostgreSQL)

```sql
users
  id, email, password_hash, display_name, avatar_url,
  tailoring_preference (conservative|balanced|aggressive),
  plan (free|pro), org_id, created_at, updated_at

refresh_tokens
  id, user_id, token_hash, expires_at, revoked_at

-- System-owned; not user-scoped; shipped with the platform
resume_templates
  id, slug, name, category, description,
  tex_source_path,           -- storage path to the canonical .tex
  thumbnail_pdf_path,        -- pre-rendered thumbnail PDF
  is_ats_friendly (bool),
  sort_order, created_at, updated_at

-- User's personal base resumes (source of truth: .tex)
base_resumes
  id, user_id, label,
  source_type (template|upload|forked_variant),
  source_template_id (FK → resume_templates, nullable),
  source_variant_id  (FK → resume_variants, nullable),
  tex_source_path,           -- current .tex content
  pdf_cache_path,            -- last rendered PDF; nullable (regenerate if missing)
  created_at, updated_at

-- Point-in-time snapshots of a base resume's .tex (for history/restore)
base_resume_snapshots
  id, base_resume_id, tex_source_path, saved_at

jobs
  id, user_id, company, role_title, jd_text, jd_url, source, created_at

applications
  id, user_id, job_id, resume_variant_id,
  status, applied_at, referral_contact, notes, follow_up_date, created_at

-- Every AI-tailored output; .tex is the primary artifact
resume_variants
  id, user_id, base_resume_id, job_id,
  modified_tex_path,         -- tailored .tex (canonical)
  pdf_path,                  -- rendered PDF (derived; regenerable)
  ats_score, label, created_at

ats_scores
  id, user_id, resume_variant_id, job_id,
  overall_score, breakdown_json, suggestions_json, created_at

cover_letters                -- Phase 2
  id, user_id, job_id, body_text, pdf_path, created_at

skill_gaps                   -- Phase 2
  id, user_id, job_id, category, skill_name, priority, status, created_at

activity_log
  id, user_id, entity_type, entity_id, action, metadata_json, created_at
```

---

## API Surface (FastAPI)

```
# Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/auth/me

# Templates (system-owned, read-only)
GET    /api/templates                          — list all templates with metadata
GET    /api/templates/{id}                     — template detail + .tex source
GET    /api/templates/{id}/pdf                 — stream thumbnail PDF

# Base Resumes
POST   /api/resumes/base                       — create: body includes source_type + template_id or tex upload
GET    /api/resumes/base
GET    /api/resumes/base/{id}
PATCH  /api/resumes/base/{id}                  — update label or tex_source directly
DELETE /api/resumes/base/{id}
GET    /api/resumes/base/{id}/pdf              — stream rendered PDF (render on demand if cache stale)
POST   /api/resumes/base/{id}/render           — explicit render trigger; returns pdf_path
POST   /api/resumes/base/{id}/fork-variant     — promote a variant to new base resume
GET    /api/resumes/base/{id}/snapshots        — list save history
POST   /api/resumes/base/{id}/snapshots        — save current state as snapshot
GET    /api/resumes/base/{id}/snapshots/{sid}  — get snapshot .tex
POST   /api/resumes/base/{id}/ai-fill          — AI fill assist: send background text, get back filled .tex

# Tailor
POST   /api/tailor
GET    /api/tailor/stream/{job_id}        — SSE stream of progress

# Variants
GET    /api/resumes/variants
GET    /api/resumes/variants/{id}
GET    /api/resumes/variants/{id}/pdf     — stream PDF bytes
GET    /api/resumes/variants/{id}/diff    — tex diff JSON
DELETE /api/resumes/variants/{id}

# ATS
POST   /api/ats/score
GET    /api/ats/scores
GET    /api/ats/scores/{id}

# Jobs
POST   /api/jobs
GET    /api/jobs
GET    /api/jobs/{id}
PATCH  /api/jobs/{id}
DELETE /api/jobs/{id}

# Applications
POST   /api/applications
GET    /api/applications
GET    /api/applications/{id}
PATCH  /api/applications/{id}
DELETE /api/applications/{id}
GET    /api/applications/stats

# Cover Letters (Phase 2)
POST   /api/cover-letters
GET    /api/cover-letters/{id}

# Skill Gaps (Phase 2)
POST   /api/skill-gaps/analyze
GET    /api/skill-gaps
PATCH  /api/skill-gaps/{id}

# Dashboard
GET    /api/dashboard/stats
```

---

## Docker Compose Services

```yaml
services:
  api:        # FastAPI + uvicorn, port 8000
  worker:     # Celery worker — PDF rendering, ATS scoring
  redis:      # Celery broker + result backend
  postgres:   # Primary database, port 5432
  frontend:   # React app served via nginx, port 3000
  latex:      # Sidecar with tectonic; POST /render → returns PDF bytes
```

Single `docker compose up` starts the full stack. A `.env` file controls storage backend (`local` or `s3`), Claude API key, JWT secret, and Postgres credentials. No code changes required to switch storage backends.

On first startup, an Alembic migration seeds the `resume_templates` table from the bundled `.tex` files in `api/templates/` and pre-renders their thumbnail PDFs. Template `.tex` files are version-controlled in the repo; adding a new template is a PR, not a DB admin task.

---

## AI Design Principles

- **Prompt caching** — base `.tex` content and system prompts use Anthropic `cache_control` to reduce cost on repeated tailoring calls against the same resume
- **Structured output** — ATS scores and improvement suggestions returned as typed JSON via Claude `tool_use`; no fragile free-text parsing
- **No hallucination guardrail** — tailoring system prompt explicitly forbids inventing experience, companies, dates, certifications, or metrics
- **Streaming** — SSE from FastAPI to React for live progress during tailoring; avoids HTTP timeouts on slow LaTeX compiles
- **Cost tracking** — every Claude call logs input tokens, output tokens, cache hit/miss, and estimated USD cost to `activity_log`; surfaced in the Phase 2 dashboard

---

## Non-Functional Requirements

- **Self-hosted first** — all user data stays local; no third-party analytics or tracking by default
- **Single command startup** — `docker compose up` brings the full stack with no manual setup steps
- **Sub-5s tailoring** — PDF compile + AI tailoring should complete in under 5 seconds for a typical 1-page resume
- **Responsive UI** — usable on tablet for quick status updates; mobile is not a priority for MVP
- **PDF fidelity** — rendered PDF must compile identically to a local `pdflatex` run; no font substitution artifacts
- **Storage portability** — switching from local disk to S3 requires only `STORAGE_BACKEND=s3` + bucket credentials in `.env`; zero code changes
