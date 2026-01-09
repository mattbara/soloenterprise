# Parallel Agent Orchestration System
## Technical Architecture for Solo Founder Product Factory

---

## Core Design Principles

1. **Parallelism over sequence.** 20 tasks running simultaneously, not one after another.
2. **Non-blocking human checkpoints.** When an agent needs human input, it queues the question and either waits or moves to other work—never blocks the entire system.
3. **Continuous QA.** Every output (code, copy, designs) gets automatically validated.
4. **Artifact-first.** Everything produces tangible outputs stored in a structured workspace.
5. **Resumable state.** System can be stopped and resumed. Agents can retry failed tasks.
6. **Observable.** You can see what every agent is doing, what's blocked, what's complete.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN INTERFACE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Dashboard  │  │  Question   │  │  Artifact   │  │  Real-time Logs     │ │
│  │  (Status)   │  │    Queue    │  │   Browser   │  │  & Agent Activity   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATION LAYER                                │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │   Task Router    │  │   State Manager  │  │   Dependency Resolver      │ │
│  │                  │  │                  │  │                            │ │
│  │ - Assigns tasks  │  │ - Project state  │  │ - Tracks what blocks what  │ │
│  │ - Load balances  │  │ - Agent states   │  │ - Unblocks when deps met   │ │
│  │ - Retries failed │  │ - Checkpoints    │  │ - Detects cycles           │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │  Human Queue     │  │  Event Bus       │  │   QA Pipeline Trigger      │ │
│  │                  │  │                  │  │                            │ │
│  │ - Pending Qs     │  │ - Agent events   │  │ - Watches artifacts        │ │
│  │ - Priority sort  │  │ - State changes  │  │ - Triggers validation      │ │
│  │ - Context attach │  │ - Notifications  │  │ - Reports failures         │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AGENT WORKER POOL                                 │
│                                                                              │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│   │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent 4 │ │ Agent 5 │ │ Agent N │  │
│   │         │ │         │ │         │ │         │ │         │ │         │  │
│   │ Backend │ │Frontend │ │Marketing│ │  Legal  │ │   QA    │ │  ...    │  │
│   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│        │           │           │           │           │           │       │
│        └───────────┴───────────┴─────┬─────┴───────────┴───────────┘       │
│                                      │                                      │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SHARED RESOURCES                                  │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │  Artifact Store  │  │   Skill Library  │  │   Context Database         │ │
│  │                  │  │                  │  │                            │ │
│  │ /project         │  │ - Code patterns  │  │ - Project requirements     │ │
│  │   /src           │  │ - Doc templates  │  │ - Design decisions         │ │
│  │   /docs          │  │ - Legal clauses  │  │ - User research            │ │
│  │   /marketing     │  │ - Marketing      │  │ - Competitor analysis      │ │
│  │   /legal         │  │ - Test patterns  │  │ - Brand guidelines         │ │
│  │   /designs       │  │ - Deploy scripts │  │ - Technical specs          │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │  Vector Store    │  │   Tool Registry  │  │   Secrets Manager          │ │
│  │                  │  │                  │  │                            │ │
│  │ - Semantic search│  │ - Web search     │  │ - API keys                 │ │
│  │ - Similar code   │  │ - Code execution │  │ - Deploy credentials       │ │
│  │ - Past decisions │  │ - Image gen      │  │ - Service accounts         │ │
│  │                  │  │ - Browser        │  │                            │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTINUOUS QA PIPELINE                               │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Code Tests  │  │  Security    │  │  Content     │  │  Integration     │ │
│  │              │  │  Scanner     │  │  Validator   │  │  Tests           │ │
│  │ - Unit       │  │              │  │              │  │                  │ │
│  │ - Lint       │  │ - SAST       │  │ - Brand      │  │ - E2E            │ │
│  │ - Type check │  │ - Deps audit │  │ - Legal flags│  │ - API contracts  │ │
│  │ - Build      │  │ - Secrets    │  │ - SEO        │  │ - Performance    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEPLOYMENT TARGETS                                  │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Staging    │  │  Production  │  │  Marketing   │  │  Monitoring      │ │
│  │              │  │              │  │  Site        │  │                  │ │
│  │ - Preview    │  │ - Live app   │  │              │  │ - Errors         │ │
│  │ - Testing    │  │ - Real users │  │ - Landing    │  │ - Analytics      │ │
│  │              │  │              │  │ - Blog       │  │ - Uptime         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Task State Machine

