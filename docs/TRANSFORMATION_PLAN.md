# SoloEnterprise: Engineering Tool → Consulting Business Platform

## Transformation Plan

**Date:** 2026-02-07
**Purpose:** Restructure SoloEnterprise from a code generation orchestrator into a consulting business automation platform that can scope, manage, execute, and deliver client projects.

---

## Why This Change

**Current state:** SoloEnterprise has 4 working engineering agents (Backend, Frontend, QA + Orchestrator SKILL files). Every phase so far is about writing better code.

**Problem:** The market is saturated with code agents — BMAD (33.7k stars), Claude Code (built-in subagents), Cursor, Windsurf, Codex. Competing on code generation alone is a losing game.

**The actual gap:** Nobody automates the *consulting business* around the code. Scoping projects from client briefs, generating SOWs, estimating timelines based on agent capabilities, managing multiple concurrent projects, producing client deliverables and progress reports — none of the current AI agent tools handle this.

**The shift:** SoloEnterprise becomes the system that lets a solo founder run a software consultancy, not just generate code. The engineering agents remain the execution layer, but they're wrapped in business operations that handle the full client lifecycle: **intake → scope → estimate → execute → deliver → report**.

---

## What Changes

### Documents to Update

| Document | Change | Why |
|----------|--------|-----|
| `SOLOENTERPRISE_PHASES_CURRENT.md` | Major restructure — insert business ops phases, reorder | Engineering-only phases won't get you to €500k projects |
| `MASTER_ARCHITECTURE.md` | Rewrite "Solo Enterprise" section, add consulting pipeline | Current vision is disconnected from execution plan |
| `SKILL-orchestrator-core.md` | Add project-level awareness, client context | Orchestrator currently only thinks in tasks, not projects |
| `SKILL-orchestrator-assignment.md` | Add project scoping workflow | Missing: how do requirements get INTO the system |
| `SKILL-orchestrator-examples.md` | Add consulting workflow examples | No examples of multi-project coordination |
| `ADDING_NEW_AGENT.md` | Add business agent category | Only covers engineering agents |
| `DOCUMENTATION_STRUCTURE.md` | Add client deliverables structure | No mention of client-facing outputs |

### New Files to Create

| File | Purpose |
|------|---------|
| `SKILL-project-scoper-core.md` | Agent that breaks client briefs into structured project specs |
| `SKILL-project-scoper-patterns.md` | Scoping patterns, estimation heuristics |
| `SKILL-project-scoper-examples.md` | Complete scoping examples |
| `SKILL-client-reporter-core.md` | Agent that produces client-facing progress reports |
| `SKILL-client-reporter-patterns.md` | Report templates, status formats |
| `CONSULTING_PIPELINE.md` | End-to-end consulting workflow documentation |

### Database Schema Additions (documented in architecture, implemented in Claude Code)

New tables needed:
- `clients` — Client information, contact details, billing
- `project_briefs` — Raw client requirements before scoping
- `project_scopes` — Structured scope with estimates, generated from briefs
- `milestones` — Project milestones tied to deliverables
- `client_reports` — Generated progress reports for clients
- `time_entries` — Agent time tracking per project (token cost → billable hours mapping)

---

## Prompt Execution Order

```
Prompt 1: Update PHASES (restructure the roadmap)
    ↓
Prompt 2: Update MASTER_ARCHITECTURE (rewrite Solo Enterprise vision)
    ↓
Prompt 3: Create CONSULTING_PIPELINE.md (new document)
    ↓
Prompt 4: Create Project Scoper SKILL files (new agent)
    ↓
Prompt 5: Create Client Reporter SKILL files (new agent)
    ↓
Prompt 6: Update Orchestrator SKILL files (add project awareness)
    ↓
Prompt 7: Update ADDING_NEW_AGENT.md + DOCUMENTATION_STRUCTURE.md
    ↓
Prompt 8: Schema additions documentation (for Claude Code implementation)
```

Each prompt is designed to be self-contained. Run them in order because later prompts reference changes from earlier ones.

---

## PROMPT 1: Restructure Phases

### What it does
Rewrites `SOLOENTERPRISE_PHASES_CURRENT.md` to insert business operations phases between current Phase 5 (Orchestrator) and Phase 6 (DevOps). Adds a "Phase 5.5: Real Project Validation" gate. Moves business-critical agents earlier. Deprioritizes DevOps (can be handled manually/by human initially).

### Why
Every phase so far is engineering. You can't test the consulting business model without business ops agents. Running a real project after Phase 5 validates everything before building more.

### Claude Code Prompt

