# PRD: Admin Panel — User & Registration Management

## Introduction

JobCraft is deployed for ~50 trusted users. Currently there is no way to manage users or registration tokens without running raw SQL. This feature adds a lightweight admin role: a designated admin account (configured via `.env`) can access an `/admin` panel to view and manage users, see the current registration token, and issue time-limited invite tokens — without touching the database directly.

Admin is a single-user concept (no multi-admin, no admin roles UI). The admin email is set in `.env` and checked server-side on every admin API call.

---

## Goals

- Admin can log in with a normal account but gets elevated API access
- Admin can view the current registration token without opening the server
- Admin can issue a temporary invite token (expires in N hours) for one-time use
- Admin can list all users, see their join date and plan
- Admin can disable a user account (blocks login without deleting data)
- Admin can delete a user account and all their data
- `.env.example` and `.env` updated with `ADMIN_EMAIL=admin@sudomoon.com`
- Admin panel lives at `/admin` in the frontend — not visible in the sidebar for non-admins

---

## User Stories

---

### US-ADM-01: Admin email in config + seed admin account
**Description:** As a developer, I need the admin email configured in `.env` so the backend can identify admin requests without a DB role column.

**Acceptance Criteria:**
- [ ] `ADMIN_EMAIL=admin@sudomoon.com` added to `.env.example` and `.env`
- [ ] `settings.admin_email: str = ""` added to `config.py`
- [ ] `GET /api/auth/me` response includes `"is_admin": true` when `user.email == settings.admin_email`
- [ ] `UserOut` schema updated with `is_admin: bool` field
- [ ] Typecheck passes

---

### US-ADM-02: Admin auth dependency
**Description:** As a developer, I need a FastAPI dependency that blocks non-admin requests to admin endpoints.

**Acceptance Criteria:**
- [ ] `get_admin_user` dependency in `dependencies.py`: calls `get_current_user`, then checks `user.email == settings.admin_email`, raises `403` if not
- [ ] All `/api/admin/*` routes use this dependency
- [ ] Test: calling an admin endpoint with a non-admin token returns `403 {"detail": "Forbidden"}`
- [ ] Typecheck passes

---

### US-ADM-03: View and manage registration token
**Description:** As an admin, I want to see the current registration token and generate a temporary invite so I can onboard a new user without exposing the permanent token.

**Backend Acceptance Criteria:**
- [ ] `GET /api/admin/registration-token` returns `{"token": "<current REGISTRATION_TOKEN>", "type": "permanent"}`
- [ ] `POST /api/admin/invite` body: `{"hours": 24}` — creates a short-lived invite token stored in Redis with key `invite:{token}`, TTL = hours × 3600; returns `{"token": "...", "expires_in_hours": 24}`
- [ ] `POST /api/auth/register` updated: if `REGISTRATION_TOKEN` is set, accept either the permanent token OR any valid Redis invite key (and consume it on use — `DEL invite:{token}`)
- [ ] `GET /api/admin/invites` returns list of active invite tokens with remaining TTL
- [ ] Typecheck passes

---

### US-ADM-04: List users
**Description:** As an admin, I want to see all registered users so I can monitor who has access.

**Backend Acceptance Criteria:**
- [ ] `GET /api/admin/users` returns list of `{id, email, display_name, plan, is_disabled, created_at}` ordered by `created_at desc`
- [ ] Does NOT return `password_hash` or tokens
- [ ] Typecheck passes

---

### US-ADM-05: Disable / re-enable user
**Description:** As an admin, I want to disable a user account to block their login without deleting their data.

**Backend Acceptance Criteria:**
- [ ] `users` table gets `is_disabled: bool DEFAULT false` column (migration `0004`)
- [ ] `PATCH /api/admin/users/{id}/disable` sets `is_disabled = true`, revokes all refresh tokens
- [ ] `PATCH /api/admin/users/{id}/enable` sets `is_disabled = false`
- [ ] Login endpoint: if `user.is_disabled`, return `403 {"detail": "Account disabled"}`
- [ ] Typecheck passes

---

### US-ADM-06: Delete user
**Description:** As an admin, I want to permanently delete a user and all their data.

**Backend Acceptance Criteria:**
- [ ] `DELETE /api/admin/users/{id}` deletes the user (cascades to all related data via FK)
- [ ] Admin cannot delete their own account via this endpoint (returns `400`)
- [ ] Typecheck passes

---

### US-ADM-07: Admin panel frontend — `/admin` route
**Description:** As an admin, I want an admin panel page accessible at `/admin` so I can manage users and tokens from the UI.

**Acceptance Criteria:**
- [ ] `/admin` route added to `App.tsx`, wrapped in a new `RequireAdmin` component that redirects to `/dashboard` if `user.is_admin` is false
- [ ] `useAuth` exposes `isAdmin: boolean` derived from `user?.is_admin ?? false`
- [ ] Sidebar shows "Admin" nav item only when `isAdmin` is true (below My Resumes, above Auto-Apply locked items)
- [ ] Typecheck passes
- [ ] Verify in browser: non-admin sees no Admin nav item; admin sees it

