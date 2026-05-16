# PRD: Admin Statistics Dashboard

## Introduction

The admin panel currently shows individual user management. The operator (admin) has no way to see platform-wide health at a glance — how many users are active, how much content has been generated, how much the Anthropic API is costing in total, or whether the storage volume is growing. This feature adds a **Statistics** tab to the existing Admin Panel that surfaces platform-wide aggregate metrics.

This is admin-only. Regular users cannot see these numbers.

---

## Goals

- Admin can see total counts for all major entities (users, resumes, variants, jobs, AI calls)
- Admin can see platform-wide AI cost (total and this month)
- Admin can see growth trend (users joined per week over last 8 weeks)
- Admin can see activity health (AI calls per day, last 7 days)
- Stats load fast — all computed server-side in a single endpoint call
- Reuses existing visual components (stat cards, bar charts from DashboardPage)

---

## User Stories

---

### US-STAT-01: Platform stats backend endpoint
**Description:** As a developer, I need a single admin endpoint that returns all platform-wide aggregate statistics so the frontend can display them efficiently.

**Acceptance Criteria:**
- [ ] `GET /api/admin/stats` requires `get_admin_user` dependency (403 for non-admins)
- [ ] Response includes:
  ```json
  {
    "users": { "total": 12, "active": 11, "disabled": 1, "new_this_week": 2 },
    "resumes": { "base_resumes": 34, "variants": 87 },
    "jobs": { "total_tracked": 156, "applications": 142 },
    "ai": {
      "tailor_runs_total": 203,
      "tailor_runs_this_month": 41,
      "estimated_cost_total_usd": 8.12,
      "estimated_cost_this_month_usd": 1.64
    },
    "content": {
      "ats_scores": 98,
      "cover_letters": 23,
      "skill_gaps": 312
    },
    "growth": [
      { "week": "May 10", "users": 3, "tailor_runs": 12 }
    ],
    "daily_activity": [
      { "date": "May 15", "tailor_runs": 8, "ats_scores": 5 }
    ]
  }
  ```
- [ ] `growth`: user registrations + tailor runs grouped by week for last 8 weeks
- [ ] `daily_activity`: tailor runs + ATS scores per day for last 7 days
- [ ] All counts use SQLAlchemy aggregate queries (no N+1)
- [ ] Python syntax check passes

---

### US-STAT-02: Statistics tab in Admin Panel
**Description:** As an admin, I want a Statistics tab in the User Management panel so I can see platform-wide health at a glance.

**Acceptance Criteria:**
- [ ] "Statistics" tab added to Admin Panel alongside "Users" and "Registration"
- [ ] Tab is the first tab (default when navigating to /admin)
- [ ] Typecheck passes
- [ ] Verify in browser: Statistics tab visible, defaults to it on load

---

### US-STAT-03: Top-line stat cards
**Description:** As an admin, I want a row of at-a-glance numbers for the most important metrics.

**Acceptance Criteria:**
- [ ] 4 stat cards displayed in a 2×2 or 4-column grid:
  - **Total Users** — `users.total` with sub-label "X disabled"
  - **Resumes & Variants** — `base_resumes` base / `variants` variants
  - **AI Tailor Runs** — total (this month in sub-label with cost)
  - **Jobs Tracked** — total jobs + applications count
- [ ] Cards use same `StatCard` component style as DashboardPage
- [ ] Typecheck passes
- [ ] Verify in browser: 4 cards render with correct values

---

### US-STAT-04: Content breakdown
**Description:** As an admin, I want to see counts for all generated content types so I understand what features are being used.

**Acceptance Criteria:**
- [ ] Section titled "Generated Content" with a compact stat grid:
  - ATS Scores run
  - Cover Letters generated
  - Skill Gaps tracked
  - New users this week
- [ ] Each item shows a count with a descriptive label
- [ ] Typecheck passes
- [ ] Verify in browser: content section renders

---

### US-STAT-05: User growth + activity charts
**Description:** As an admin, I want simple charts showing user growth and AI activity over time so I can spot trends.

**Acceptance Criteria:**
- [ ] **User growth bar chart** — new user registrations per week, last 8 weeks (reuse recharts `BarChart`)
- [ ] **Daily AI activity line chart** — tailor runs per day, last 7 days (reuse recharts `LineChart`)
- [ ] Empty state shown for each chart if no data
- [ ] Typecheck passes
- [ ] Verify in browser: both charts render with axes and tooltips

---

### US-STAT-06: API client for admin stats
**Description:** As a developer, I need a typed API function to fetch admin stats so the frontend can call the endpoint cleanly.

**Acceptance Criteria:**
- [ ] `getAdminStats()` added to `frontend/src/api/admin.ts`
- [ ] `AdminStats` TypeScript interface matches the backend response shape
- [ ] Typecheck passes

---

## Functional Requirements

- FR-1: `GET /api/admin/stats` is admin-only (403 for anyone else)
- FR-2: All aggregate counts are computed in a single DB round-trip per entity type (no per-user loops)
- FR-3: Growth and daily activity data covers last 8 weeks / 7 days respectively
- FR-4: "Statistics" is the default tab when `/admin` is first opened
- FR-5: Estimated cost uses the same formula as user stats: `tailor_runs × $0.04`
- FR-6: Stats are fetched once on tab mount — no auto-refresh (manual page reload to update)
- FR-7: Loading skeleton shown while fetching

---

## Non-Goals

- No real-time updates or WebSocket polling
- No per-user breakdown on this page (that's the user stats modal)
- No storage volume metrics (filesystem stats not easily accessible from app layer)
- No export to CSV
- No date-range picker — fixed windows (7d / 8w / this month / all-time)
- No comparison to previous period

---

## Design Considerations

- **Reuse existing components**: `StatCard` from `DashboardPage`, recharts `BarChart`/`LineChart` already imported
- **Layout**: same padding/card style as rest of admin panel
- **Tab order**: Statistics | Users | Registration (Statistics first = default)
- **Empty state**: if the platform is fresh (0 users beyond admin), show "No data yet" per section gracefully

---

## Technical Considerations

- The endpoint queries across all users (no `user_id` filter) — admin privilege enforced by dependency
- Growth chart groups by `date_trunc('week', created_at)` on `users` and `activity_log` tables
- Daily activity groups by `date_trunc('day', created_at)` on `activity_log` where `action = 'tailored'` and `ats_scores` where `status = 'complete'`
- All queries use SQLAlchemy `func.count()` and `func.date_trunc()` — no raw SQL
- Frontend: `AdminStats` interface lives in `api/admin.ts` alongside existing admin types

---

## New API Endpoint

```
GET /api/admin/stats → AdminStats (see shape in US-STAT-01)
```

---

## Success Metrics

- Admin can answer "how many users do I have?" in under 3 seconds of opening the panel
- All 4 stat cards + 2 charts render without errors on a fresh stack
- No N+1 queries — endpoint completes in < 500ms with 50 users

---

## Open Questions

- Should the cost estimate be shown with a disclaimer that it's approximate? **Yes** — add "(estimated)" label under the cost figure.
- Should disabled users be excluded from "active" count or counted separately? **Counted separately** — show total and call out disabled users in the sub-label.