```
Read the file SOLOENTERPRISE_PHASES_CURRENT.md in full.

Apply these specific changes:

1. RENAME Phase 5 to "Phase 5: Orchestrator Agent + Project Management"
   - Keep existing orchestrator checklist
   - ADD to scope: "Project-level task management (not just individual tasks)"
   - ADD to scope: "Multi-project awareness (which project is this task for?)"
   - ADD to scope: "Project status aggregation (roll up task statuses to project level)"
   - ADD to checklist: "[ ] Project context passed to all agent invocations"
   - ADD to checklist: "[ ] Project-level status API endpoint"
   - Update the test plan:
     - Test 4 becomes: "Multi-project task decomposition (2 projects simultaneously)"
     - Test 5 becomes: "Full feature with project context flowing to agents"
     - Test 9 becomes: "Two projects with shared agent pool (resource contention)"

2. INSERT new "Phase 5.5: Real Project Validation" after Phase 5:
   Duration: 1-2 weeks
   Status: NOT STARTED
   Prerequisites: Phase 5 complete
   
   Description: "Use SoloEnterprise end-to-end on ONE real project. This is not optional. Every failure, human intervention, and workaround gets documented. This data shapes all subsequent phases."
   
   Checklist:
   - [ ] Select real project (internal tool or test client)
   - [ ] Define project brief as a client would write it
   - [ ] Run through full pipeline: brief → scope → decompose → execute → deliver
   - [ ] Track: tasks completed vs failed, human interventions, time per task
   - [ ] Track: agent acceptance rate (first attempt vs revisions needed)
   - [ ] Track: total token cost → map to theoretical billable hours
   - [ ] Document ALL pain points
   - [ ] Document what manual work was still needed
   - [ ] Write post-mortem with specific improvements needed
   
   Output: Validation report that determines if Phase 6+ priorities need changing

3. INSERT new "Phase 6: Project Scoper Agent" (push current Phase 6 DevOps to Phase 7):
   Duration: 1-2 weeks
   Status: NOT STARTED
   Prerequisites: Phase 5.5 complete
   Model: Claude Opus (strategic reasoning — scoping requires business judgment)
   
   Scope:
   - Parse client briefs (unstructured text) into structured project specs
   - Estimate complexity per component (simple/standard/complex)
   - Map requirements to agent capabilities
   - Generate task breakdown with rough effort estimates
   - Identify gaps/risks requiring human decision
   - Produce client-facing scope document
   
   Checklist:
   - [ ] SKILL files created (core, patterns, examples)
   - [ ] Create project-scoper-agent.ts
   - [ ] Brief → structured spec parsing
   - [ ] Complexity estimation heuristics
   - [ ] Agent capability mapping
   - [ ] Client-facing scope document generation
   - [ ] Test with 5 different project briefs (varying complexity)
   - [ ] Test with intentionally vague brief → should ask questions
   
   Test Plan:
   Baseline (1-5):
   1. Simple landing page project brief
   2. CRUD app with auth project brief
   3. Multi-service API project brief
   4. Existing codebase modification brief
   5. Brief with contradictory requirements
   
   Stress (6-10):
   6. Extremely vague brief ("build me an app")
   7. Brief requiring tech outside agent capabilities
   8. Brief with unrealistic timeline expectations
   9. Brief in non-English (should flag, not guess)
   10. Brief referencing proprietary/unknown systems

4. INSERT new "Phase 6.5: Client Reporter Agent":
   Duration: 1 week
   Status: NOT STARTED
   Prerequisites: Phase 6 complete
   Model: Claude Sonnet (structured output generation)
   
   Scope:
   - Aggregate task statuses into project-level progress
   - Generate client-facing progress reports (markdown → PDF)
   - Highlight blockers and decisions needed
   - Produce milestone completion summaries
   - Track time/cost per project
   
   Checklist:
   - [ ] SKILL files created (core, patterns)
   - [ ] Create client-reporter-agent.ts
   - [ ] Progress report generation from task data
   - [ ] Milestone tracking
   - [ ] Cost tracking (token usage → estimated hours)
   - [ ] Report templates (weekly update, milestone report, project summary)

5. RENUMBER existing phases:
   - Current Phase 6 (DevOps) → Phase 7
   - Current Phase 7 (Principal Reviewer) → Phase 7.5 (merge with Phase 7 as sub-task, not separate phase)
   - Current Phase 8 (Multi-Agent Integration) → Phase 8
   - Current Phase 9 (Documentation) → Phase 9
   
6. UPDATE "What Changed From Original Plan" table at bottom:
   Add row: "Engineering-only phases | Business ops phases inserted (Scoper, Reporter) after Orchestrator"
   Add row: "No validation gate | Phase 5.5 real project validation required before proceeding"
   Add row: "DevOps Agent = Phase 5 | DevOps Agent pushed to Phase 7 (can be done manually initially)"

7. UPDATE Risk Assessment:
   Add row: "No real-world validation | HIGH | Phase 5.5 mandatory gate"
   Add row: "No client-facing pipeline | HIGH | Phase 6/6.5 business agents"

8. UPDATE Timeline Overview table at the top to reflect new phase numbers and estimates.

Do NOT change Phases 0-4 (they're complete). Do NOT change Future Phases 10-13. Only restructure Phases 5-9.
```

---

## PROMPT 2: Update Master Architecture

### What it does
Rewrites the "Solo Enterprise: Your AI Company" section and the "Future Vision" section in MASTER_ARCHITECTURE.md to reflect the consulting business model. Adds consulting pipeline to the system architecture.

### Why
The current architecture shows agents producing code. It needs to show the full cycle: client intake → scoping → execution → delivery → reporting.

### Claude Code Prompt

```
Read MASTER_ARCHITECTURE.md in full.

Make these specific changes:

1. In the "Future Vision: Full Business Automation" section, REPLACE the "Status: VISION" note with:
   "Status: ACTIVE DEVELOPMENT — Business operations agents (Project Scoper, Client Reporter) are prioritized immediately after Orchestrator. Engineering foundation is necessary but not sufficient."

2. REPLACE the entire "The Full Picture" ASCII diagram with this updated version that adds a CONSULTING PIPELINE layer:

```
┌─────────────────────────────────────────────────────────────────┐
│                      SOLO ENTERPRISE                            │
│               "AI-Powered Software Consultancy"                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CONSULTING PIPELINE                        │   │
│  │                                                         │   │
│  │  Client Brief → Scope → Estimate → Execute → Deliver   │   │
│  │                                                         │   │
│  │  • Project Scoper (Opus) — briefs → structured specs    │   │
│  │  • Client Reporter (Sonnet) — progress → reports        │   │
│  │  • Cost Tracker — token usage → billable hours          │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ENGINEERING PIPELINE                       │   │
│  │                                                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │   │
│  │  │ Backend │  │Frontend │  │   QA    │               │   │
│  │  │(Sonnet) │  │(Sonnet) │  │(Sonnet) │               │   │
│  │  └─────────┘  └─────────┘  └─────────┘               │   │
│  │                                                         │   │
│  │  ┌─────────┐  ┌─────────┐                              │   │
│  │  │ DevOps  │  │Reviewer │                              │   │
│  │  │(Sonnet) │  │ (Opus)  │                              │   │
│  │  └─────────┘  └─────────┘                              │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    │ORCHESTRATOR │                              │
│                    │   (Opus)    │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│                    ┌──────┴──────┐                              │
│                    │    HUMAN    │                              │
│                    │  (Founder)  │                              │
│                    └─────────────┘                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         FUTURE: GROWTH & OPERATIONS                     │   │
│  │                                                         │   │
│  │  • Product Manager    • Content Writer                  │   │
│  │  • Marketing          • Finance                         │   │
│  │  • Design             • Legal                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

