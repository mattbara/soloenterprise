# SoloEnterprise: Consulting Pipeline

**Last Updated:** 2026-02-07
**Purpose:** End-to-end workflow for running client projects through SoloEnterprise.

---

## Pipeline Overview

```
CLIENT BRIEF → SCOPE → APPROVE → EXECUTE → DELIVER → REPORT
     │            │         │         │          │         │
     ▼            ▼         ▼         ▼          ▼         ▼
  Raw text    Structured  Human    Orchestrator  Code +   Progress
  from client  spec +     signs    decomposes   tests    reports
              estimate    off      & assigns    in repo  to client
```

---

## Stage 1: Client Brief Intake

**Input:** Unstructured text from client (email, document, call transcript)
**Agent:** None (human uploads to system)
**Output:** `project_briefs` record in database

The human (founder) receives a client request and enters it into SoloEnterprise. No AI processing yet — the raw brief is stored as-is.

### Brief Template (suggested for clients)

```markdown
## Project: [Name]
## Client: [Company]
## Contact: [Name, email]

### What do you need built?
[Freeform description]

### Who will use it?
[Target users]

### Do you have existing systems this needs to integrate with?
[APIs, databases, auth systems, etc.]

### Timeline expectations?
[When do you need it? Are there milestones?]

### Budget range?
[Optional but helpful]

### Anything else?
[Constraints, preferences, must-haves]
```

---

## Stage 2: Project Scoping

**Input:** `project_briefs` record
**Agent:** Project Scoper (Opus)
**Output:** `project_scopes` record with structured spec

The Project Scoper agent:
1. Parses the brief into structured requirements
2. Identifies which agents are needed (backend, frontend, QA, devops)
3. Estimates complexity per component (simple/standard/complex)
4. Maps requirements to concrete tasks
5. Flags gaps, risks, and ambiguities
6. Generates a client-facing scope document

### Scope Output Structure

```yaml
project_scope:
  project_name: string
  client: string
  summary: string              # 2-3 sentence overview

  requirements:
    - id: REQ-001
      description: string
      category: backend | frontend | fullstack | infrastructure
      complexity: simple | standard | complex
      estimated_tasks: number
      dependencies: string[]   # Other REQ IDs
      risks: string[]

  agents_required:
    - backend: true
    - frontend: true
    - qa: true
    - devops: false            # Or true with human fallback note

  estimates:
    total_tasks: number
    estimated_duration: string  # "2-3 weeks"
    complexity_breakdown:
      simple: number
      standard: number
      complex: number
    risk_level: low | medium | high

  gaps_and_questions:
    - question: string
      blocking: boolean
      context: string

  out_of_scope:
    - string[]                 # Explicitly excluded items

  milestones:
    - name: string
      deliverables: string[]
      target_completion: string # Relative: "Week 1", "Week 2"
```

### Client-Facing Scope Document

The scoper also generates a markdown document for the client:

```markdown
# Project Scope: [Name]
## Prepared for: [Client]
## Date: [Date]

### Executive Summary
[2-3 sentences]

### What We'll Build
[Bullet list of features/components]

### What's Not Included
[Explicit exclusions]

### Timeline
| Milestone | Deliverables | Target |
|-----------|-------------|--------|
| ...       | ...         | ...    |

### Estimated Effort
[Complexity summary, not internal task counts]

### Questions We Need Answered
[Blocking questions for client]

### Assumptions
[What we're assuming if not told otherwise]
```

---

## Stage 3: Human Approval

**Input:** Generated scope
**Agent:** None (human review)
**Output:** Approved scope → project record created

The founder reviews the generated scope and either:
- **Approves** → scope becomes the project spec, tasks get created
- **Modifies** → adjusts scope, re-runs or manually edits
- **Rejects** → archives the brief, no project created
- **Sends to client** → shares scope doc for client approval before starting

This is a HARD GATE. No engineering work begins without an approved scope.

---

## Stage 4: Execution

**Input:** Approved scope
**Agent:** Orchestrator → Engineering Agents
**Output:** Code, tests, infrastructure in project repository

The Orchestrator:
1. Creates tasks from approved scope
2. Assigns to appropriate agents
3. Manages dependencies and file locks
4. Tracks progress per milestone
5. Escalates blockers to human

This is the existing SoloEnterprise pipeline (Phases 0-5).

### Project Context in Agent Calls