Every task in the system follows this state machine:

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│ PENDING │───▶│ RUNNING │───▶│NEEDS_HU-│───▶│ WAITING │──┘
│         │    │         │    │MAN_INPUT│    │         │
└─────────┘    └────┬────┘    └─────────┘    └─────────┘
                    │              │
                    │              │ (human responds)
                    │              ▼
                    │         ┌─────────┐
                    │         │ RUNNING │ (resumed)
                    │         └────┬────┘
                    │              │
                    ▼              ▼
               ┌─────────┐    ┌─────────┐
               │COMPLETED│    │ FAILED  │───▶ (retry or escalate)
               └─────────┘    └─────────┘
```

**Key behaviors:**
- `NEEDS_HUMAN_INPUT`: Agent queues question, task pauses, other tasks continue
- `WAITING`: Task is blocked on dependency (another task must complete first)
- `FAILED`: Automatic retry up to N times, then escalate to human
- `COMPLETED`: Artifacts saved, dependent tasks unblocked

---

## The Human Question Queue

This is the critical interface—how you interact with 20 parallel agents without being overwhelmed.

### Question Structure

```typescript
interface HumanQuestion {
  id: string;
  task_id: string;
  agent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  blocking: string[];  // Task IDs blocked by this question
  
  question: string;
  context: string;     // What the agent was doing
  options?: string[];  // Suggested answers if applicable
  
  artifacts?: string[];  // Links to relevant files
  
  asked_at: timestamp;
  deadline?: timestamp;  // When this becomes critical
  
  // For batching similar questions
  category: 'architecture' | 'design' | 'legal' | 'marketing' | 'technical' | 'strategic';
}
```

### Queue Interface Design

```
┌─────────────────────────────────────────────────────────────────────┐
│  PENDING DECISIONS                                    [12 pending]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🔴 CRITICAL (2)                                                    │
│  ├─ [Architecture] Database choice blocks 5 tasks                   │
│  │   "PostgreSQL vs MongoDB for user data? Expected 100K users..."  │
│  │   [PostgreSQL] [MongoDB] [Need more info] [Let me think]         │
│  │                                                                  │
│  └─ [Legal] Terms of Service: liability clause wording              │
│      "Standard limitation or custom? This affects..."               │
│      [View draft] [Standard] [Custom - specify]                     │
│                                                                     │
│  🟡 HIGH (4)                                                        │
│  ├─ [Design] Hero section: illustration vs. product screenshot?     │
│  ├─ [Marketing] Tagline options: A, B, or C?                        │
│  ├─ [Technical] Auth: email/password, OAuth only, or both?          │
│  └─ [Strategic] Pricing: freemium or trial?                         │
│                                                                     │
│  🟢 MEDIUM (6)                                                      │
│  └─ [Expand to see...]                                              │
│                                                                     │
│  ───────────────────────────────────────────────────────────────    │
│  [Answer All Similar] [Batch Mode] [View Dependency Graph]          │
└─────────────────────────────────────────────────────────────────────┘
```

### Batching Similar Questions

When agents ask similar questions, batch them:

```
┌─────────────────────────────────────────────────────────────────────┐
│  BATCH: Design Tone (4 questions)                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  These agents need to know your brand voice:                        │
│  - Marketing copy agent (homepage)                                  │
│  - Email sequence agent (onboarding)                                │
│  - Documentation agent (help docs)                                  │
│  - Social media agent (launch posts)                                │
│                                                                     │
│  Select brand voice:                                                │
│  ○ Professional & Authoritative                                     │
│  ○ Friendly & Approachable                                          │
│  ○ Technical & Precise                                              │
│  ○ Playful & Bold                                                   │
│  ○ Let me describe: [________________]                              │
│                                                                     │
│  [Apply to all 4] [Answer individually]                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Workstream Definitions