3. REPLACE the "Why Engineering First" explanation. Keep the validation difficulty table but ADD this paragraph before it:

"Engineering agents are the execution engine, but they don't generate revenue alone. A client doesn't care that your Backend agent writes clean TypeScript — they care that their project is scoped correctly, executed on time, and delivered with clear communication. The consulting pipeline (Project Scoper → Orchestrator → Engineering Agents → Client Reporter) is the minimum viable business. Engineering without scoping and reporting is an incomplete product."

4. In the "Agent Validation Difficulty" table, ADD two new rows:

| Project Scoper | Client brief | Structured spec + estimate | Human reviews scope | ⚠️ Moderate |
| Client Reporter | Task/project data | Progress report | Human reviews report | ✅ Solvable |

5. In the "Sequencing" list, REPLACE the current sequence with:

1. **Engineering agents** (Phases 0-4) ✅ COMPLETE — execution layer
2. **Orchestrator + project management** (Phase 5) — coordination layer  
3. **Real project validation** (Phase 5.5) — prove it works end-to-end
4. **Business operations agents** (Phase 6-6.5) — Project Scoper + Client Reporter
5. **DevOps + Reviewer agents** (Phase 7) — automation and quality
6. **Multi-agent integration** (Phase 8) — parallel execution at scale
7. **Product/Design/Growth agents** (Phase 10+) — only after revenue validation

6. In the "Non-Negotiable Rules" section, ADD:
   10. **Every project starts with a scoped brief — no coding without written scope**
   11. **Client reports generated weekly for active projects — not optional**
   12. **Token costs tracked per project — maps to billing**

7. In the "Tech Stack" section under "AI Models", ADD:

| Project Scoper | Opus 4.5 | Business judgment for scoping |
| Client Reporter | Sonnet 4.5 | Structured report generation |

Do NOT modify the Environment Pipeline section, the QA Pipeline section, or the n8n Integration section. Those remain unchanged.
```

---

## PROMPT 3: Create Consulting Pipeline Document

### What it does
Creates a new document that describes the end-to-end consulting workflow — from client brief to delivered project. This becomes the reference doc for how SoloEnterprise operates as a business.

### Why
Currently there's no document that describes HOW the system works from a business perspective. The architecture doc describes components. This doc describes the workflow.

### Claude Code Prompt

```
Create a new file: docs/CONSULTING_PIPELINE.md

Write the following content:

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
**Output:** Deliverable package

Per milestone:
1. Orchestrator aggregates completed work
2. All quality gates pass (tests, lint, type check, build)
3. Human reviews final output
4. Deploy to staging/demo environment
5. Share with client

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
│ 🟢 ClientA - E-commerce API    [8/12 tasks] │
│ 🟡 ClientB - Dashboard UI      [3/20 tasks] │
│ 🔴 ClientC - Auth Migration    [BLOCKED]     │
│ ⚪ ClientD - Landing Page       [SCOPING]    │
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
```

---

## PROMPT 4: Create Project Scoper SKILL Files

### What it does
Creates three SKILL files for the Project Scoper agent — the business brain that turns messy client briefs into structured project specs.

### Why
This agent doesn't exist anywhere in the AI agent ecosystem. Code agents are everywhere. Scoping agents are not. This is where SoloEnterprise differentiates.

### Claude Code Prompt

```
Create three new files in the skills/project-scoper/ directory (create the directory if needed):

### FILE 1: skills/project-scoper/SKILL-project-scoper-core.md

# Project Scoper - Core

<!-- Token Target: 1,000-1,200 tokens -->
<!-- Load When: always -->

## Identity

You are a **Principal Project Scoper**. You transform unstructured client briefs into structured project specifications with effort estimates. You do NOT write code. You think like a technical project manager who has delivered 100+ software projects.

You bridge the gap between "what the client said" and "what the engineering team needs to build."

## Tech Awareness

You know what these agents can build:
- **Backend Agent:** APIs, database schemas, server logic (TypeScript, Hono, Drizzle, PostgreSQL)
- **Frontend Agent:** UI components, pages, client logic (React, Next.js 15, Tailwind, shadcn/ui)
- **QA Agent:** Unit tests, integration tests, component tests (Vitest, React Testing Library, Playwright)
- **DevOps Agent:** CI/CD, infrastructure (GitHub Actions, Docker) — NOTE: may require human fallback

You estimate based on what these specific agents can deliver, not generic software estimates.

## Output Format

All scoping output uses structured YAML wrapped in XML tags:

```xml
<scope>
[YAML content — see patterns file for schema]
</scope>

<client_document>
[Markdown — client-facing scope document]
</client_document>
```

## Core Responsibilities

1. **Parse Requirements** — Extract concrete features from vague descriptions
2. **Identify Components** — Map features to backend/frontend/fullstack
3. **Estimate Complexity** — Simple (1-2 agent tasks), Standard (3-5), Complex (6+)
4. **Flag Gaps** — What's missing? What assumptions are we making?
5. **Identify Risks** — Technical risks, scope creep risks, dependency risks
6. **Generate Scope Document** — Client-facing summary for approval

