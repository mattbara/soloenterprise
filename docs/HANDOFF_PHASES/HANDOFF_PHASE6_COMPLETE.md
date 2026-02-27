# Phase 6: Project Scoper Agent — Handover

**Date:** 2026-02-14
**Branch:** `phase-6/project-scoper`
**Status:** ✅ COMPLETE

---

## What Was Built

The Project Scoper Agent takes unstructured client briefs and produces:
1. **Structured YAML scope** — requirements, estimates, risks, gaps, milestones
2. **Client-facing markdown document** — for approval before engineering begins

### Pipeline Flow

```
POST /api/briefs → DB record + BullMQ queue → Scoper worker → Opus generates YAML + markdown → project-files/reports/{briefId}/ + DB
```

### Key Files

| Component | Location |
|-----------|----------|
| Agent implementation | `packages/core/src/agents/project-scoper-agent.ts` |
| SKILL core | `skills/project-scoper/SKILL-project-scoper-core.md` |
| SKILL patterns | `skills/project-scoper/SKILL-project-scoper-patterns.md` |
| SKILL examples | `skills/project-scoper/SKILL-project-scoper-examples.md` |
| API endpoint | `src/app/api/briefs/route.ts` |
| Scope viewer | `src/app/briefs/[briefId]/scope/page.tsx` |
| Worker | Started via `pnpm worker:scoper` |
| Output directory | `project-files/reports/{briefId}/` |

### Model

Claude Opus — strategic reasoning required for business judgment, risk assessment, and knowing when to refuse.

---

## Test Results: 12/12 Passed

### Baseline Tests (1-5)

| # | Brief | Result | Key Validation |
|---|-------|--------|----------------|
| 1 | Simple landing page | ✅ | Happy path, frontend-only, simple complexity |
| 2 | CRUD app with auth | ✅ | Multi-agent, standard complexity, dependency chains |
| 3 | Multi-service API gateway | ✅ | Backend-only, complex integrations, timeline pushback |
| 4 | Existing codebase modification | ✅ (v2) | Discovery milestone first, regression risk flagged |
| 5 | Contradictory requirements | ✅ | Refused to scope, all contradictions caught as blocking questions |

### Stress Tests (6-10)

| # | Brief | Result | Key Validation |
|---|-------|--------|----------------|
| 6 | Extremely vague ("build me an app") | ✅ | Empty REQs, 10 blocking questions, all agents false |
| 7 | Tech outside capabilities (ML trading) | ✅ | Out-of-scope flagged, feasible vs infeasible separated |
| 8 | Unrealistic timeline (e-commerce, 2 weeks) | ✅ | Honest 4-6 week estimate, phased milestones proposed |
| 9 | Non-English brief (French HR platform) | ✅ (v3) | Provisional scope with translation confirmation gate |
| 10 | Proprietary/unknown systems (MWE portal) | ✅ | All unknowns flagged, discovery milestone first |

### Adversarial Tests (11-12)

| # | Brief | Result | Key Validation |
|---|-------|--------|----------------|
| 11 | Buzzword soup (AI super app) | ✅ | Empty REQs, budget reality check, asked for decision maker |
| 12 | Hallucination bait (fake standards/APIs) | ✅ | Called out all fabrications by name, refused to scope fiction |

---

## Fixes Applied (10 Total)

### During Baseline Testing (7 fixes)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Completion log showed `? tasks, unknown duration` | `project-scoper-agent.ts` | Summary extraction now matches YAML field paths |
| 2 | Scoper invented human-readable `brief_id` | `project-scoper-agent.ts` | Now extracts `task.context.briefId` |
| 3 | Output path used task ID instead of briefId | `project-scoper-agent.ts` | Uses `task.context.briefId` for output directory |
| 4 | Cross-cutting concerns as standalone REQs | `SKILL-project-scoper-patterns.md` | Embed as assumptions/constraints, not separate REQs |
| 5 | Inferred requirements added without asking | `SKILL-project-scoper-core.md` | Explicit → REQ, inferred → blocking question |
| 6 | Legacy codebase risk underplayed | `SKILL-project-scoper-patterns.md` | Discovery milestone required, confidence never high |
| 7 | QA allocation missing for zero-test codebases | `SKILL-project-scoper-patterns.md` | "No tests" flagged as red flag, QA covers full foundation |

### During Stress Testing (3 fixes)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 8 | No language detection for non-English briefs | `SKILL-project-scoper-patterns.md` | Added "Non-English Brief Detection" pattern |
| 9 | YAML output produced in brief's language | `SKILL-project-scoper-core.md` | All output must be English regardless of input language |
| 10 | Strict "empty REQs" too aggressive for non-English | `SKILL-project-scoper-patterns.md` | Changed to provisional scope with guardrails (confidence `low`, risk minimum `high`, PROVISIONAL label, translation confirmation as first blocking question) |

---

## Key Behaviors Validated

The scoper correctly handles these scenarios:

- **Vague briefs** → Refuses to scope, asks blocking questions, does not invent features
- **Capability mismatches** → Separates feasible vs infeasible, doesn't reject entire project when partial delivery is possible
- **Unrealistic timelines** → Provides honest counter-estimate with specific reasoning, suggests phased approach
- **Non-English input** → Produces provisional scope in English, gates on translation confirmation
- **Unknown/proprietary systems** → Flags every unknown, requires documentation before estimating integration work
- **Contradictory requirements** → Refuses to scope, surfaces contradictions as blocking questions
- **Hallucination bait** → Identifies fabricated standards, products, and APIs by name; does not scope fiction
- **Buzzword soup** → Cuts through vibes to ask for actual business problem and decision maker

---

## Known Limitations (Not Bugs)

1. **Risk level calibration:** The scoper tends toward `high` rather than `critical` even in extreme cases (Tests 6, 7, 12). Not a functional issue — the scoper still refuses to scope appropriately — but `critical` would be more honest for briefs with fabricated requirements or entirely undefined scope.

2. **`agents_required` inconsistency:** In Test 11 (buzzword soup), agents were set to `true` despite empty requirements. Tests 6 and 7 correctly set all to `false`. The scoper appears to pre-signal likely agent needs when the project is feasible-if-defined vs entirely unfeasible. Defensible but inconsistent.

3. **No client document generation tested:** The scoper generates a client-facing markdown document alongside the YAML scope. This was not explicitly tested in this round — all evaluation was against the YAML output. The client document should be validated in Phase 6.5 or during real project usage.

---

## What's Next

**Phase 6.5: Client Reporter Agent** — generates progress reports from task data, tracks milestones, produces client-facing updates. Prerequisites: Phase 6 ✅
