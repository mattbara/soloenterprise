# Product Factory: Master Architecture
## AI-Powered Development Team Orchestration System

**Version:** 2.0  
**Last Updated:** 2025-01-08  
**Status:** Technical Specification

---

## Executive Summary

Product Factory is an orchestration system that coordinates multiple specialized AI agents to build production-ready software products. It is designed for a **Principal Software Engineer** (you) who can validate AI output and make architectural decisions.

**Core Philosophy:**
- **Parallel execution** where possible
- **Sequential gates** where necessary
- **Human approval** at all critical points
- **Never deploy to production without explicit human approval**

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               PRODUCT FACTORY                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         HUMAN INTERFACE LAYER                             │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────────┐    │   │
│  │  │ Dashboard  │ │ Question   │ │ Approval   │ │ Auto-Claude UI      │    │   │
│  │  │ (Status)   │ │ Queue      │ │ Gates      │ │ (Agent Terminals)   │    │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └─────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                       ORCHESTRATION LAYER                                 │   │
│  │                                                                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │   Agent     │ │    File     │ │ Dependency  │ │  Quality Gate       │ │   │
│  │  │ Orchestrator│ │   Locker    │ │  Resolver   │ │  Enforcer           │ │   │
│  │  │  (Opus 4.5) │ │             │ │             │ │                     │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  │                                                                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │   Human     │ │   Event     │ │   State     │ │  Environment        │ │   │
│  │  │   Queue     │ │   Bus       │ │   Manager   │ │  Promoter           │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                    ┌───────────────────┼───────────────────┐                    │
│                    │                   │                   │                    │
│                    ▼                   ▼                   ▼                    │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         AGENT WORKER POOL                                 │   │
│  │                      (via Auto-Claude + Claude Code)                      │   │
│  │                                                                           │   │
│  │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │   │
│  │   │   Backend     │  │   Frontend    │  │      QA       │               │   │
│  │   │   Engineer    │  │   Engineer    │  │   Engineer    │               │   │
│  │   │  (Sonnet 4.5) │  │  (Sonnet 4.5) │  │  (Sonnet 4.5) │               │   │
│  │   └───────────────┘  └───────────────┘  └───────────────┘               │   │
│  │                                                                           │   │
│  │   ┌───────────────┐  ┌───────────────┐                                   │   │
│  │   │    DevOps     │  │   Feedback    │                                   │   │
│  │   │   Engineer    │  │   Analyst     │                                   │   │
│  │   │  (Sonnet 4.5) │  │  (Sonnet 4.5) │                                   │   │
│  │   └───────────────┘  └───────────────┘                                   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         SHARED RESOURCES                                  │   │
│  │                                                                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │  Git Repo   │ │   Skill     │ │   Context   │ │  Artifact           │ │   │
│  │  │ (worktrees) │ │   Library   │ │   Database  │ │  Store              │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    CONTINUOUS QA PIPELINE                                 │   │
│  │                                                                           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │   │
│  │  │Prettier│ │  Lint  │ │  Type  │ │ BUILD  │ │  Unit  │ │  Security  │  │   │
│  │  │(auto)  │ │        │ │ Check  │ │        │ │ Tests  │ │   Scan     │  │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │   │
│  │                                                                           │   │
│  │  PR Level Gates ↑ ─────────────────────────────────────────────────────  │   │
│  │  Environment Gates ↓                                                      │   │
│  │                                                                           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────────┐  │   │
│  │  │ Smoke  │ │ Integr │ │  E2E   │ │ Build  │ │    3-Strike Rule       │  │   │
│  │  │ Tests  │ │ Tests  │ │ Tests  │ │ Verify │ │  (escalate after 3)    │  │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    ENVIRONMENT PIPELINE                                   │   │
│  │                                                                           │   │
│  │     LOCAL ──→ DEV ──→ TEST ──→ STAGING ──→ [HUMAN] ──→ PRODUCTION       │   │
│  │                                                                           │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    INTEGRATION LAYER (n8n)                                │   │
│  │                                                                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │   Slack     │ │   GitHub    │ │   Email     │ │  Monitoring         │ │   │
│  │  │ Notifier    │ │  Webhooks   │ │   Alerts    │ │  (Sentry, etc.)     │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Auto-Claude Integration