## Complexity Heuristics

| Complexity | Characteristics | Example |
|------------|----------------|---------|
| Simple | Single agent, CRUD, no integrations, clear requirements | Health check endpoint, static page |
| Standard | 2+ agents, some business logic, clear patterns | Auth flow, dashboard with API |
| Complex | Multiple integrations, custom logic, ambiguous requirements | Payment system, real-time features |

## Constraints

### You MUST:
- Ask questions when requirements are ambiguous (NEVER assume)
- Explicitly state what's OUT of scope
- Flag when requirements exceed agent capabilities
- Provide time estimates as ranges, not exact numbers
- Include assumptions for every estimate

### You MUST NOT:
- Promise timelines the agents can't meet
- Scope DevOps work without noting it may need human fallback
- Skip risk assessment
- Generate code or technical implementation details
- Make business decisions (pricing, prioritization) — that's the human's job

## Escalation Triggers

Request human input for:
1. **Budget/pricing decisions** — you scope, human prices
2. **Technology choices** outside standard stack
3. **Regulatory/compliance requirements** (GDPR, HIPAA, PCI)
4. **Client relationship concerns** (unrealistic expectations, scope creep signals)
5. **Requirements that contradict each other**

## Model Configuration

- **Model:** Claude Opus (`claude-opus-4-5-20251101`)
- **Temperature:** 0.2 (some creativity for identifying gaps, mostly deterministic)
- **Max Tokens:** 16000


### FILE 2: skills/project-scoper/SKILL-project-scoper-patterns.md

# Project Scoper - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard scoping tasks -->

## Scope Output Schema

```yaml
project_scope:
  project_name: string
  client: string
  brief_id: string              # Reference to original brief
  summary: string               # 2-3 sentence overview
  
  requirements:
    - id: REQ-001
      description: string
      category: backend | frontend | fullstack | infrastructure
      complexity: simple | standard | complex
      estimated_tasks: number    # How many agent tasks
      agent_types: string[]      # Which agents needed
      dependencies: string[]     # Other REQ IDs this depends on
      risks: string[]
      assumptions: string[]
      
  agents_required:
    backend: boolean
    frontend: boolean
    qa: boolean                  # Almost always true
    devops: boolean
    devops_human_fallback: boolean  # True if devops agent unavailable
    
  estimates:
    total_tasks: number
    duration_range: string       # "2-3 weeks"
    complexity_breakdown:
      simple: number
      standard: number
      complex: number
    confidence: low | medium | high
    risk_level: low | medium | high
    
  gaps:
    - question: string
      blocking: boolean          # Can we start without this answer?
      default_assumption: string # What we'll assume if no answer
      
  out_of_scope:
    - string[]
    
  milestones:
    - name: string
      requirements: string[]     # REQ IDs included
      deliverables: string[]
      estimated_duration: string
```

## Estimation Rules

### Per-Task Estimates (Agent Execution Time)
- Simple task: 1-3 minutes agent time, ~2K-5K tokens
- Standard task: 3-10 minutes agent time, ~5K-15K tokens
- Complex task: 10-30 minutes agent time, ~15K-40K tokens

### Project-Level Overhead
- Add 20% buffer for QA iterations
- Add 10% buffer for human review and feedback cycles
- Add 15% buffer for integration issues between agents

### Red Flags in Briefs
- "Simple" or "just" preceding complex requirements
- No mention of auth/security for user-facing apps
- "Like [competitor] but better" with no specifics
- Timeline mentioned before requirements
- Multiple stakeholders with no clear decision maker

## Scoping Patterns

### Pattern: New Greenfield Application
1. Start with data model (what entities exist?)
2. Map CRUD operations per entity → backend tasks
3. Map screens per user flow → frontend tasks
4. Cross-reference: does every screen have an API?
5. Add auth if user-facing
6. Add QA tasks (1 per backend endpoint, 1 per frontend component)
7. Add infrastructure if deployment needed

### Pattern: Existing Codebase Modification
1. List files/modules that need changing
2. Assess: is existing code well-structured or spaghetti?
3. If spaghetti: add "refactor first" tasks, flag risk
4. Map changes to specific agents
5. Higher QA allocation (regression risk)

### Pattern: Integration/API Project
1. List external systems to integrate with
2. Check: do we have API docs? Auth credentials?
3. If not: these are BLOCKING questions
4. Map each integration point to backend tasks
5. Add error handling and retry logic tasks
6. Add integration tests (not just unit tests)

## Client Document Template

Always generate a client-facing scope document:
- No internal jargon (no "agent," "BullMQ," "SKILL files")
- Speak in deliverables, not tasks
- Use "we" language (consulting relationship)
- Include clear "What's Not Included" section
- End with "Questions We Need Answered" if any gaps exist


### FILE 3: skills/project-scoper/SKILL-project-scoper-examples.md

# Project Scoper - Examples

<!-- Token Target: 1,500-2,000 tokens -->
<!-- Load When: first scoping task, complex briefs -->

## Example 1: E-commerce API Brief

### Client Brief (Input)
"We need a backend API for our e-commerce store. Products, categories, shopping cart, checkout with Stripe. Users need to register and log in. Admin panel to manage products. We already have a React frontend team, so just the API please."

### Scoped Output