Every agent invocation includes project context:

```yaml
project_context:
  project_id: string
  project_name: string
  client: string
  current_milestone: string
  scope_summary: string        # Condensed scope for agent awareness
  completed_tasks: string[]    # What's already done
  related_decisions: string[]  # Locked decisions for this project
```

---

## Stage 5: Delivery

**Input:** Completed tasks, passing tests
**Agent:** Orchestrator (aggregation) + Human (review)
**Output:** Deliverable package (merged PRs in codebase)

Per milestone:
1. Orchestrator detects all tasks for the milestone are `completed` (or explicitly descoped by human — no partial PRs)
2. All quality gates pass (tests, lint, type check, build)
3. Orchestrator emits `create_pull_request` action → command executor creates branch, assembles sandbox files to real paths **in dependency order**, pushes, creates PR via GitHub API
4. PR assigned to **Principal Software Engineer** for review
5. Principal reviews on GitHub:
   - **Approve → merge** (only Principal can merge)
   - **Request changes →** a single new orchestrator task is created with the full review comments; orchestrator re-decomposes into agent tasks
6. Once merged, deploy to staging/demo environment
7. Share with client

### PR Workflow

Agents write code to sandboxed directories (`generated/tasks/{task-id}/`). They have **no git awareness**. The orchestrator and command executor handle the entire git lifecycle:

- **Branch creation** from `development`
- **File assembly** in dependency order (sandbox path → real codebase path). File path conflicts between non-dependent tasks → fail fast, escalate to human.
- **Commit, push, PR creation** via GitHub API
- **PR tracking** in `pull_requests` table
- **Dashboard notifications** for pending PRs

**HARD RULE:** Only the Principal Software Engineer can merge PRs. No exceptions.

See `MASTER_ARCHITECTURE.md` for the full PR pipeline diagram and `SCHEMA_ADDITIONS.md` for the `pull_requests` table schema.

---

## Stage 6: Client Reporting

**Input:** Project data (tasks, statuses, time, costs)
**Agent:** Client Reporter (Sonnet)
**Output:** Progress reports, milestone summaries

### Report Types

| Report | Frequency | Content |
|--------|-----------|---------|
| Weekly Update | Weekly | Tasks completed, in progress, blocked. Decisions needed. |
| Milestone Report | Per milestone | What was delivered, what's next, any scope changes. |
| Project Summary | Project end | Full summary, metrics, lessons learned. |

### Cost Tracking

```yaml
cost_tracking:
  project_id: string
  period: string               # "2026-W06"
  agent_usage:
    - agent: backend
      tasks_completed: 5
      tokens_input: 45000
      tokens_output: 12000
      cached_tokens: 38000
      api_cost_usd: 0.85
    - agent: frontend
      # ...
  total_api_cost_usd: number
  estimated_billable_hours: number  # Cost → hours mapping
  margin_percentage: number
```

---

## Multi-Project Management

When running multiple projects concurrently:

### Resource Allocation
- Each project gets a priority level (critical, high, medium, low)
- Agent time is allocated by priority when contention exists
- Critical projects get first claim on agent availability

### Project Isolation
- Each project has its own task queue namespace
- File locks are project-scoped
- Agent context is project-scoped (no cross-contamination)

### Dashboard View
```
┌──────────────────────────────────────────────┐
│ ACTIVE PROJECTS                              │
├──────────────────────────────────────────────┤
│  ClientA - E-commerce API    [8/12 tasks]    │
│  ClientB - Dashboard UI      [3/20 tasks]    │
│  ClientC - Auth Migration    [BLOCKED]       │
│  ClientD - Landing Page      [SCOPING]       │
└──────────────────────────────────────────────┘
```

---

## Metrics to Track

| Metric | Purpose | Target |
|--------|---------|--------|
| Brief → Scope time | Scoping efficiency | < 1 hour |
| Scope accuracy | How often scope matches actual work | > 80% |
| Agent acceptance rate | First-attempt task success | > 60% (Meta baseline) |
| Tasks per project | Estimation accuracy | Within 20% of scope estimate |
| Token cost per project | Profitability | Track, set margin target |
| Client report turnaround | Communication quality | Same day |
| Human intervention rate | Automation level | < 20% of tasks |

---

*This document describes the target workflow. Implementation is phased — see SOLOENTERPRISE_PHASES_CURRENT.md.*
