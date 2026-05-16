# PRD: Job-First UX Refactor

## Introduction

JobCraft's current navigation is resume-first: users start by managing base resumes, then navigate to "Tailor Resume", then check ATS scores in a separate "Analyze" tab, then track in "Applications". This is backwards. Users think job-first: "I found a posting at Stripe — let me get ready to apply."

This refactor restructures the entire UX around jobs as the primary entity. Every resume action (tailoring, scoring, cover letter) happens within the context of a specific job. The Applications page becomes the hub. The Dashboard shows an actionable pipeline, not abstract charts.

---

## Goals

- Make "Apply to Job" the single, obvious entry point for the core workflow
- Make Applications the hub where all job-specific work (variants, ATS, cover letter, status) lives in one place
- Remove all cross-tab navigation required to complete one job application
- Dashboard shows live pipeline status, not abstract analytics
- Variants are scoped to jobs — users never see a global variants list
- Fork action builds a growing library of quality base resumes over time
- Reduce nav items from 8 to 4 active items

---

## New Navigation Structure

```
Dashboard          ← pipeline view of active jobs by status
Apply to Job       ← primary CTA / new application entry point
My Resumes         ← base resumes only (variants removed from here)
Auto-Apply         ← locked (Phase 4)
Discover Jobs      ← locked (Phase 5)
```

**Removed from top nav** (accessible within job cards):
- Tailor Resume → replaced by "Apply to Job" and "Re-tailor" within job
- Analyze (ATS Score + Skill Gaps) → within job card
- Cover Letters → within job card
- Variants tab → within job card

---

## User Stories

---

### US-R01: "Apply to Job" page — step 1: job input
**Description:** As a user, I want to paste a job URL or JD text and have the system extract the job details so I don't have to fill everything in manually.

**Acceptance Criteria:**
- [ ] `/apply` route renders a full-page "Apply to a Job" form
- [ ] Two input options: URL field with "Fetch" button, or paste JD textarea directly
- [ ] "Fetch" calls existing `POST /api/jobs/fetch-jd` and auto-fills company, role, JD text fields
- [ ] Company, role title, and JD text fields are individually editable after auto-fill
- [ ] "Continue" button is disabled until JD text and role title are present
- [ ] Typecheck passes
- [ ] Verify in browser: paste URL → fetch → fields auto-populate

---

### US-R02: "Apply to Job" page — step 2: base resume selection with suggestion
**Description:** As a user, I want the system to suggest which of my base resumes best matches the JD so I don't have to guess.

**Acceptance Criteria:**
- [ ] After JD is entered, step 2 shows cards for each base resume the user has
- [ ] Each card shows: label, source type badge, variant count
- [ ] The card with the highest keyword overlap with the JD is highlighted with a "Suggested" badge
- [ ] Keyword overlap is computed client-side (simple word match against JD text) — no API call needed
- [ ] User can select any card; selected card gets a highlighted border
- [ ] If user has no base resumes, show empty state with "Create a base resume first" linking to `/resumes`
- [ ] Typecheck passes
- [ ] Verify in browser: two base resumes shown, one marked suggested

---

### US-R03: "Apply to Job" page — step 3: tailor and preview
**Description:** As a user, I want to configure tailoring and see the PDF result inline without leaving the page so the full flow stays in one place.

**Acceptance Criteria:**
- [ ] Step 3 shows aggressiveness selector (conservative / balanced / aggressive radio) and optional custom instruction
- [ ] "Tailor Resume" button triggers the existing tailor API flow with SSE streaming progress
- [ ] Progress steps animate in-place on the same page (no navigation)
- [ ] On completion: split view — left shows tailored PDF via PdfViewer; right shows action panel
- [ ] Action panel contains: Download PDF, ATS Score (links to job detail with ATS tab open), Save & Track (saves application), Re-tailor (resets to step 3)
- [ ] "Save & Track" creates or updates the Application record and navigates to `/applications/{id}`
- [ ] Typecheck passes
- [ ] Verify in browser: full flow end-to-end on one page