```yaml
project_scope:
  project_name: E-commerce API
  client: Example Corp
  summary: Backend API for e-commerce with product management, cart, Stripe checkout, auth, and admin endpoints. Frontend excluded per client request.
  
  requirements:
    - id: REQ-001
      description: User authentication (register, login, password reset)
      category: backend
      complexity: standard
      estimated_tasks: 3
      agent_types: [backend, qa]
      dependencies: []
      risks: ["Password reset requires email service — need to confirm provider"]
      assumptions: ["JWT-based auth", "Email/password, no OAuth initially"]
      
    - id: REQ-002
      description: Product and category CRUD with image URLs
      category: backend
      complexity: standard
      estimated_tasks: 4
      agent_types: [backend, qa]
      dependencies: [REQ-001]  # Admin routes need auth
      risks: []
      assumptions: ["Image storage handled externally, API stores URLs only"]
      
    - id: REQ-003
      description: Shopping cart (add, remove, update quantity, get cart)
      category: backend
      complexity: standard
      estimated_tasks: 3
      agent_types: [backend, qa]
      dependencies: [REQ-001, REQ-002]
      risks: ["Cart persistence — session-based or user-based?"]
      assumptions: ["User-based cart, persisted in database"]
      
    - id: REQ-004
      description: Checkout with Stripe integration
      category: backend
      complexity: complex
      estimated_tasks: 5
      agent_types: [backend, qa]
      dependencies: [REQ-003]
      risks: ["Stripe webhook handling", "Payment failure edge cases", "Need Stripe test API keys"]
      assumptions: ["Stripe Checkout Session flow, not custom payment form"]
      
    - id: REQ-005
      description: Admin endpoints for product/order management
      category: backend
      complexity: standard
      estimated_tasks: 3
      agent_types: [backend, qa]
      dependencies: [REQ-001, REQ-002]
      risks: []
      assumptions: ["Role-based: admin vs regular user", "No separate admin auth system"]

  agents_required:
    backend: true
    frontend: false
    qa: true
    devops: false
    
  estimates:
    total_tasks: 18
    duration_range: "2-3 weeks"
    complexity_breakdown:
      simple: 4
      standard: 10
      complex: 4
    confidence: high
    risk_level: medium  # Stripe integration adds risk
    
  gaps:
    - question: "Which email service for password reset? (SendGrid, Postmark, SES?)"
      blocking: false
      default_assumption: "Will use Resend — can swap later"
    - question: "Do you have Stripe test API keys we can use?"
      blocking: true
      default_assumption: null
    - question: "Cart behavior: does it persist across devices for logged-in users?"
      blocking: false
      default_assumption: "Yes, cart is tied to user account"
      
  out_of_scope:
    - Frontend / React components
    - Image upload/storage service
    - Email template design
    - Production deployment / infrastructure
    - Rate limiting / advanced security
    
  milestones:
    - name: "Auth + Products"
      requirements: [REQ-001, REQ-002]
      deliverables: ["Auth endpoints", "Product/Category CRUD", "Unit tests"]
      estimated_duration: "Week 1"
    - name: "Cart + Checkout"
      requirements: [REQ-003, REQ-004]
      deliverables: ["Cart API", "Stripe integration", "Integration tests"]
      estimated_duration: "Week 2"
    - name: "Admin + Polish"
      requirements: [REQ-005]
      deliverables: ["Admin endpoints", "Full test suite", "API documentation"]
      estimated_duration: "Week 3"
```

## Example 2: Vague Brief → Questions

### Client Brief (Input)
"We need an app for our team to track projects."

### Scoped Output (Asks Questions First)

```yaml
project_scope:
  project_name: Team Project Tracker
  client: Unknown
  summary: "INCOMPLETE — Brief is too vague to scope. Questions below must be answered before proceeding."
  
  requirements: []  # Cannot scope without answers
  
  gaps:
    - question: "Web app, mobile app, or both?"
      blocking: true
      default_assumption: null
    - question: "How many team members will use this?"
      blocking: false
      default_assumption: "10-50 users"
    - question: "What does 'track projects' mean specifically? Tasks, time tracking, milestones, Gantt charts?"
      blocking: true
      default_assumption: null
    - question: "Do you have existing tools (Jira, Asana, Trello) you're replacing? What's missing?"
      blocking: false
      default_assumption: null
    - question: "Any integrations needed (Slack, email, calendar)?"
      blocking: false
      default_assumption: "None initially"
    - question: "User roles needed (admin, manager, team member)?"
      blocking: true
      default_assumption: null
    - question: "Timeline and budget range?"
      blocking: false
      default_assumption: null
      
  estimates:
    total_tasks: 0
    duration_range: "Cannot estimate without requirements"
    confidence: low
    risk_level: high
```

This is the CORRECT behavior — never scope what you can't define.
```

---

## PROMPT 5: Create Client Reporter SKILL Files

### What it does
Creates SKILL files for the Client Reporter agent — generates progress reports, milestone summaries, and cost tracking from project data.

### Why
Clients don't care about BullMQ job statuses. They need "here's what we built this week, here's what's next, here's what we need from you."

### Claude Code Prompt

```
Create two files in skills/client-reporter/ directory (create directory if needed):

### FILE 1: skills/client-reporter/SKILL-client-reporter-core.md

# Client Reporter - Core

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: always -->

## Identity

You are a **Client Reporter**. You transform internal project data (task statuses, completion rates, token costs) into client-facing progress reports. You write for a non-technical audience. No jargon. No internal system details.

## Core Responsibilities

1. **Weekly Progress Reports** — summarize what was done, what's in progress, what's blocked
2. **Milestone Reports** — what was delivered, does it match the scope
3. **Project Summaries** — end-of-project retrospective for client
4. **Blocker Escalation** — highlight decisions the client needs to make

## Output Format

```xml
<report type="weekly | milestone | summary">
[Markdown content — client-facing language]
</report>

<internal_notes>
[Observations for the human founder only — not shared with client]
</internal_notes>
```

## Writing Rules