Instead of "19 agents," think of **workstreams** that can run in parallel:

### Phase 1 Workstreams (Can Run Simultaneously)

| Workstream | Agents Involved | Outputs | Dependencies |
|------------|-----------------|---------|--------------|
| Market Research | Market Analyst, Competitor Analyst | Market report, competitor matrix | Initial idea input |
| Technical Scoping | Architect, Tech Researcher | Tech spec, architecture diagram | Initial idea input |
| Legal Research | Legal Researcher | Regulatory checklist, risk assessment | Market research (partial) |
| UX Research | User Researcher | Personas, user journeys | Initial idea input |

**Sync Point:** All Phase 1 workstreams complete → Human reviews → Go/No-Go

### Phase 2 Workstreams (Can Run Simultaneously After Phase 1)

| Workstream | Agents Involved | Outputs | Dependencies |
|------------|-----------------|---------|--------------|
| Product Definition | Product Strategist | PRD, feature specs | Phase 1 complete |
| UX Design | UX Designer | Wireframes, design system | Personas, user journeys |
| Backend Design | Backend Architect | API spec, data models | Tech spec |
| Marketing Strategy | Marketing Strategist | GTM plan, messaging | Market report |

**Sync Point:** Specs approved → Development begins

### Phase 3 Workstreams (Heavy Parallelization)

| Workstream | Agents Involved | Outputs | Dependencies |
|------------|-----------------|---------|--------------|
| Backend Dev | Backend Developer | API, database, auth | API spec |
| Frontend Dev | Frontend Developer | UI components, pages | Wireframes, API spec |
| Content Creation | Copywriter, SEO | Website copy, blog posts | Messaging framework |
| Legal Drafting | Legal Drafter | ToS, Privacy Policy | Regulatory checklist |
| Test Automation | QA Engineer | Test suites | Feature specs |
| DevOps Setup | DevOps Engineer | CI/CD, infrastructure | Tech spec |

**Continuous:** QA pipeline runs against all code changes

### Phase 4 Workstreams (Pre-Launch)

| Workstream | Agents Involved | Outputs | Dependencies |
|------------|-----------------|---------|--------------|
| Integration Testing | QA Lead | Test reports, bug fixes | All dev complete |
| Marketing Assets | Designer, Copywriter | Landing page, social | Content + Design |
| Documentation | Tech Writer | Help docs, API docs | Working product |
| Launch Prep | Launch Coordinator | Launch checklist | All above |

---

## The Dependency Graph

Visualizing what blocks what:

```
                         ┌─────────────┐
                         │  IDEA INPUT │
                         └──────┬──────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │   MARKET    │      │  TECHNICAL  │      │     UX      │
   │  RESEARCH   │      │   SCOPING   │      │  RESEARCH   │
   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
          │                    │                    │
          │                    │                    │
          ▼                    │                    ▼
   ┌─────────────┐             │             ┌─────────────┐
   │   LEGAL     │             │             │  PERSONAS   │
   │  RESEARCH   │             │             └──────┬──────┘
   └──────┬──────┘             │                    │
          │                    │                    │
          │    ┌───────────────┼───────────────┐    │
          │    │               │               │    │
          ▼    ▼               ▼               ▼    ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │  MARKETING  │      │   PRODUCT   │      │     UX      │
   │  STRATEGY   │      │ DEFINITION  │      │   DESIGN    │
   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
          │                    │                    │
          │         ┌──────────┴──────────┐         │
          │         │                     │         │
          │         ▼                     ▼         │
          │  ┌─────────────┐      ┌─────────────┐   │
          │  │   BACKEND   │      │   FRONTEND  │◀──┘
          │  │   DESIGN    │      │   DESIGN    │
          │  └──────┬──────┘      └──────┬──────┘
          │         │                    │
          │         ▼                    ▼
          │  ┌─────────────┐      ┌─────────────┐
          │  │   BACKEND   │◀────▶│  FRONTEND   │
          │  │     DEV     │      │     DEV     │
          │  └──────┬──────┘      └──────┬──────┘
          │         │                    │
          │         └──────────┬─────────┘
          │                    │
          │                    ▼
          │            ┌─────────────┐
          │            │ INTEGRATION │
          │            │   TESTING   │
          │            └──────┬──────┘
          │                   │
          └──────────┬────────┘
                     │
                     ▼
              ┌─────────────┐
              │   LAUNCH    │
              │    PREP     │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │   DEPLOY    │
              └─────────────┘
```

---

## Technology Stack Recommendation

Given your requirements (solo operation, production-ready, needs to scale):

### Orchestration Layer

| Component | Recommendation | Why |
|-----------|---------------|-----|
| Task Queue | **BullMQ + Redis** | Battle-tested, great visibility, Redis is simple |
| State Store | **PostgreSQL** | Structured project data, you know it well |
| Event Bus | **Redis Pub/Sub** | Same Redis instance, simple |
| API Layer | **FastAPI (Python)** or **Hono (TypeScript)** | Depends on your preference |

Alternative: **Temporal.io** if you want built-in workflow orchestration (more complex but more powerful)

### Agent Runtime

| Component | Recommendation | Why |
|-----------|---------------|-----|
| LLM Provider | **Anthropic API** | Claude is best for code, reasoning |
| Agent Framework | **Custom lightweight** or **LangGraph** | Most frameworks add bloat; you can build exactly what you need |
| Tool Execution | **Sandboxed containers** | Each agent gets isolated environment |

### Artifact Storage

| Component | Recommendation | Why |
|-----------|---------------|-----|
| Code Artifacts | **Git repo per project** | Version control, branching, you know it |
| Documents | **S3-compatible storage** | Minio locally, S3 in prod |
| Vector Store | **pgvector** | Stays in PostgreSQL, one less service |

### CI/CD & Quality

| Component | Recommendation | Why |
|-----------|---------------|-----|
| CI/CD | **GitHub Actions** | Native, free tier generous |
| Testing | **Vitest/Jest + Playwright** | Fast, comprehensive |
| Security | **Trivy + npm audit** | Catches common issues |
| Monitoring | **Sentry + Axiom** | Errors + logs in one |

### Human Interface

| Component | Recommendation | Why |
|-----------|---------------|-----|
| Dashboard | **Next.js + shadcn/ui** | Fast to build, good DX |
| Real-time Updates | **Server-Sent Events** | Simpler than WebSockets for your use case |
| Auth | **Clerk** or **NextAuth** | Don't build auth |

### Deployment

| Component | Recommendation | Why |
|-----------|---------------|-----|
| App Hosting | **Vercel** or **Railway** | Easy, handles scaling |
| Database | **Neon** or **Supabase** | Managed Postgres |
| Redis | **Upstash** | Serverless Redis, generous free tier |
| Containers | **Fly.io** | For agent sandboxes if needed |

---

## Suggested Tech Stack (Opinionated)

Based on "production-ready for solo dev":

