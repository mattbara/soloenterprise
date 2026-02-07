# SKILL: Agent Orchestrator (Examples)

<!-- Token Target: 1,500-2,000 tokens -->
<!-- Load When: Project kickoff, first-time patterns only -->

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

---

## Task Decomposition Patterns

### Pattern: New Feature

```yaml
# Input: "Add user profile page with avatar upload"

decomposition:
  - task: backend-profile-api
    agent: backend
    description: Create GET/PUT /api/users/:id/profile endpoints
    outputs: [src/routes/profile.ts, src/services/profile-service.ts]

  - task: backend-avatar-upload
    agent: backend
    description: Create POST /api/users/:id/avatar with S3 upload
    outputs: [src/routes/avatar.ts, src/services/storage-service.ts]
    dependencies: [backend-profile-api]

  - task: frontend-profile-page
    agent: frontend
    description: Create /profile page with edit form
    outputs: [src/app/profile/page.tsx, src/components/profile-form.tsx]
    dependencies: [backend-profile-api]

  - task: frontend-avatar-component
    agent: frontend
    description: Create avatar upload component with preview
    outputs: [src/components/avatar-upload.tsx]
    dependencies: [backend-avatar-upload, frontend-profile-page]

  - task: qa-profile-tests
    agent: qa
    description: Write tests for profile feature
    outputs: [tests/e2e/profile.spec.ts, tests/integration/profile-api.test.ts]
    dependencies: [frontend-avatar-component]

  - task: devops-storage-config
    agent: devops
    description: Configure S3 bucket and IAM permissions
    outputs: [infrastructure/terraform/storage.tf]
    dependencies: []  # Can run in parallel
```

### Pattern: Bug Fix

```yaml
# Input: "Fix: Users can't update email address"

decomposition:
  - task: qa-reproduce-bug
    agent: qa
    description: Write failing test that reproduces the bug
    outputs: [tests/integration/user-email-update.test.ts]

  - task: backend-fix-email-update
    agent: backend
    description: Fix email update logic in user service
    outputs: [src/services/user-service.ts]
    dependencies: [qa-reproduce-bug]

  - task: qa-verify-fix
    agent: qa
    description: Verify fix and add regression tests
    outputs: [tests/integration/user-email-update.test.ts]
    dependencies: [backend-fix-email-update]
```

### Pattern: Infrastructure Change

```yaml
# Input: "Set up staging environment"

decomposition:
  - task: devops-terraform-staging
    agent: devops
    description: Create Terraform config for staging environment
    outputs: [infrastructure/terraform/environments/staging/]

  - task: devops-ci-staging
    agent: devops
    description: Add staging deployment to CI/CD pipeline
    outputs: [.github/workflows/deploy.yml]
    dependencies: [devops-terraform-staging]

  - task: devops-monitoring-staging
    agent: devops
    description: Set up monitoring and alerting for staging
    outputs: [infrastructure/terraform/monitoring.tf]
    dependencies: [devops-terraform-staging]
```

## Human Question Queue

| Category | Examples | Default Priority |
|----------|----------|------------------|
| `architecture` | Database choice, service boundaries | Critical |
| `design` | UI patterns, UX flows | High |
| `security` | Auth flows, data access | Critical |
| `legal` | Compliance, data handling | High |
| `technical` | Library choices, patterns | Medium |
| `strategic` | Feature prioritization, scope | High |

## Task State Machine

```
                         PENDING
                            │
           ┌────────────────┼────────────────┐
           │                │                │
      deps_not_met     deps_met       has_conflicts
           │                │                │
           ▼                ▼                ▼
        BLOCKED          QUEUED          CONFLICT
           │                │            (→ human)
      dep_completed    agent_picks_up
           │                │
           ▼                ▼
        QUEUED           RUNNING
                            │
           ┌────────────────┼────────────────┐
           │                │                │
      asks_question    completes      fails_3x
           │                │                │
           ▼                ▼                ▼
     WAITING_HUMAN     COMPLETED         FAILED
           │           (via gates)      (→ human)
      human_answers
           │
           ▼
        RUNNING
```

## Environment Promotion Pipeline

```
LOCAL (Agent Worktree)
    │
    ▼ [PR Created]
┌───────────────────────────────────────┐
│ PR GATES: Prettier → Lint → Type →   │
│           Build → Unit → Security →  │
│           Conflict                    │
│                                       │
│ 3 failures on same task → ESCALATE   │
└───────────────────┬───────────────────┘
                    │ ALL PASS
                    ▼
DEVELOP ──merge──→ DEV ──smoke──→ TEST
                                    │
                            integration
                                    │
                                    ▼
                              STAGING
                                    │
                          e2e + build verify
                                    │
                                    ▼
                        HUMAN APPROVAL REQUIRED
                                    │
                                    ▼
                              PRODUCTION
```
