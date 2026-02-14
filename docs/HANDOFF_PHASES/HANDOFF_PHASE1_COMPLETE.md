# SoloEnterprise — Phase 1 Complete: Token Optimization

## Current State

Phase 1 (Token Optimization) is complete. Achieved 40-80% token reduction through SKILL file splitting, complexity-based context loading, and context profiles. This phase took 1 week and was critical for cost sustainability — without it, every agent call would send the full prompt regardless of task complexity.

## What Was Built

### SKILL File Splitting

Monolithic SKILL files (one giant file per agent) were split into layered structures:

```
skills/
├── common/SKILL-common.md
├── backend/
│   ├── SKILL-backend-core.md        (always loaded)
│   ├── SKILL-backend-patterns.md    (standard+ tasks)
│   └── SKILL-backend-examples.md    (complex/first-time)
├── frontend/   (same structure)
├── qa/         (same structure)
├── devops/     (same structure)
└── orchestrator/
    ├── SKILL-orchestrator-core.md
    ├── SKILL-orchestrator-assignment.md
    ├── SKILL-orchestrator-quality.md
    └── SKILL-orchestrator-examples.md
```

**22 layered files** replaced 5 monolithic files. Legacy monoliths kept but deprecated.

### Context Profiles

Four profiles that control what context an agent receives based on task complexity:

| Profile | Schema | Route Examples | Max Examples | Use Case |
|---------|--------|----------------|--------------|----------|
| `simple-endpoint` | No | Yes | 1 | Health checks, static pages |
| `database-task` | Yes (filtered) | No | 0 | CRUD, queries |
| `full-feature` | Yes (full) | Yes | 2 | Multi-component features |
| `bug-fix` | No | No | 0 | Targeted fixes |

### Skill Loader

`skill-loader.ts` dynamically loads SKILL layers based on detected task complexity. Core is always loaded. Patterns loaded for standard+ tasks. Examples loaded for complex/first-time tasks.

## Measured Results

| Task Type | Profile | Input Tokens | Reduction |
|-----------|---------|--------------|-----------|
| Simple endpoint | `simple-endpoint` | 1,532 | ~80% |
| Database query (filtered) | `database-task` | 4,288 | ~45% |
| Database query (full schema) | `database-task` | 7,762 | Baseline |

## Key Decisions Made

- **Layered SKILL files** — core (always) + patterns (standard) + examples (complex) structure
- **Profile-based context** — task complexity determines what context is sent
- **Skill loader detects complexity** — keyword analysis on task description
- **Prompt caching** — SKILL file content cached by Anthropic API (90% savings on repeated content)
- **Phase 2 (Decision Cache) skipped** — not needed until orchestrator handles multi-task projects with repeated architecture decisions

## Bugs Fixed

1. **Profile selection false positive** — `complete` keyword in task description triggered `full-feature` profile instead of `simple-endpoint`. Fixed by tightening keyword matching.

## What Phase 3 Must Address

- Frontend agent doesn't exist yet — SKILL files are split but no `frontend-agent.ts`
- Need to prove the layered SKILL pattern works for a second agent type
- Need to test agent coordination (frontend depends on backend)

## Key Code Files

| File | Purpose |
|------|---------|
| `packages/core/src/agents/utils/context-profiles.ts` | Profile definitions + selection logic |
| `packages/core/src/agents/utils/context-loader.ts` | Profile-aware context building |
| `packages/core/src/agents/utils/skill-loader.ts` | Complexity-based SKILL layer loading |
| `packages/core/src/agents/backend-agent.ts` | Updated with token metrics logging |
| `skills/` (22 files) | Layered SKILL files for all agent types |

## Repo

github.com/mattbara/soloenterprise, `development` branch

---

*Phase 1 made agent calls sustainable. Without token optimization, scaling to multi-task projects would be prohibitively expensive.*