```
Orchestration:
├── BullMQ (task queue)
├── Redis (state + pubsub)
├── PostgreSQL + pgvector (data + embeddings)
└── Custom TypeScript orchestrator

Agent Layer:
├── Anthropic Claude API (Opus 4.5 + Sonnet 4.5)
├── Custom agent runtime (not LangChain)
├── Sandboxed code execution (Docker or Firecracker)
└── Tool registry (web search, code exec, file ops)

Human Interface:
├── Next.js 14+ (App Router)
├── shadcn/ui (components)
├── TanStack Query (data fetching)
├── Server-Sent Events (real-time)
└── Clerk (auth)

Deployment:
├── Vercel (web app)
├── Railway (workers + Redis)
├── Neon (PostgreSQL)
└── GitHub Actions (CI/CD)

Generated Projects Deploy To:
├── Vercel or Railway (apps)
├── Neon or Supabase (databases)
└── Cloudflare R2 (assets)
```

---

## Build Phases

### Phase 0: Foundation (Week 1-2)

Build the core orchestration before ANY agents:

1. **Project data model**
   - Projects table
   - Tasks table with state machine
   - Artifacts table
   - Questions queue table

2. **Basic orchestrator**
   - Task creation/assignment
   - State transitions
   - Dependency tracking
   - Question queue

3. **Minimal UI**
   - Project list
   - Question queue view
   - Task status view

4. **One test agent**
   - Simple "echo" agent that takes a task, asks a question, produces an artifact
   - Proves the orchestration works

### Phase 1: Core Agents (Week 3-4)

Build the minimum agents to produce a working product:

1. **Backend Developer Agent**
   - Takes spec, produces code
   - Writes to artifact store (git)
   - Runs tests, reports results

2. **Frontend Developer Agent**
   - Same pattern
   - Integrates with backend via API spec

3. **QA Agent**
   - Watches artifact changes
   - Runs test suite
   - Reports failures

4. **DevOps Agent**
   - Sets up CI/CD
   - Deploys to staging
   - Basic monitoring

**Milestone:** Can generate and deploy a simple working app

### Phase 2: Ideation & Planning Agents (Week 5-6)

Work backwards to add the front of the pipeline:

1. **Idea Interviewer Agent**
2. **Market Research Agent**
3. **Product Strategist Agent**
4. **Technical Architect Agent**

**Milestone:** End-to-end from idea → deployed app

### Phase 3: Go-To-Market Agents (Week 7-8)

1. **Marketing Strategist Agent**
2. **Content Creator Agent**
3. **Legal Draft Agent**

**Milestone:** Deployed app + marketing site + legal docs

### Phase 4: Polish & Hardening (Week 9-10)

1. Better error handling and retries
2. Agent memory (learning from past projects)
3. Improved UI/UX
4. Performance optimization
5. Documentation

### Phase 5: Dogfooding (Week 11-12)

Use it to build 2-3 of your own product ideas. Fix everything that breaks.

---

## Agent Specification Format

Each agent should be defined in a standard format:

```yaml
agent:
  id: backend-developer
  name: Backend Developer
  model: claude-sonnet-4-5-20250929
  
  description: |
    Implements server-side logic, APIs, and database operations.
    Writes production-quality code with tests.
  
  inputs:
    required:
      - api_specification    # From architect agent
      - data_models          # From architect agent
      - tech_stack           # From project config
    optional:
      - existing_codebase    # If iterating
      - test_results         # If fixing bugs
  
  outputs:
    - type: code
      path: /src/backend/**
      format: typescript
    - type: tests
      path: /tests/backend/**
      format: typescript
    - type: documentation
      path: /docs/api/**
      format: markdown
  
  tools:
    - code_execution
    - file_operations
    - git_operations
    - package_manager
    - database_client
    - web_search  # For documentation lookup
  
  quality_gates:
    - all_tests_pass
    - no_lint_errors
    - no_type_errors
    - no_critical_security_issues
  
  human_checkpoint_triggers:
    - architecture_decision_needed
    - security_tradeoff
    - external_service_selection
    - data_model_change
  
  max_iterations: 5  # Before escalating to human
  
  system_prompt: |
    You are a senior backend developer working on {project_name}.
    
    ## Your Context
    - Tech Stack: {tech_stack}
    - Project Phase: {current_phase}
    - Your Task: {task_description}
    
    ## Available Information
    {context_documents}
    
    ## Quality Standards
    - Write production-ready code, not prototypes
    - Include comprehensive error handling
    - Write tests for all public functions
    - Follow {coding_standards}
    
    ## When to Ask for Human Input
    - Architectural decisions that affect multiple components
    - Security-sensitive choices
    - External service selection (payment processors, etc.)
    - Any ambiguity in requirements
    
    ## Output Format
    Always structure your output as:
    1. Plan: What you're going to do
    2. Implementation: The actual code
    3. Tests: Test cases
    4. Questions: Any decisions you need human input on
```