---

### US-R04: Applications page — job card hub
**Description:** As a user, I want the Applications page to show all my jobs as expandable cards where I can do everything — see variants, score ATS, generate cover letters, update status — without navigating away.

**Acceptance Criteria:**
- [ ] `/applications` shows a card list sorted by `updated_at` desc
- [ ] Each card (collapsed): company name, role title, status pill (colour-coded), ATS score badge, variant count, days since created
- [ ] Clicking a card expands it in-place (no modal, no navigation)
- [ ] Expanded card sections (tabbed or stacked):
  - **Variants** — list of tailored variants for this job; each row has preview, download, set-as-active, delete; "Re-tailor" button at top creates a new variant for this job
  - **ATS Score** — shows latest score with breakdown bars; "Score latest variant" button; score history sparkline if multiple scores exist
  - **Cover Letter** — shows existing or "Generate" button; inline streaming textarea editor; copy / export PDF
  - **Skill Gaps** — shows existing gap analysis or "Analyze" button; grouped gap list with status toggles
  - **Details** — editable: company, role, JD text, JD URL, referral contact, notes, follow-up date; status quick-set bar; delete button
- [ ] Status changes update immediately via `PATCH /api/applications/{id}`
- [ ] "Re-tailor" within a job card pre-fills the Apply page with this job's data and skips step 1
- [ ] Typecheck passes
- [ ] Verify in browser: expand card, switch between Variants / ATS / Cover Letter / Details tabs

---

### US-R05: Variants within job card
**Description:** As a user, I want to see and manage all tailored variants for a specific job within that job's card so I never need to visit a global variants tab.

**Acceptance Criteria:**
- [ ] Variants tab in job card lists all `resume_variants` where `job_id` matches, ordered newest first
- [ ] Each variant row: creation date, aggressiveness label (if stored), ATS score badge, Preview button (PdfViewer modal), Download button, "Set as active" button, Delete button
- [ ] "Set as active" calls `PATCH /api/applications/{id}` with `resume_variant_id` to link this variant to the application
- [ ] Active variant is indicated with a checkmark badge
- [ ] "Re-tailor" button at the top of the Variants tab navigates to `/apply?job_id={id}` with step 1 pre-filled and skipped
- [ ] Delete removes variant (with confirmation); nulls application FK first
- [ ] "Fork as Base Resume" button on each variant row: prompts for label, creates new base resume from that variant's tex
- [ ] Typecheck passes
- [ ] Verify in browser: variants list, preview modal, fork action

---

### US-R06: Dashboard — pipeline view
**Description:** As a user, I want the dashboard to show my active jobs organized by status so I can see my pipeline at a glance and take action.

**Acceptance Criteria:**
- [ ] Dashboard replaces the current chart-heavy layout with a kanban-style pipeline
- [ ] Columns (horizontal scroll on mobile): Saved | Tailoring | Applied | OA/Screen | Interview | Offer | Rejected
- [ ] Each column shows a count badge and stacked job mini-cards
- [ ] Mini-card shows: company, role, ATS score badge, days in current status, overdue follow-up indicator
- [ ] Clicking a mini-card navigates to `/applications` with that card expanded
- [ ] "Apply to a Job" button is prominent at the top of the dashboard (primary CTA)
- [ ] "Offer" and "Interview" columns are visually highlighted (green accent)
- [ ] Empty state: if no applications yet, show a large CTA: "Apply to your first job →"
- [ ] Stats strip below the pipeline: total active, avg ATS score, interview rate (only shown when data exists)
- [ ] Typecheck passes
- [ ] Verify in browser: pipeline renders, mini-cards show, CTA navigates to /apply

---

### US-R07: Nav restructure
**Description:** As a developer, I need to update the sidebar navigation to reflect the new job-first structure.