---

### US-ADM-08: Admin panel — registration token tab
**Description:** As an admin, I want to view the current permanent token and create invite tokens in the UI.

**Acceptance Criteria:**
- [ ] Admin panel has a "Registration" tab
- [ ] Tab shows the permanent token in a copy-to-clipboard field (masked by default, "Show" button reveals it)
- [ ] "Create invite link" form: hours input (default 24, max 168), "Generate" button
- [ ] Generated invite token shown with expiry time and copy button
- [ ] List of active invites shown below with token (masked), expiry countdown, "Revoke" button
- [ ] Typecheck passes
- [ ] Verify in browser: generate invite, see it in list, copy works

---

### US-ADM-09: Admin panel — user management tab
**Description:** As an admin, I want to view and manage users in the UI.

**Acceptance Criteria:**
- [ ] Admin panel has a "Users" tab (default tab)
- [ ] Table shows: display name, email, joined date, plan badge, status (Active / Disabled), actions
- [ ] "Disable" button → ConfirmModal → calls PATCH /api/admin/users/{id}/disable → row updates to Disabled
- [ ] "Enable" button on disabled users → calls PATCH /api/admin/users/{id}/enable
- [ ] "Delete" button → ConfirmModal (danger, names the user) → calls DELETE → row removed
- [ ] Admin row has no Disable/Delete buttons (cannot self-manage)
- [ ] Typecheck passes
- [ ] Verify in browser: user list renders, disable/enable/delete work with modals

---

## Functional Requirements

- FR-1: `ADMIN_EMAIL` in config identifies the admin — no DB role column needed
- FR-2: `GET /api/auth/me` returns `is_admin: true` for the admin email
- FR-3: All `/api/admin/*` endpoints require `get_admin_user` dependency (403 otherwise)
- FR-4: Permanent registration token viewable via API (admin only)
- FR-5: Temporary invite tokens stored in Redis with TTL, consumed on use
- FR-6: `POST /api/auth/register` accepts permanent token OR valid invite token
- FR-7: `users.is_disabled` column blocks login with 403
- FR-8: Admin cannot delete or disable themselves
- FR-9: `/admin` route in frontend only accessible to admin; non-admins redirected
- FR-10: "Admin" nav item hidden from non-admin users
- FR-11: `.env.example` and `.env` contain `ADMIN_EMAIL=admin@sudomoon.com`

---

## Non-Goals

- No multi-admin support (single admin defined in env)
- No admin-specific UI theme or separate login flow
- No audit log for admin actions (users' own actions are already logged)
- No password reset flow via admin (use the DB script for now)
- No per-user AI budget override via UI
- No email sending for invites (copy-paste token)

---

## Technical Considerations

- **Redis invite keys**: `invite:{token}` with TTL. On registration, check Redis before accepting. Use `SET NX` + `EXPIRE` for atomic creation. Delete on use.
- **Admin dependency**: stateless check (`user.email == settings.admin_email`). No DB migration needed for the role itself.
- **`is_disabled` migration**: Alembic `0004` adds `ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT false`.
- **Cascade deletes**: the `DELETE /api/admin/users/{id}` relies on existing FK cascades — test that all user data is removed.
- **`RequireAdmin` component**: wraps a route; checks `useAuth().user?.is_admin`. If not admin and not loading, `<Navigate to="/dashboard" />`.
- **Reuse**: `ConfirmModal` for all destructive admin actions.

---

## Data Model Changes

```sql
-- Migration 0004
ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT false;
```

## New API Endpoints

```
GET    /api/admin/registration-token        → {token, type: "permanent"}
POST   /api/admin/invite                   → {token, expires_in_hours}  body: {hours}
GET    /api/admin/invites                   → [{token_masked, expires_at, remaining_seconds}]
DELETE /api/admin/invites/{token}           → 204 (revoke)
GET    /api/admin/users                     → [{id, email, display_name, plan, is_disabled, created_at}]
PATCH  /api/admin/users/{id}/disable        → {id, is_disabled: true}
PATCH  /api/admin/users/{id}/enable         → {id, is_disabled: false}
DELETE /api/admin/users/{id}               → 204
```

---

## Success Metrics

- Admin can onboard a new user in under 60 seconds (generate invite → share token → user registers)
- Admin can disable a compromised account in under 30 seconds without touching the server
- Zero non-admin users can access any `/api/admin/*` endpoint (403 rate = 100%)

---

## Open Questions

- Should invite tokens be single-use (deleted after first registration) or allow multiple registrations until TTL expires? **Proposed: single-use** (deleted on first successful registration).
- Should the permanent registration token be rotatable from the UI? **Deferred** — requires updating `.env` and restarting the API; out of scope for this PRD.