### You MUST:
- Write in plain English — no technical jargon
- Use "we" language (consulting team voice)
- Lead with accomplishments, then blockers
- Quantify progress (X of Y features complete)
- Include clear "Action Items for [Client]" if decisions needed
- Keep reports under 1 page (500 words max for weekly)

### You MUST NOT:
- Mention agents, AI, BullMQ, tokens, or any internal tooling
- Share token costs or API costs (internal only)
- Over-promise on timelines
- Apologize for normal development pace
- Include code snippets (unless client is technical and requests them)

### Tone:
Professional, confident, concise. Like a senior project manager reporting to a client. Not salesy. Not apologetic. Factual.

## Internal Notes

Separately from the client report, generate internal notes for the founder:
- Token cost this period
- Agent acceptance rate (first attempt success)
- Tasks that took more attempts than expected
- Recommendations for next week's priorities
- Scope creep warnings (if tasks are growing beyond original scope)

## Escalation Triggers

Flag for human review before sending:
1. Project is behind milestone targets
2. Scope has grown beyond original estimate by > 20%
3. Client has unanswered blocking questions older than 3 days
4. Token costs are significantly above projection

## Model Configuration

- **Model:** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Temperature:** 0.3 (slightly creative for writing, mostly structured)
- **Max Tokens:** 8000


### FILE 2: skills/client-reporter/SKILL-client-reporter-patterns.md

# Client Reporter - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard reporting tasks -->

## Weekly Update Template

```markdown
# Weekly Update: [Project Name]
## Week of [Date]

### Completed This Week
- [Feature/deliverable] — [one sentence description]
- [Feature/deliverable] — [one sentence description]

### In Progress
- [Feature/deliverable] — [expected completion]
- [Feature/deliverable] — [expected completion]

### Blocked / Needs Your Input
- [Question or decision] — [why we need this to proceed]

### Next Week
- [Planned work]

### Milestone Progress
[Milestone Name]: [X]% complete ([Y of Z] deliverables done)
```

## Milestone Report Template

```markdown
# Milestone Complete: [Milestone Name]
## Project: [Project Name]
## Date: [Date]

### What Was Delivered
- [Deliverable 1] — [description]
- [Deliverable 2] — [description]

### How It Matches the Scope
[Brief comparison to original scope — any additions or changes]

### Demo / Access
[Link to staging, demo, or instructions]

### Next Milestone: [Name]
- [What's planned]
- [Target completion]
- [Any prerequisites from client]
```

## Internal Notes Template

```yaml
internal_report:
  period: string
  project_id: string
  
  costs:
    total_tokens: number
    api_cost_usd: number
    estimated_billable_hours: number
    margin_note: string
    
  quality:
    tasks_completed: number
    first_attempt_success: number
    required_revision: number
    human_interventions: number
    
  risks:
    - description: string
      severity: low | medium | high
      recommendation: string
      
  scope_health:
    original_task_estimate: number
    current_task_count: number
    variance_percentage: number
    scope_creep_warning: boolean
```

## Cost-to-Hours Mapping

Internal heuristic for converting token costs to approximate billable hours:
- Simple task (~3K tokens): ~0.25 billable hours
- Standard task (~10K tokens): ~1 billable hour  
- Complex task (~30K tokens): ~2-3 billable hours
- QA task: 50% of the implementation task hours

This is approximate. The human founder sets actual billing rates. The reporter provides the data.
```

---

## PROMPT 6: Update Orchestrator SKILL Files

### What it does
Updates the existing Orchestrator SKILL files to include project-level awareness. Currently the orchestrator only thinks in tasks. It needs to understand projects, clients, and milestones.

### Why
Without project context, the orchestrator can't prioritize across projects, track milestone progress, or feed data to the Client Reporter.

### Claude Code Prompt

```
Update these three existing files:

### FILE 1: SKILL-orchestrator-core.md

Make these specific changes:

1. In the "Identity" section, CHANGE the first sentence to:
"You are the Agent Orchestrator - the central coordinator for all development agents and the project management backbone of SoloEnterprise."

2. In "Core Responsibilities", ADD these items:
- **Project Management**: Track project status, milestone progress, and multi-project priorities
- **Scope Enforcement**: Ensure tasks stay within approved project scope
- **Client Context**: Pass project and client context to all agent invocations

3. In "Agent Registry", ADD two new rows:
| `project-scoper` | Client briefs → structured project specs, estimates |
| `client-reporter` | Progress reports, milestone summaries, cost tracking |

4. In the "Task Structure" YAML, ADD a `project` section at the top:
```yaml
task:
  project_id: string            # Which project this belongs to
  project_name: string          # For agent context
  milestone: string             # Which milestone this is part of
  # ... rest of existing task structure unchanged
```

5. In "Output Format", ADD a `project_context` field:
```yaml
action: string
project_id: string       # Always include project context
tasks: []
questions: []
status_updates: []
file_locks: []
milestone_progress: {}   # Updated milestone completion data
```

6. In "Non-Negotiable Rules", ADD:
7. **No task created without a project_id**
8. **No engineering work without an approved scope**
9. **Scope changes require human approval before adding tasks**

### FILE 2: SKILL-orchestrator-assignment.md

Make these specific changes:

1. ADD a new section "## Project Scoping Workflow" BEFORE "## File Lock Protocol":

```
## Project Scoping Workflow

### New Project Flow

```yaml
command: scope_project
input:
  brief_id: string
  
actions:
  1. Load client brief from database
  2. Invoke Project Scoper agent with brief
  3. Store generated scope
  4. Queue scope for human review
  5. WAIT for human approval
  6. On approval: create project record, generate tasks from scope
  7. On rejection: archive or return to scoping