**Acceptance Criteria:**
- [ ] Sidebar active items: Dashboard, Apply to Job, My Resumes
- [ ] Locked items: Auto-Apply, Discover Jobs (unchanged)
- [ ] "Apply to Job" uses a distinct visual treatment (e.g. accent background) to signal it's the primary action
- [ ] "Tailor Resume" nav item removed
- [ ] "Analyze" nav item removed
- [ ] "Cover Letters" nav item removed (was already accessible within application context)
- [ ] "Variants" sub-tab removed from Resumes (variants now live inside job cards)
- [ ] Resumes page only shows "My Resumes" tab (no Variants tab)
- [ ] All old routes (`/tailor`, `/ats`, `/analyze`, `/skill-gaps`, `/cover-letters`) redirect appropriately:
  - `/tailor` → `/apply`
  - `/ats` → `/applications`
  - `/analyze` → `/applications`
  - `/skill-gaps` → `/applications`
  - `/cover-letters` → `/applications`
- [ ] Typecheck passes
- [ ] Verify in browser: nav shows correct items, old routes redirect

---

### US-R08: "Apply to Job" — pre-filled from existing job (re-tailor)
**Description:** As a user, I want to click "Re-tailor" from within a job card and land on the Apply page with step 1 already complete so I don't re-enter the JD.

**Acceptance Criteria:**
- [ ] `/apply?job_id={id}` loads job data from `GET /api/jobs/{id}` and pre-fills step 1 fields
- [ ] Step 1 is shown as "completed" (collapsed summary: company + role); user can click to re-open and edit
- [ ] Step 2 (base resume selection) and step 3 (tailor) behave normally
- [ ] On tailor completion, the existing Application record is updated (not a new one created)
- [ ] Typecheck passes
- [ ] Verify in browser: navigate to /apply?job_id=X — step 1 pre-filled and collapsed

---

### US-R09: My Resumes — remove Variants tab, add Fork entry point
**Description:** As a user, I want My Resumes to only show base resumes, and I want to be able to fork good variants directly from job cards without a global variants list.

**Acceptance Criteria:**
- [ ] `/resumes` shows only the "My Resumes" tab — Variants tab removed
- [ ] `/resumes?tab=variants` redirects to `/resumes`
- [ ] `ResumesPage` uses a single-tab layout without the tab switcher
- [ ] Fork action (from job card Variants tab) prompts for a label and creates a new base resume — identical behaviour to existing fork but triggered from the job context
- [ ] After fork, a toast/alert confirms "Forked as '{label}' — now available in My Resumes"
- [ ] Typecheck passes
- [ ] Verify in browser: /resumes shows only base resumes, fork creates new entry

---

## Functional Requirements

- FR-1: `/apply` is the new primary entry point; `POST /api/jobs` and `POST /api/tailor` are called from within it
- FR-2: `/apply?job_id={id}` pre-fills step 1 from an existing job and skips to step 2
- FR-3: The Applications page fetches variants, ATS scores, cover letters, and skill gaps for each job on expand (lazy-loaded per card, not on page load)
- FR-4: Variants are no longer accessible via `/resumes?tab=variants`; all variant management happens within job cards at `/applications`
- FR-5: Dashboard pipeline columns are determined by `Application.status`; cards are clickable links to the expanded job card
- FR-6: "Apply to Job" nav item links to `/apply` and uses a distinct accent style
- FR-7: Keyword-match suggestion in step 2 runs client-side: split JD text into words, count matches against each base resume's label and source type — no extra API call
- FR-8: ATS scoring within a job card scores the application's active `resume_variant_id`; if none set, scores the most recent variant for this job
- FR-9: Cover letter generation within a job card pre-fills `job_id` and `resume_variant_id` from the application context
- FR-10: Skill gap analysis within a job card pre-fills `job_id` and uses the user's first base resume as default; user can switch
- FR-11: All old top-level routes (`/tailor`, `/ats`, `/analyze`, `/skill-gaps`) redirect to avoid broken links

