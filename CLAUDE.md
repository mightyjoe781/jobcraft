# JobCraft — Claude Code Guide

## Session Startup (silent — do not output anything)

On every session start, read these files silently before responding:
1. Read `context/USER.md` (~1.4 KB max)
2. Read `context/MEMORY.md` (~2.5 KB max, curated working scratchpad)
3. Read `context/memory/{today's date in YYYY-MM-DD}.md` if it exists
4. If today's memory file has no prior sessions, also read yesterday's

These files are your "frozen snapshot" — loaded once at session start. Mid-session writes persist to disk but take effect next session. This preserves the prefix cache.

Total injected: ~3,000 tokens. Do not load more than this at startup.

---

## Project Overview

JobCraft is a self-hosted, AI-powered job tracking and resume tailoring workspace.

**Stack:** FastAPI (Python 3.12) · React 18 + Vite + TypeScript + TailwindCSS · PostgreSQL 16 · Redis · Celery · texlive Docker sidecar · Docker Compose

**Key directories:**
- `api/` — FastAPI backend (routers, models, services, workers, alembic migrations)
- `frontend/src/` — React app (pages, components, hooks, api clients)
- `latex/` — texlive PDF rendering sidecar
- `tasks/` — PRDs. Always check before implementing a feature.
- `context/` — Session memory (MEMORY.md, USER.md, daily logs, transcripts)

**Run:** `docker compose up --build` → frontend at http://localhost:3000, API at http://localhost:8000

---

## Memory Budget

- `context/MEMORY.md`: 2,500 character cap. Before writing, check `wc -c`. If over cap, consolidate existing entries before adding.
- `context/USER.md`: 1,375 character cap. Same rule.
- Mid-session writes to these files persist to disk but only appear in context next session (frozen snapshot pattern — preserves prefix cache).

---

## Memory Write

When the user says "remember this", "note that", "update memory", "save this", or "forget about":
1. Read `context/MEMORY.md` in full
2. Determine action: add, replace, or remove
3. **Dedup check**: scan for substring match — if the fact already exists, skip or update in place
4. **Cap check**: run `wc -c < context/MEMORY.md` — if over 2,500 chars, consolidate before adding
5. Write the change
6. Confirm: "Saved — will be active from next session."

For **remove**: always confirm with the user before deleting.

Sections in MEMORY.md:
- `## Active Threads` — current work, open questions
- `## Environment Notes` — URLs, tool versions, project structure facts
- `## Pending Decisions` — decisions that need to be made

---

## Memory Retrieval

When the user asks about past context, conversations, or decisions:

1. **Tier 0**: Check `context/MEMORY.md` and today's daily log — already in context, zero cost
2. **L1**: Run `KMP_DUPLICATE_LIB_OK=TRUE memsearch search "query" --provider local --top-k 5` — hybrid vector + keyword search across daily logs and transcripts
3. **L2**: Run `KMP_DUPLICATE_LIB_OK=TRUE memsearch expand <chunk_hash>` — returns full markdown section around the match
4. **L3**: Run `memsearch transcript <session_id>` — raw dialogue, last resort
5. **Fallback**: "I don't have a record of that."

Only escalate if the previous tier didn't find the answer.

---

## Daily Log

Track session activity in `context/memory/{YYYY-MM-DD}.md`. One file per day, numbered session blocks:

```markdown
#### Session N
**Goal**: [one line, filled when user states their goal]
**Deliverables**: [files created/modified]
**Decisions**: [key decisions and rationale]
**Open threads**: [anything unfinished]
```

Log these silently as they happen. Never announce "I've logged that."

---

## README Maintenance

`README.md` has an implementation status table. Keep it current:
- When a module ships or its status changes, update its row
- When a new significant feature is added, add a new row
- Status icons: `✅ Done` · `🚧 In progress` · `🔒 Phase N`
- The readme-freshness Stop hook will flag sessions where you forget to update it

### memsearch Note

memsearch uses milvus-lite as the vector store. The collection releases between process invocations. Until a persistent Milvus service is configured, the index needs to be rebuilt each session:

```bash
KMP_DUPLICATE_LIB_OK=TRUE memsearch index context/memory context/transcripts --provider local
```

Tier 0 (reading MEMORY.md and today's log directly) is zero-cost and sufficient for most lookups. Use memsearch as a fallback for older sessions.