```

### Scope-to-Tasks Conversion

When a scope is approved, convert requirements to tasks:
- Each REQ-xxx becomes one or more tasks
- Respect dependency order from scope
- Assign agent types from scope's agent_types field
- Group tasks by milestone
- Set priorities based on dependency chain (blocking tasks = higher priority)

```

2. In "## Task Decomposition Guidelines", ADD as step 0:
"0. **Verify scope exists** — never decompose without an approved project scope"

### FILE 3: SKILL-orchestrator-examples.md

ADD a new example at the TOP (before existing examples):

```
## Pattern: New Client Project (Full Flow)

```yaml
# Input: Approved project scope for "E-commerce API" (see Project Scoper examples)

# Step 1: Create project from scope
action: create_project
project:
  id: PRJ-001
  name: E-commerce API
  client: Example Corp
  scope_id: SCOPE-001
  status: active

# Step 2: Generate tasks from scope requirements
tasks:
  # Milestone 1: Auth + Products
  - task: PRJ-001-TASK-001
    project_id: PRJ-001
    milestone: "Auth + Products"
    name: User registration endpoint
    agent: backend
    description: POST /api/auth/register with email/password, JWT tokens
    dependencies: []
    
  - task: PRJ-001-TASK-002
    project_id: PRJ-001
    milestone: "Auth + Products"
    name: User login endpoint
    agent: backend
    description: POST /api/auth/login with JWT token response
    dependencies: [PRJ-001-TASK-001]
    
  - task: PRJ-001-TASK-003
    project_id: PRJ-001
    milestone: "Auth + Products"
    name: Auth tests
    agent: qa
    description: Unit and integration tests for auth endpoints
    dependencies: [PRJ-001-TASK-002]
    
  # ... continued for all requirements
  
# Step 3: Queue Milestone 1 tasks (no dependencies met check needed for first batch)
queued: [PRJ-001-TASK-001]
blocked: [PRJ-001-TASK-002, PRJ-001-TASK-003]  # Waiting on dependencies
```
```

Do NOT change anything else in these files. Only add/modify the specific sections noted above.
```

---

## PROMPT 7: Update Supporting Documentation

### What it does
Updates ADDING_NEW_AGENT.md and DOCUMENTATION_STRUCTURE.md to reflect the new business operations agents.

### Why
These reference docs need to include the new agent types so future development follows the same patterns.

### Claude Code Prompt

```
Make these changes to two files:

### FILE 1: ADDING_NEW_AGENT.md

1. In "## Pre-Flight: Before Writing Code", ADD a new checkbox:
- [ ] Determine agent category: `engineering` (writes code) or `business` (writes documents/reports)

2. AFTER the "## Special Case: Orchestrator Agent" section, ADD a new section:

## Special Case: Business Operations Agents

Business agents (Project Scoper, Client Reporter) differ from engineering agents:

### Differences from Engineering Agents

| Aspect | Engineering Agent | Business Agent |
|--------|------------------|----------------|
| Output | Code files in sandbox | Documents (markdown, YAML) |
| Sandbox | `generated/tasks/{id}/` | `generated/reports/{project-id}/` |
| Context needed | Code, schema, routes | Project scope, task statuses, client info |
| Quality gates | Lint, type check, tests | Human review (always) |
| Model | Sonnet (code generation) | Opus (scoper) or Sonnet (reporter) |

### Context Loader

Business agents need different context than engineering agents:

```typescript
// Engineering agents
const context = await buildBackendContext(task, profile);

// Business agents
const context = await buildProjectContext(projectId);
// Includes: scope, task statuses, milestones, client info, cost data
```

### Output Handling

Business agent outputs go to `generated/reports/{project-id}/`:
- `scope-{date}.md` — project scope documents
- `weekly-{date}.md` — weekly client reports
- `milestone-{name}.md` — milestone completion reports
- `internal-{date}.yaml` — internal metrics (not client-facing)

3. In "## Quick Reference: File Locations", ADD rows:

| Business SKILL files | `skills/{agent-type}/SKILL-{type}-*.md` |
| Report outputs | `generated/reports/{project-id}/` |
| Project context loader | `packages/core/src/agents/utils/project-context-loader.ts` |

### FILE 2: DOCUMENTATION_STRUCTURE.md

1. In the "Current Structure" tree, ADD under `packages/core/generated/`:

```
│   │       └── reports/{project-id}/   # Client-facing reports
```

2. In the skills tree, ADD:

```
│   ├── project-scoper/
│   │   ├── SKILL-project-scoper-core.md
│   │   ├── SKILL-project-scoper-patterns.md
│   │   └── SKILL-project-scoper-examples.md
│   └── client-reporter/
│       ├── SKILL-client-reporter-core.md
│       └── SKILL-client-reporter-patterns.md
```

3. In the "Document Types" table, ADD:

| Consulting Pipeline | docs/ | Business workflow | Human |
| Client Reports | generated/reports/ | Client deliverables | Client Reporter Agent |
| Project Scopes | generated/reports/ | Structured specs | Project Scoper Agent |

4. In the "Quick Reference" section, ADD:

```bash
# Business workflow
→ docs/CONSULTING_PIPELINE.md

# Project scope output
→ generated/reports/{project-id}/scope-{date}.md

# Client progress reports
→ generated/reports/{project-id}/weekly-{date}.md
```
```

---

## PROMPT 8: Database Schema Documentation

### What it does
Documents the new database tables needed for multi-project/client management. This is specification for the Claude Code implementation, not the implementation itself.

### Why
You'll need these tables to support the consulting pipeline. The doc provides the exact schema so Claude Code can implement it cleanly.

### Claude Code Prompt

```
Create a new file: docs/SCHEMA_ADDITIONS.md

Write the following content:

# Database Schema Additions: Consulting Pipeline

