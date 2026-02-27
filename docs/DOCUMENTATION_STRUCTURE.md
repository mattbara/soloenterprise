# Documentation Structure

## Rule: All Documentation Lives in the Repo

```
❌ Desktop           → Dies with your laptop
❌ Notion            → Gets stale, agents can't read
❌ Google Docs       → Separate from code
❌ Confluence        → Where docs go to die
✅ Git Repository    → Versioned, searchable, agents can read
```

---

## Current Structure (SoloEnterprise)

```
soloenterprise/
│
├── README.md                      # Entry point
├── CLAUDE.md                      # Claude Code guidelines & guardrails
│
├── docs/                          # Documentation
│   ├── DOCUMENTATION_STRUCTURE.md # This file
│   ├── ARCHITECTURE.md            # System design (TODO)
│   ├── runbooks/                  # Operational procedures (TODO)
│   └── adr/                       # Architecture Decision Records (TODO)
│
├── packages/
│   ├── core/                      # @soloenterprise/core - Agent orchestration
│   │   ├── src/
│   │   │   ├── agents/            # AI agent implementations
│   │   │   │   ├── backend-agent.ts
│   │   │   │   ├── frontend-agent.ts
│   │   │   │   ├── qa-agent.ts
│   │   │   │   ├── orchestrator-agent.ts
│   │   │   │   ├── project-scoper-agent.ts
│   │   │   │   ├── client-reporter-agent.ts
│   │   │   │   ├── echo-agent.ts
│   │   │   │   └── utils/         # Shared agent utilities
│   │   │   │       ├── context-loader.ts
│   │   │   │       ├── context-profiles.ts
│   │   │   │       ├── frontend-context-loader.ts
│   │   │   │       ├── frontend-context-profiles.ts
│   │   │   │       ├── file-writer.ts
│   │   │   │       ├── file-validator.ts
│   │   │   │       ├── output-parser.ts
│   │   │   │       ├── report-parser.ts
│   │   │   │       ├── token-pricing.ts
│   │   │   │       ├── project-context-loader.ts
│   │   │   │       ├── architect-spec-generator.ts
│   │   │   │       ├── image-requirement-extractor.ts
│   │   │   │       └── skill-loader.ts
│   │   │   ├── queue/             # BullMQ task queue
│   │   │   ├── locks/             # File lock management
│   │   │   ├── services/          # Shared services
│   │   │   │   ├── task-service.ts
│   │   │   │   ├── cost-tracking-service.ts
│   │   │   │   └── worker-registry.ts
│   │   │   ├── scaffolder/        # Code scaffold generators (Phase 6.9) — 16 files
│   │   │   │   ├── index.ts               # Barrel exports
│   │   │   │   ├── scaffold-orchestrator.ts # Heuristic type detection + multi-table detection
│   │   │   │   ├── drizzle-schema-parser.ts # Regex parser for schema.ts
│   │   │   │   ├── import-resolver.ts     # ImportMap from known packages
│   │   │   │   ├── zod-from-drizzle.ts    # Zod schemas from Drizzle
│   │   │   │   ├── type-generator.ts      # TS interfaces from Zod
│   │   │   │   ├── backend-route.ts       # Hono route scaffold
│   │   │   │   ├── backend-service.ts     # CRUD service scaffold
│   │   │   │   ├── frontend-page.ts       # Next.js page scaffold
│   │   │   │   ├── frontend-form.ts       # React Hook Form scaffold
│   │   │   │   ├── test-shell.ts          # Vitest from source code
│   │   │   │   ├── test-shell-tdd.ts      # Vitest from spec only
│   │   │   │   ├── report-template.ts     # Markdown report pre-fill
│   │   │   │   ├── scope-template.ts      # YAML scope skeleton
│   │   │   │   ├── prompt-builder.ts      # Scaffold → prompt formatter
│   │   │   │   └── local-validator.ts     # TS syntax + import validation
│   │   │   ├── test-runner/       # Sandbox test execution (Phase 6.10)
│   │   │   │   ├── sandbox-runner.ts
│   │   │   │   ├── vitest-sandbox-config.ts
│   │   │   │   ├── playwright-sandbox-config.ts
│   │   │   │   └── result-parser.ts
│   │   │   └── worker.ts          # BullMQ worker entry point
│   │   └── generated/             # Sandboxed agent outputs
│   │       ├── tasks/{task-id}/   # Generated code per task
│   │       └── reports/{project-id}/   # Client-facing reports
│   │
│   ├── theme/                     # @soloenterprise/theme - TW4 design tokens
│   │   ├── package.json           # Workspace package with CSS exports
│   │   ├── base.css               # Foundation: spacing, typography, radii, motion
│   │   ├── dashboard.css          # SoloEnterprise brand + shadcn/ui bridge
│   │   └── client-template.css    # Agent-generated project template theme
│   │
│   └── db/                        # @soloenterprise/db - Database layer
│       └── src/
│           ├── schema.ts          # Drizzle schema definitions
│           └── index.ts           # Neon HTTP client
│
├── skills/                        # Agent skill files (modular prompts)
│   ├── backend/
│   │   ├── SKILL-backend-core.md
│   │   ├── SKILL-backend-examples.md
│   │   ├── SKILL-backend-patterns.md
│   │   ├── SKILL-backend-security.md      # Auto-loaded: auth, API, uploads
│   │   ├── SKILL-backend-architecture.md  # Auto-loaded: services, repos, CRUD
│   │   └── SKILL-backend-performance.md   # Auto-loaded: queries, pagination
│   ├── frontend/
│   │   ├── SKILL-frontend-core.md
│   │   ├── SKILL-frontend-examples.md
│   │   ├── SKILL-frontend-patterns.md
│   │   ├── SKILL-frontend-theming.md
│   │   ├── SKILL-frontend-security.md      # Auto-loaded: forms, auth, input
│   │   ├── SKILL-frontend-accessibility.md # Auto-loaded: components, pages
│   │   ├── SKILL-frontend-seo.md           # Auto-loaded: pages, landing, public
│   │   ├── SKILL-frontend-performance.md   # Auto-loaded: components, images
│   │   └── SKILL-frontend-routing.md       # Auto-loaded: routes, layouts
│   ├── orchestrator/
│   │   ├── SKILL-orchestrator-core.md
│   │   ├── SKILL-orchestrator-assignment.md
│   │   ├── SKILL-orchestrator-examples.md
│   │   └── SKILL-orchestrator-quality.md
│   ├── project-scoper/
│   │   ├── SKILL-project-scoper-core.md
│   │   ├── SKILL-project-scoper-patterns.md
│   │   └── SKILL-project-scoper-examples.md
│   ├── client-reporter/
│   │   ├── SKILL-client-reporter-core.md
│   │   └── SKILL-client-reporter-patterns.md
│   ├── common/                    # Shared skills
│   │   ├── SKILL-common.md               # Base rules (always loaded)
│   │   └── SKILL-common-security.md      # Auto-loaded: always (all agents)
│   ├── devops/                    # DevOps agent skills
│   ├── qa/                        # QA agent skills
│   └── SKILL-devops-engineer.md    # Legacy monolithic (until DevOps agent Phase 7)
│
├── src/                           # Next.js 15 application
│   ├── app/                       # App Router
│   │   ├── api/
│   │   │   ├── projects/          # Project CRUD
│   │   │   ├── questions/         # Human input endpoints
│   │   │   ├── tasks/             # Task management
│   │   │   └── workers/           # Worker status
│   │   ├── errors/                # Error tracking UI
│   │   ├── projects/              # Project management UI
│   │   ├── questions/             # Human input queue UI
│   │   └── tasks/                 # Task monitoring UI
│   ├── components/                # React components
│   └── lib/                       # Utilities
│
└── scripts/                       # Dev/test scripts
```