---

## Context Management

Agents need context but have limited windows. Here's the strategy:

### Context Hierarchy

```
┌────────────────────────────────────────────────────────────┐
│ ALWAYS LOADED (small, critical)                            │
│ - Project brief (500 tokens)                               │
│ - Tech stack decisions (200 tokens)                        │
│ - Current task specification (variable)                    │
│ - Quality standards (300 tokens)                           │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ LOADED ON DEMAND (retrieved based on task)                 │
│ - Relevant code files (semantic search)                    │
│ - Related documentation                                    │
│ - Past decisions on similar topics                         │
│ - Test results if fixing bugs                              │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│ AVAILABLE VIA TOOLS (agent requests when needed)           │
│ - Full codebase (via file read tool)                       │
│ - Web search for documentation                             │
│ - Database queries                                         │
│ - Previous conversation history                            │
└────────────────────────────────────────────────────────────┘
```

### Context Budget Per Agent

| Model | Context Window | Recommended Usage |
|-------|---------------|-------------------|
| Opus 4.5 | 200K | Up to 100K input (leave room for output + reasoning) |
| Sonnet 4.5 | 200K | Up to 100K input |
| Haiku 4.5 | 200K | Up to 50K (faster with less) |

### Embedding Strategy

Use embeddings for semantic search across:
- Code files (chunked by function/class)
- Documentation (chunked by section)
- Past decisions (logged as Q&A pairs)
- User requirements (chunked by feature)

---

## Error Handling & Recovery

### Failure Modes

| Failure | Detection | Response |
|---------|-----------|----------|
| Agent hallucinates code | Tests fail, lint errors | Retry with error context |
| Agent stuck in loop | Iteration count exceeded | Escalate to human |
| API rate limit | 429 response | Exponential backoff |
| Context too large | Token count exceeded | Summarize and retry |
| Dependency deadlock | Cycle detection | Alert human |
| External service down | Health check fails | Queue task, notify human |

### Retry Strategy

```python
def execute_agent_task(task):
    for attempt in range(MAX_RETRIES):
        try:
            result = agent.execute(task)
            
            if result.needs_human_input:
                queue_question(result.question)
                return TaskState.WAITING_HUMAN
            
            if result.quality_gates_passed:
                return TaskState.COMPLETED
            
            # Quality gates failed - retry with feedback
            task.add_context(f"Previous attempt failed: {result.failures}")
            
        except RateLimitError:
            wait(exponential_backoff(attempt))
        except ContextTooLargeError:
            task.context = summarize(task.context)
        except Exception as e:
            log_error(e)
    
    # Max retries exceeded
    escalate_to_human(task, "Max retries exceeded")
    return TaskState.FAILED
```

---

## Monitoring & Observability

### Metrics to Track

| Category | Metrics |
|----------|---------|
| Throughput | Tasks completed/hour, Agents active |
| Quality | Test pass rate, Lint error rate, Human override rate |
| Cost | Tokens used per project, Cost per task |
| Latency | Time to first artifact, Time to deployment |
| Human Load | Questions queued, Avg response time |

### Dashboard Views

1. **Project Overview**
   - Progress by workstream
   - Blocking issues
   - Recent activity

