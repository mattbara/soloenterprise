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

## Recommended Structure

```
product-factory/
│
├── README.md                      # Entry point (what is this project?)
│
├── docs/                          # All documentation
│   ├── BOOTSTRAP.md               # One-time setup guide
│   ├── ARCHITECTURE.md            # System design
│   ├── CONTRIBUTING.md            # How to contribute
│   ├── ENVIRONMENTS.md            # Environment details (URLs, configs)
│   │
│   ├── runbooks/                  # Operational procedures
│   │   ├── deployment.md          # How to deploy
│   │   ├── rollback.md            # How to rollback
│   │   ├── incident-response.md   # What to do when things break
│   │   └── on-call.md             # On-call procedures
│   │
│   └── adr/                       # Architecture Decision Records
│       ├── template.md            # ADR template
│       ├── 001-use-typescript.md  # Why TypeScript
│       ├── 002-use-postgresql.md  # Why PostgreSQL
│       └── 003-use-bullmq.md      # Why BullMQ
│
├── skills/                        # Agent SKILL files
│   ├── SKILL-orchestrator.md
│   ├── SKILL-backend-engineer.md
│   ├── SKILL-frontend-engineer.md
│   ├── SKILL-qa-engineer.md
│   └── SKILL-devops-engineer.md
│
├── infrastructure/
│   └── terraform/
│       └── README.md              # Infrastructure-specific docs
│
├── apps/
│   ├── backend/
│   │   └── README.md              # Backend-specific docs
│   └── frontend/
│       └── README.md              # Frontend-specific docs
│
└── packages/
    └── shared/
        └── README.md              # Shared package docs
```

---

## Document Types

| Document | Location | Purpose | Updated By |
|----------|----------|---------|------------|
| README.md | Root | Project overview | Human |
| BOOTSTRAP.md | docs/ | One-time setup | Human |
| ARCHITECTURE.md | docs/ | System design | Human + Agents |
| CONTRIBUTING.md | docs/ | Dev workflow | Human |
| ENVIRONMENTS.md | docs/ | Env details | DevOps Agent |
| Runbooks | docs/runbooks/ | Operations | DevOps Agent |
| ADRs | docs/adr/ | Decisions | Human (always) |
| SKILLs | skills/ | Agent definitions | Human |
| Component READMEs | apps/*, packages/* | Component docs | Relevant Agent |

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
apps/backend/README.md           # Backend docs in backend folder

# Bad: all docs in one place
docs/backend-readme.md           # Disconnected from code
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

# System architecture
→ docs/ARCHITECTURE.md

# Setup instructions
→ docs/BOOTSTRAP.md

# How to deploy
→ docs/runbooks/deployment.md

# Why we chose X
→ docs/adr/NNN-decision-title.md

# How agents work
→ skills/SKILL-agent-name.md

# Backend API docs
→ apps/backend/README.md
→ apps/backend/docs/api.md

# Frontend component docs
→ apps/frontend/README.md
→ apps/frontend/docs/components.md
```

---

*Rule: If it's not in the repo, it doesn't exist.*