---

## Non-Goals

- No drag-and-drop between pipeline columns (status changed via dropdown/pills only)
- No kanban drag in the Dashboard — cards are read-only pipeline display
- No AI suggestion of aggressiveness level — user still picks manually
- No change to how the Celery worker processes tailoring or ATS scoring
- No change to the backend API routes (only new frontend composition)
- No mobile-first design (tablet minimum, same as current)
- No bulk actions on the Applications hub in this refactor

---

## Design Considerations

- **Apply to Job page**: multi-step wizard feel — numbered steps, completed steps show a checkmark summary. Steps do not use separate routes; all state is in-component.
- **Job cards on Applications page**: the expanded card should feel like a mini-app. Use tabs (Variants / ATS / Cover Letter / Skill Gaps / Details) within the expanded area, not a long scrollable panel.
- **Dashboard pipeline**: horizontal scrolling column layout. Each column is fixed-width (220px). Cards are compact (company + role + 2 badges). Not a full kanban — no drag.
- **"Apply to Job" nav item**: visually distinct — accent background (`bg-accent/20 text-accent`) even when not active, full accent when active.
- **Empty state**: Dashboard empty state is the first-time user welcome — large card with "Apply to your first job" CTA. Should feel motivating not sparse.
- **Reuse existing components**: `PdfViewer`, `PdfDownloadLink`, `TemplatePickerModal`, `StatusSelect`, `AtsScoreBadge` — no redesign of these.

---

## Technical Considerations

- **Lazy loading in job cards**: fetch variants/ATS/cover letters/skill gaps only when the card is expanded, not on Applications page mount. Use `useEffect` triggered by `expandedId` change.
- **Apply page state machine**: use a `step: 1 | 2 | 3 | 'result'` local state; no URL-based step routing (avoids back-button confusion mid-flow).
- **Keyword suggestion** (step 2): `const score = (resumeLabel + resumeSourceType).toLowerCase().split(/\s+/).filter(w => jdWords.has(w)).length` — pure client computation, no debounce needed.
- **Re-tailor pre-fill**: `GET /api/jobs/{id}` is already implemented in the tailor router — use it.
- **Variants lazy fetch**: `GET /api/resumes/variants?job_id={id}` — the existing list endpoint already supports filtering; add `job_id` query param to backend.
- **ATS within job card**: reuse `submitVariantScore` from `api/ats.ts` — already takes `resume_variant_id`.
- **Cover letter within job card**: reuse `streamGenerate` from `api/coverLetters.ts` — pre-fill `job_id` and `resume_variant_id`.
- **No new DB migrations required** — this is purely frontend restructuring with minor backend additions.

---

## Backend Addition Required

One small backend change: add `job_id` filter to the variants list endpoint.

```
GET /api/resumes/variants?job_id={uuid}   — filter variants by job
```

Add to `routers/resumes.py`: `job_id: uuid.UUID | None = Query(default=None)` and filter accordingly.

---

## Success Metrics

- User can go from "found a job posting" to "tailored PDF downloaded" without visiting more than one page
- Applications page shows all information needed to manage a job application without navigating away
- Dashboard gives an immediate answer to "where am I in my job search?" within 3 seconds of opening the app
- Nav item count drops from 8 active to 3 active (Dashboard, Apply to Job, My Resumes)

---

## Open Questions

- Should "Apply to Job" be a full page or a slide-over drawer? Full page was decided — keeps focus and allows the split PDF preview.
- Should step 2 (base resume selection) be skippable if the user only has one base resume? Yes — auto-select it and move to step 3 immediately.
- Should completed applications (Offer / Rejected / Withdrawn) be hidden by default on the Dashboard pipeline? Suggested: collapse them behind a "Show closed" toggle.