2. **Agent Status**
   - Currently running tasks
   - Success/failure rates
   - Token consumption

3. **Quality Board**
   - Test results over time
   - Security scan results
   - Code coverage

4. **Cost Tracking**
   - Spend by model
   - Spend by project
   - Projected costs

---

## Security Considerations

### Agent Sandboxing

- Each agent runs in isolated environment
- No network access except whitelisted APIs
- File system access scoped to project directory
- Resource limits (CPU, memory, time)

### Secret Management

- API keys never in context window
- Secrets injected at runtime via environment
- Credentials for generated projects stored encrypted
- Audit log for all secret access

### Code Execution

- Generated code runs in sandbox first
- No eval() or dynamic code execution in orchestrator
- Container escape prevention
- Network policies for generated apps

---

## What I'd Build First

If I were you, starting tomorrow:

### Day 1-3: Core Data Model + Task Queue

```sql
-- Minimal schema to get started
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT,
  brief TEXT,
  config JSONB,
  status TEXT,
  created_at TIMESTAMP
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  agent_type TEXT,
  status TEXT,  -- pending, running, waiting_human, completed, failed
  inputs JSONB,
  outputs JSONB,
  depends_on UUID[],
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE questions (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  question TEXT,
  context TEXT,
  options JSONB,
  priority TEXT,
  answer TEXT,
  answered_at TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE artifacts (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  task_id UUID REFERENCES tasks(id),
  type TEXT,  -- code, document, image, config
  path TEXT,
  content TEXT,
  created_at TIMESTAMP
);
```

### Day 4-7: Simple Orchestrator + One Agent

TypeScript (since you're building the frontend in Next.js anyway):

```typescript
// Minimal orchestrator
class Orchestrator {
  async createProject(brief: string) { /* ... */ }
  async getNextTask(agentType: string) { /* ... */ }
  async completeTask(taskId: string, outputs: any) { /* ... */ }
  async queueQuestion(taskId: string, question: Question) { /* ... */ }
  async answerQuestion(questionId: string, answer: string) { /* ... */ }
  async checkDependencies(taskId: string): boolean { /* ... */ }
}

// Minimal agent interface
interface Agent {
  type: string;
  execute(task: Task, context: Context): Promise<AgentResult>;
}

// Test with a simple agent that just echoes
class EchoAgent implements Agent {
  type = 'echo';
  async execute(task, context) {
    return {
      outputs: { echo: task.inputs.message },
      questions: [],
      artifacts: []
    };
  }
}
```

### Day 8-14: Backend Developer Agent

This is the most valuable agent—if you can generate working backend code with tests, you've validated the core concept.

---

## Estimated Timeline to "Usable for Yourself"

| Milestone | Timeline | Confidence |
|-----------|----------|------------|
| Basic orchestration working | 2 weeks | High |
| First agent producing code | 3 weeks | High |
| Full dev pipeline (backend + frontend + deploy) | 6 weeks | Medium |
| Ideation → deployed product | 10 weeks | Medium |
| Stable enough to use for real projects | 12 weeks | Medium |
| Polished enough to sell | 16-20 weeks | Lower |

These assume you're working on this full-time. Part-time = 2-3x longer.

---

## Hard Questions Still Outstanding

1. **How do you handle multi-file code changes?** Agent modifies file A, breaks file B. Detection and resolution?

2. **How do you handle style consistency?** Agent 1 writes code one way, Agent 2 writes differently. Enforce standards how?

3. **What's your iteration loop?** V1 ships, user feedback comes in. How does that flow back into the system?

4. **How do you handle agent disagreements?** Architect says one thing, Developer agent does another.

5. **What's your test data strategy?** Agents need realistic data to test against.

6. **How do you handle long-running processes?** Some tasks take hours (comprehensive QA). How do you checkpoint?

---

*This architecture is opinionated based on your stated requirements. Push back on anything that doesn't fit your mental model.*
