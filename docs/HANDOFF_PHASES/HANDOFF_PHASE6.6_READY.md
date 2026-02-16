# SoloEnterprise — Phase 6.6 Handoff: Dashboard Navigation Overhaul

## Current State (2026-02-16)

Phase 6.5 (Client Reporter Agent) is complete. The consulting pipeline now has both business-facing agents: Scoper (before engineering) and Reporter (after engineering). The next step is restructuring the dashboard so users can actually navigate to all the new functionality.

## What's Complete

### Phase 6.5: Client Reporter Agent (COMPLETE)
- `client-reporter-agent.ts` — Sonnet 4.5, generates weekly/milestone/summary reports
- Cost tracking wired into all 6 agents (`cost-tracking-service.ts`)
- 3 API endpoints: POST trigger, GET list, GET latest
- 44 new tests (412 total), Vitest 4.x
- See `docs/HANDOFF_PHASES/HANDOFF_PHASE6.5_COMPLETE.md` for full details

## Pipeline Flow (Current)

```
Client brief (unstructured text)
  → Project Scoper Agent (Opus) → structured project spec + scope document
  → [Human reviews scope]
  → Orchestrator (Opus 4.6) decomposes into tasks
  → Architect Layer (Opus 4.6) generates tech spec per complex task
  → BullMQ queues tasks with dependencies
  → Agents (Sonnet 4.5) execute against spec + SKILL files
  → Output to generated/tasks/{task-id}/
  → Human reviews via dashboard ← THIS DASHBOARD NEEDS BETTER NAVIGATION
  → Client Reporter Agent (Sonnet 4.5) → progress/milestone/blocker reports
  → Output to generated/reports/{project-id}/
```

## Working Agents (7 total)

| Agent | Model | Status |
|-------|-------|--------|
| Project Scoper | Opus | Working — briefs → structured scopes |
| Orchestrator | Opus 4.6 | Working — decomposes, assigns, manages dependencies |
| Backend | Sonnet 4.5 | Working — API routes, DB queries, services |
| Frontend | Sonnet 4.5 | Working — React components, pages, hooks |
| QA | Sonnet 4.5 | Working — Vitest tests, coverage |
| Architect | Opus 4.6 | Working — tech specs (runs in orchestrator pipeline) |
| Client Reporter | Sonnet 4.5 | Working — progress reports, cost tracking |

## Phase 6.6: Dashboard Navigation Overhaul — What to Build

### Purpose

Replace the current top header navigation with a persistent sidebar layout. This is a cosmetic restructure — no new features, no new data fetching. Just reorganizing navigation so existing and upcoming pages are accessible.

### Current Navigation

Top header with links: Dashboard, Questions, etc. Flat, doesn't scale as more sections are added (Reports, Projects, Settings).

### Target: Sidebar Navigation

- **Left sidebar** (persistent, collapsible) replaces top header
- Sidebar sections:
  - **Projects** — main project management view (default landing page)
  - **Tasks** — cross-project task view (existing, moved to sidebar)
  - **Questions** — human question queue (existing, moved to sidebar)
  - **Workers** — worker status panel (existing, moved to sidebar)
  - **Reports** — client reports list (new, from Phase 6.5 APIs)
  - **Settings** — placeholder for future: API keys, provider config, user preferences
- Active section highlighted
- Sidebar collapses to icon-only on small screens
- Top header becomes minimal: SoloEnterprise logo + user avatar

### Tech

- shadcn/ui sidebar component + lucide-react icons
- Update `layout.tsx` to sidebar layout
- Responsive: sidebar collapses on mobile

### Checklist

- [ ] Create sidebar component with navigation items
- [ ] Move existing nav items to sidebar
- [ ] Implement sidebar collapse for mobile
- [ ] Update `layout.tsx`
- [ ] Set Projects as default landing page

### What This Phase Does NOT Include

- No new pages or data fetching
- No Projects table (Phase 6.7)
- No Scope Review UI (Phase 6.8)
- No Reports page content (just the nav link pointing to future page)
- No Settings page content (just the nav link)

### Test Plan

1. All existing pages accessible via sidebar
2. Sidebar collapse/expand works on mobile breakpoint
3. Active section highlighted correctly
4. No broken links or missing routes

## Key Files Reference

### To Modify
- `src/app/layout.tsx` — swap top header for sidebar layout
- `src/components/` — existing navigation components to replace

### Existing Patterns
- shadcn/ui already in use (check `components.json` or `components/ui/`)
- Tailwind CSS for styling
- Next.js App Router for routing

### Pages That Must Be Accessible
- `/projects` — landing page (may be empty shell)
- `/tasks` — existing task monitoring
- `/questions` — existing question queue
- `/workers` — existing (check if it exists as a page or just API)
- `/reports` — new (can be empty shell linking to Phase 6.7+)
- `/errors` — existing error tracking

### Documentation
- Phases roadmap: `docs/SOLOENTERPRISE_PHASES_CURRENT.md`
- Architecture: `docs/MASTER_ARCHITECTURE.md`

## Repo

github.com/mattbara/soloenterprise, `development` branch

---

*Phase 6.6 is a pure UI restructure. It unblocks Phase 6.7 (Projects table) and 6.8 (Scope Review) by establishing the sidebar navigation that those phases plug into.*