---

## Document Types

| Document | Location | Purpose | Updated By |
|----------|----------|---------|------------|
| README.md | Root | Project overview | Human |
| CLAUDE.md | Root | Claude Code guidelines | Human |
| ARCHITECTURE.md | docs/ | System design | Human + Agents |
| Runbooks | docs/runbooks/ | Operations | DevOps Agent |
| ADRs | docs/adr/ | Decisions | Human (always) |
| SKILLs | skills/{agent}/ | Agent prompts (modular) | Human |
| Consulting Pipeline | docs/ | Business workflow | Human |
| Client Reports | project-files/reports/ | Client deliverables | Client Reporter Agent |
| Project Scopes | project-files/reports/ | Structured specs | Project Scoper Agent |
| Antipatterns | docs/ | Data fetching/mutation decision trees | Human |
| Quality Checklist | docs/ | Architecture quality standards for all projects | Human |
| Full Task Flow | docs/ | Complete 10-phase task lifecycle | Human |
| Master Architecture | docs/ | System design (65KB) | Human |
| Parallel Workers Plan | docs/ | Future multi-project concurrency | Human |
| Package READMEs | packages/core/, packages/db/ | Package docs | Relevant Agent |

---

## Architecture Decision Records (ADRs)

Every significant decision gets documented:

```markdown
# ADR-001: Use TypeScript

## Status
Accepted

## Context
We need to choose a primary language for backend and frontend.

## Decision
Use TypeScript with strict mode for all code.

## Consequences
- ✅ Type safety reduces runtime errors
- ✅ Better IDE support and refactoring
- ✅ Same language frontend and backend
- ❌ Compilation step required
- ❌ Learning curve for pure JS developers
```

**ADR Template:** `docs/adr/template.md`

---

## Rules for Documentation

### 1. Agents Can Read, Sometimes Write

| Document Type | Agent Can Read | Agent Can Write |
|---------------|----------------|-----------------|
| SKILL files | ✅ Yes | ❌ No (human only) |
| Architecture | ✅ Yes | ⚠️ Propose changes via PR |
| Runbooks | ✅ Yes | ✅ Yes (DevOps) |
| ADRs | ✅ Yes | ❌ No (human only) |
| Component docs | ✅ Yes | ✅ Yes (relevant agent) |

### 2. Keep Docs Close to Code

```
# Good: docs next to code
packages/core/README.md          # Core package docs in core folder
packages/db/README.md            # DB package docs in db folder

# Bad: all docs in one place
docs/core-readme.md              # Disconnected from code
```

### 3. Version Everything

Documentation is code. Same rules apply:
- Commit messages describe changes
- PRs for significant updates
- Review before merge

### 4. Delete Stale Docs

Outdated documentation is worse than no documentation. Delete or update.

---

## Migration Plan (From Desktop/Notion)

If you have existing docs elsewhere:

```bash
# 1. Create the structure
mkdir -p docs/{runbooks,adr}
mkdir -p skills

# 2. Copy/convert existing docs
# Notion → Export as Markdown → Copy to repo
# Google Docs → Download as .docx → Convert with pandoc
pandoc input.docx -o docs/output.md

# 3. Commit
git add docs/
git commit -m "docs: migrate documentation to repository"

# 4. Delete originals (after verification)
# Remove from Notion/Google Docs to prevent confusion
```

---

## Quick Reference

```bash
# Where to put things:

# Claude Code guidelines
→ CLAUDE.md

# System architecture
→ docs/ARCHITECTURE.md

# How to deploy
→ docs/runbooks/deployment.md

# Why we chose X
→ docs/adr/NNN-decision-title.md

# Agent skills (modular)
→ skills/{agent}/SKILL-{agent}-core.md
→ skills/{agent}/SKILL-{agent}-examples.md
→ skills/{agent}/SKILL-{agent}-patterns.md

# Agent implementations
→ packages/core/src/agents/{agent}-agent.ts

# Database schema
→ packages/db/src/schema.ts

# API routes
→ src/app/api/{resource}/route.ts

# UI pages
→ src/app/{page}/page.tsx

# React components
→ src/components/{Component}.tsx

# Business workflow
→ docs/CONSULTING_PIPELINE.md

# Project scope output
→ project-files/reports/{project-id}/scope-{date}.md

# Client progress reports
→ project-files/reports/{project-id}/weekly-{date}.md
```

---

*Rule: If it's not in the repo, it doesn't exist.*