Product Factory extends [Auto-Claude](https://github.com/AndyMik90/Auto-Claude) for agent execution:

| Auto-Claude Feature | How We Use It |
|---------------------|---------------|
| Parallel agent terminals | Each agent runs in isolated terminal |
| Git worktrees | Isolated workspaces per agent/task |
| Self-validating QA | Extended with our quality gates |
| Memory layer | Context retention across sessions |
| Kanban board | Visual task tracking |

**Our Extensions:**
- Custom SKILL files for specialized agents
- File lock manager (prevents conflicts)
- 5-environment pipeline (vs. Auto-Claude's simpler flow)
- Hard human gates for production
- n8n integration for notifications

### 2. File Lock Manager

Prevents agents from conflicting on shared files.

```typescript
interface FileLock {
  path: string;           // File path
  taskId: string;         // Task holding the lock
  agentId: string;        // Agent working on it
  branch: string;         // Git branch
  lockedAt: Date;
  expiresAt: Date;        // Auto-release after timeout
}

interface FileLockManager {
  acquire(paths: string[], taskId: string): Promise<LockResult>;
  release(taskId: string): Promise<void>;
  check(paths: string[]): Promise<LockStatus[]>;
  forceRelease(paths: string[], reason: string): Promise<void>;  // Human only
}

// Lock acquisition flow
async function acquireLocks(task: Task): Promise<boolean> {
  const filesToModify = task.expectedOutputs;
  
  // Check current locks
  const lockStatus = await lockManager.check(filesToModify);
  
  const conflicts = lockStatus.filter(l => l.isLocked);
  
  if (conflicts.length > 0) {
    // Check if conflicts are dependencies (ok to wait)
    const blockingTasks = conflicts.map(c => c.taskId);
    const areDependencies = blockingTasks.every(t => task.dependsOn.includes(t));
    
    if (areDependencies) {
      // Wait for dependencies - mark task as blocked
      return false;
    } else {
      // Real conflict - escalate to human
      await queueHumanQuestion({
        type: 'conflict',
        question: `File conflict detected`,
        context: `Task ${task.id} wants to modify files locked by ${blockingTasks.join(', ')}`,
        options: [
          'Prioritize current task (release other locks)',
          'Wait for other tasks to complete',
          'Review and merge manually',
        ],
      });
      return false;
    }
  }
  
  // No conflicts - acquire locks
  await lockManager.acquire(filesToModify, task.id);
  return true;
}
```

### 3. Environment Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           5-ENVIRONMENT PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ LOCAL                                                                    │    │
│  │ ├── Developer's machine / Agent's worktree                              │    │
│  │ ├── Data: Docker Compose with fixtures                                  │    │
│  │ ├── Tests: Unit tests                                                   │    │
│  │ └── Gate: Unit tests pass, lint clean, types check                      │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │ AUTO (on PR creation)                        │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ DEV                                                                      │    │
│  │ ├── Shared development environment                                       │    │
│  │ ├── Data: Seeded test database                                          │    │
│  │ ├── Tests: Unit tests + Smoke tests                                     │    │
│  │ ├── Deployment: Auto-deploy on PR merge to develop                      │    │
│  │ └── Gate: All unit tests pass, smoke tests pass                         │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │ AUTO (on smoke test pass)                    │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ TEST                                                                     │    │
│  │ ├── QA environment                                                       │    │
│  │ ├── Data: Seeded test database (larger dataset)                         │    │
│  │ ├── Tests: Integration tests                                            │    │
│  │ ├── Deployment: Auto-deploy on develop → test promotion                 │    │
│  │ └── Gate: All integration tests pass                                    │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │ AUTO (on integration test pass)              │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ STAGING                                                                  │    │
│  │ ├── Production mirror                                                    │    │
│  │ ├── Data: Synthetic data (GDPR-compliant, no real user data)            │    │
│  │ ├── Tests: E2E tests + Performance tests                                │    │
│  │ ├── Deployment: Manual trigger (release candidate)                      │    │
│  │ └── Gate: E2E pass + Performance baselines met                          │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │                                              │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ 🛑 HUMAN APPROVAL GATE 🛑                                                │    │
│  │                                                                          │    │
│  │ REQUIRED: Explicit human approval via Dashboard                         │    │
│  │                                                                          │    │
│  │ Human reviews:                                                           │    │
│  │ • What changed (diff summary)                                           │    │
│  │ • Test results (all green)                                              │    │
│  │ • Performance metrics (no regressions)                                  │    │
│  │ • Rollback plan (one-click revert)                                      │    │
│  │                                                                          │    │
│  │ ⚠️  PRODUCTION DEPLOYMENT NEVER PROCEEDS WITHOUT THIS APPROVAL          │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │ HUMAN APPROVED                               │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ PRODUCTION                                                               │    │
│  │ ├── Live environment                                                     │    │
│  │ ├── Data: Real user data                                                │    │
│  │ ├── Tests: Smoke tests only (read-only, non-destructive)               │    │
│  │ ├── Deployment: Blue-green or canary                                    │    │
│  │ └── Monitoring: Real-time alerts, auto-rollback on errors               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4. Synthetic Data Generation (GDPR-Compliant Staging)

For staging environment, generate realistic but fake data:

```typescript
// data-generator/synthetic-generator.ts
import { faker } from '@faker-js/faker';

interface SyntheticDataConfig {
  users: number;
  ordersPerUser: number;
  productsCount: number;
}

export async function generateSyntheticData(config: SyntheticDataConfig) {
  const users = Array.from({ length: config.users }, () => ({
    id: faker.string.uuid(),
    email: faker.internet.email(),          // Fake email
    name: faker.person.fullName(),          // Fake name
    phone: faker.phone.number(),            // Fake phone
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      country: faker.location.country(),
      zip: faker.location.zipCode(),
    },
    createdAt: faker.date.past(),
  }));

  // Generate related data maintaining referential integrity
  const orders = users.flatMap(user => 
    Array.from({ length: faker.number.int({ min: 0, max: config.ordersPerUser }) }, () => ({
      id: faker.string.uuid(),
      userId: user.id,
      amount: faker.number.float({ min: 10, max: 1000, precision: 0.01 }),
      status: faker.helpers.arrayElement(['pending', 'completed', 'cancelled']),
      createdAt: faker.date.between({ from: user.createdAt, to: new Date() }),
    }))
  );

  return { users, orders };
}

// Run before staging deployment
export async function seedStagingDatabase() {
  const data = await generateSyntheticData({
    users: 10000,
    ordersPerUser: 5,
    productsCount: 500,
  });
  
  await db.transaction(async (tx) => {
    await tx.delete(users);
    await tx.delete(orders);
    await tx.insert(users).values(data.users);
    await tx.insert(orders).values(data.orders);
  });
}
```

### 5. n8n Integration

n8n handles notifications and external service integration:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              n8n WORKFLOWS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  WORKFLOW: human_notification                                                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                        │
│  │  Webhook    │────▶│  Priority   │────▶│   Route     │                        │
│  │  Trigger    │     │   Check     │     │             │                        │
│  └─────────────┘     └─────────────┘     └──────┬──────┘                        │
│                                                  │                               │
│                      ┌───────────────────────────┼───────────────────────────┐   │
│                      │                           │                           │   │
│                      ▼                           ▼                           ▼   │
│               ┌─────────────┐             ┌─────────────┐             ┌─────────┐│
│               │   Slack     │             │   Email     │             │   SMS   ││
│               │ (critical)  │             │  (high)     │             │ (urgent)││
│               └─────────────┘             └─────────────┘             └─────────┘│
│                                                                                  │
│  ────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  WORKFLOW: github_events                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                        │
│  │  GitHub     │────▶│   Parse     │────▶│  Update     │                        │
│  │  Webhook    │     │   Event     │     │  Dashboard  │                        │
│  └─────────────┘     └─────────────┘     └─────────────┘                        │
│                                                                                  │
│  ────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  WORKFLOW: deployment_monitor                                                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  Sentry     │────▶│   Error     │────▶│   Alert     │────▶│  Trigger    │   │
│  │  Webhook    │     │   Spike?    │     │   Human     │     │  Rollback?  │   │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                                                  │
│  ────────────────────────────────────────────────────────────────────────────   │
│                                                                                  │
│  WORKFLOW: feedback_collector                                                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  Multiple   │────▶│  Normalize  │────▶│  Store in   │────▶│   Alert     │   │
│  │  Sources    │     │   Format    │     │  Database   │     │   Human     │   │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**n8n Workflow: Human Question Notification**

```json
{
  "name": "Human Question Notification",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "human-question",
        "method": "POST"
      }
    },
    {
      "name": "Priority Router",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "rules": [
          { "value": "critical", "output": 0 },
          { "value": "high", "output": 1 },
          { "value": "medium", "output": 2 }
        ]
      }
    },
    {
      "name": "Slack Critical",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#product-factory-critical",
        "text": "🚨 CRITICAL: {{ $json.question }}\n\nContext: {{ $json.context }}\n\n<{{ $json.dashboard_url }}|Answer in Dashboard>"
      }
    },
    {
      "name": "Slack High",
      "type": "n8n-nodes-base.slack",
      "parameters": {
        "channel": "#product-factory",
        "text": "⚠️ Decision needed: {{ $json.question }}\n\n<{{ $json.dashboard_url }}|Answer in Dashboard>"
      }
    },
    {
      "name": "Email",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "to": "{{ $env.HUMAN_EMAIL }}",
        "subject": "[Product Factory] {{ $json.priority }}: {{ $json.question | truncate(50) }}",
        "text": "Question: {{ $json.question }}\n\nContext: {{ $json.context }}\n\nAnswer: {{ $json.dashboard_url }}"
      }
    }
  ]
}
```

### 6. Feedback Agent

Collects and analyzes user feedback, reports to human:

```yaml
# SKILL reference: Future addition
agent:
  id: feedback-analyst
  name: Feedback Analyst
  model: claude-sonnet-4-5-20250929
  
  responsibilities:
    - Aggregate feedback from multiple sources
    - Categorize by feature/component
    - Identify patterns and trends
    - Prioritize by impact
    - Report to human (NEVER auto-create tasks)
  
  inputs:
    - support_tickets
    - user_surveys
    - app_store_reviews
    - analytics_events
    - error_reports
  
  outputs:
    - feedback_report (to human)
    - suggested_improvements (to human for approval)
  
  human_escalation: ALWAYS
  # This agent ONLY reports - human decides what to do
```

---

## Tech Stack

### Core Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Agent Runtime | Auto-Claude + Claude Code | Proven parallel execution |
| Orchestration | Custom TypeScript | Full control over coordination |
| Task Queue | BullMQ + Redis | Battle-tested, good visibility |
| Database | PostgreSQL + pgvector | Structured data + embeddings |
| File Storage | Git (worktrees) + S3 | Version control + artifacts |

### Development

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | TypeScript (strict) | Type safety end-to-end |
| Backend Framework | Hono | Fast, modern, TypeScript-native |
| Frontend Framework | Next.js 14 | App Router, RSC, familiar |
| UI Components | shadcn/ui | Customizable, accessible |
| Testing | Vitest + Playwright | Fast + comprehensive |
| ORM | Drizzle | Type-safe, SQL-like |

### Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| CI/CD | GitHub Actions | Native, free tier |
| Hosting (App) | Vercel or Railway | Easy, scales |
| Hosting (Workers) | Railway | Background jobs |
| Database | Neon | Serverless Postgres |
| Redis | Upstash | Serverless Redis |
| Monitoring | Sentry + Axiom | Errors + logs |
| Notifications | n8n (self-hosted) | You already have it |

### AI Models

| Agent | Model | Rationale |
|-------|-------|-----------|
| Orchestrator | Opus 4.5 | Strategic reasoning |
| Backend Engineer | Sonnet 4.5 | Code generation |
| Frontend Engineer | Sonnet 4.5 | Code generation |
| QA Engineer | Sonnet 4.5 | Test generation |
| DevOps Engineer | Sonnet 4.5 | Infrastructure code |
| Feedback Analyst | Sonnet 4.5 | Analysis |

---

## Build Order

You said: **"Build one agent at a time"** — here's the order:

### Phase 1: Foundation (Week 1-2)

Build the orchestration layer, NOT agents:

1. **Database schema** (projects, tasks, questions, locks, artifacts)
2. **Task queue setup** (BullMQ + Redis)
3. **File lock manager**
4. **Basic dashboard** (task status, question queue)
5. **One simple test agent** (proves pipeline works)

**Milestone:** Can create a task, run a simple agent, see results in dashboard

### Phase 2: First Real Agent (Week 3-4)

**Backend Engineer Agent**

Why first?
- Foundation for everything else
- You can test API output immediately
- Most concrete deliverable (code that runs)

Build:
- Load SKILL file into agent context
- Connect to Auto-Claude terminal
- Implement quality gates (unit tests, lint, types)
- File lock integration
- Human question flow

**Milestone:** Can give requirements, get working backend code with tests

### Phase 3: Second Agent (Week 5-6)

**Frontend Engineer Agent**

Why second?
- Depends on backend API contracts
- Tests agent coordination
- Exercises file locking (shared types, API clients)

**Milestone:** Can generate frontend that integrates with backend

### Phase 4: QA Agent (Week 7-8)

**QA Engineer Agent**

Why third?
- Validates output of other agents
- Exercises the full quality gate pipeline
- Critical for continuous QA loop

**Milestone:** Automatic test generation for all new code

### Phase 5: DevOps Agent (Week 9-10)

**DevOps Engineer Agent**

Why fourth?
- Now you have code to deploy
- Sets up the 5-environment pipeline
- Exercises all environment gates

**Milestone:** End-to-end from code → production (with human gates)

### Phase 6: Integration & Polish (Week 11-12)

- Full n8n notification setup
- Synthetic data generation
- Performance optimization
- Documentation
- Dogfooding with real project

---

## Agent SKILL Files

All SKILL files are located in `/skills/`:

| File | Agent |
|------|-------|
| `SKILL-orchestrator.md` | Agent Orchestrator |
| `SKILL-backend-engineer.md` | Backend Engineer |
| `SKILL-frontend-engineer.md` | Frontend Engineer |
| `SKILL-qa-engineer.md` | QA Engineer |
| `SKILL-devops-engineer.md` | DevOps Engineer |

---

## Human Interaction Points

### Questions (Non-Blocking)
- Queued in dashboard
- Batched by similarity
- Prioritized by blocking impact
- Agent continues other work if possible

### Approvals (Blocking)
- **Production deployment:** ALWAYS requires human
- **Breaking changes:** ALWAYS requires human
- **Security changes:** ALWAYS requires human
- **Data migrations:** ALWAYS requires human

### Disagreements
Per your requirement: **ALL disagreements flagged to human**
- Agent A says X, Agent B says Y → human decides
- No agent-to-agent negotiation

### Feedback
Per your requirement: **Feedback agent notifies, never auto-acts**
- Collects and analyzes feedback
- Reports to human
- Human creates tasks (or not)

---

## Task Management

### Decision: Use Auto-Claude's Built-in Kanban

**Do NOT add Jira, Linear, or other external task management at this stage.**

| Auto-Claude Kanban | Jira/Linear |
|-------------------|-------------|
| ✅ Native integration | ❌ Requires sync logic |
| ✅ Single source of truth | ❌ Two systems to reconcile |
| ✅ Free | ❌ $7-14/user/month |
| ✅ Zero setup | ❌ Integration overhead |

**Reconsider when:** Multiple humans collaborate, external stakeholder visibility needed, compliance requirements, or productization.

---

## Non-Negotiable Rules

1. **No production deployment without human approval**
2. **No file modification without lock**
3. **No task execution without dependency check**
4. **No agent disagreement resolution without human**
5. **All test data requests go to human**
6. **All quality gates must pass before promotion**
7. **No PR merge without passing build gate** ← NEW
8. **Escalate to human after 3 failed PR attempts** ← NEW
9. **Prettier auto-fixes, never blocks** ← NEW

---

## Next Steps

1. **Review this architecture** — push back on anything wrong
2. **Review SKILL files** — adjust for your preferences
3. **Set up infrastructure:**
   - Neon database
   - Upstash Redis
   - n8n webhooks
4. **Fork/extend Auto-Claude** for custom orchestration
5. **Build Phase 1** (foundation, no agents yet)

---

## Questions for You

Before proceeding:

1. **Auto-Claude setup:** Have you installed Auto-Claude? Any issues?
2. **n8n webhooks:** Is your n8n instance accessible via webhook?
3. **Git hosting:** GitHub? GitLab? This affects CI/CD setup.
4. **First test project:** What simple project should we use to test the pipeline?

---

*Document version 2.1 — Added build gate, 3-strike rule, Prettier auto-fix, task management decision (Auto-Claude Kanban over Jira).*