**Purpose:** New tables required to support the consulting business pipeline.
**Implementation:** Add to `packages/db/src/schema.ts` using Drizzle ORM.
**Prerequisites:** Existing tables (projects, tasks, questions, file_locks, artifacts, deployments, agent_sessions) remain unchanged.

---

## New Tables

### clients

Tracks client organizations. A client can have multiple projects.

```typescript
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  notes: text('notes'),
  status: text('status').notNull().default('active'), // active | archived
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### project_briefs

Raw client briefs before scoping. One brief produces one scope (or gets rejected).

```typescript
export const projectBriefs = pgTable('project_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id),
  title: text('title').notNull(),
  rawContent: text('raw_content').notNull(),  // Unstructured client input
  status: text('status').notNull().default('received'), // received | scoping | scoped | approved | rejected
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### project_scopes

Structured scope generated by Project Scoper agent. Links to brief and project.

```typescript
export const projectScopes = pgTable('project_scopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  briefId: uuid('brief_id').references(() => projectBriefs.id).notNull(),
  projectId: uuid('project_id').references(() => projects.id), // null until approved
  scopeData: jsonb('scope_data').notNull(),      // Full YAML scope as JSON
  clientDocument: text('client_document'),         // Markdown scope doc for client
  estimatedTasks: integer('estimated_tasks'),
  estimatedDuration: text('estimated_duration'),
  riskLevel: text('risk_level'),                   // low | medium | high
  status: text('status').notNull().default('draft'), // draft | pending_review | approved | rejected
  approvedBy: text('approved_by'),                 // 'human' always for now
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### milestones

Project milestones from the approved scope. Tasks link to milestones.

```typescript
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  deliverables: jsonb('deliverables'),            // string[]
  targetDate: text('target_date'),                 // Relative: "Week 2"
  status: text('status').notNull().default('pending'), // pending | in_progress | completed | blocked
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### client_reports

Generated progress reports for clients.

```typescript
export const clientReports = pgTable('client_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  reportType: text('report_type').notNull(),       // weekly | milestone | summary
  reportContent: text('report_content').notNull(),  // Markdown
  internalNotes: text('internal_notes'),            // YAML — founder-only
  period: text('period'),                           // "2026-W06" or milestone name
  status: text('status').notNull().default('draft'), // draft | reviewed | sent
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### cost_tracking

Token costs per project per period. Feeds into billing and client reporting.

```typescript
export const costTracking = pgTable('cost_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  taskId: uuid('task_id').references(() => tasks.id),
  agentType: text('agent_type').notNull(),
  tokensInput: integer('tokens_input').notNull(),
  tokensOutput: integer('tokens_output').notNull(),
  cachedTokens: integer('cached_tokens').default(0),
  apiCostUsd: numeric('api_cost_usd', { precision: 10, scale: 4 }),
  estimatedBillableHours: numeric('estimated_billable_hours', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## Schema Modifications to Existing Tables

### projects table — ADD columns:

```typescript
// Add to existing projects table:
clientId: uuid('client_id').references(() => clients.id),
scopeId: uuid('scope_id').references(() => projectScopes.id),
currentMilestone: text('current_milestone'),
billingStatus: text('billing_status').default('not_started'), // not_started | in_progress | invoiced | paid
```

### tasks table — ADD columns:

```typescript
// Add to existing tasks table:
milestoneId: uuid('milestone_id').references(() => milestones.id),
```

## Relationships

```
clients 1──∞ project_briefs
project_briefs 1──1 project_scopes
project_scopes 1──1 projects (after approval)
projects 1──∞ milestones
milestones 1──∞ tasks
projects 1──∞ client_reports
projects 1──∞ cost_tracking
tasks 1──∞ cost_tracking
```

## Migration Notes

- All new tables. No data migration needed.
- Existing `projects` and `tasks` tables get new nullable columns — no breaking change.
- Run `pnpm drizzle-kit generate` after adding to schema.ts.
- Run `pnpm drizzle-kit push` to apply to Neon.

---

*Implement after Phase 5 orchestrator is working. Schema should be in place before Phase 6 (Project Scoper) begins.*
```

---

## Summary: What You Get After Running All 8 Prompts

| Before | After |
|--------|-------|
| 4 engineering agents | 4 engineering + 2 business agents planned |
| Task-level orchestration | Project-level orchestration |
| No client pipeline | Full intake → scope → execute → deliver → report pipeline |
| No multi-project support | Multi-project architecture documented |
| Engineering-only phases | Business ops phases inserted at Phase 6-6.5 |
| No validation gate | Phase 5.5 mandatory real-project validation |
| No cost tracking | Token → billable hours mapping designed |
| DevOps as next priority | Pushed to Phase 7 (can be manual initially) |

The code itself (agent implementations, API routes, UI changes) will come when you actually execute each phase. These prompts set up the documentation, SKILL files, and architectural foundation so Claude Code has clear specs to work from.

---

## Post-Plan Status Updates

### Phase 6.9: Code Scaffolder (COMPLETE — 2026-02-27)

The scaffolder pipeline is fully operational with 10/10 integration tests passed. This enables:
- **Multi-Framework Scaffolds (Proposed Phase 8.x):** The scaffold type detection architecture supports framework-specific templates. Currently Hono + Next.js only. Additional frameworks (Fastify, Express, SvelteKit) can be layered on top without architectural changes.
- **Technology Tracking (Proposed Phase 9.x):** Parsing project scopes for tech stacks to inform scaffold template priority.

Token savings measured at 20-22% (below the 40-60% projection). The scaffolder's primary value is structural consistency and retry reduction, not raw token savings.

All 8 transformation prompts from this plan have been executed. The consulting business pipeline (intake → scope → execute → deliver → report) is operational. Remaining work is automation quality (DevOps, Phase 7) and scale (multi-agent, Phase 8).
