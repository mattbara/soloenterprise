# Project Scoper - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard scoping tasks -->

## Scope Output Schema
```yaml
project_scope:
  project_name: string
  client: string
  brief_id: string              # MUST be the exact UUID provided in the brief context — never invent one
  summary: string               # 2-3 sentence overview

  requirements:
    - id: REQ-001
      description: string
      category: backend | frontend | fullstack | infrastructure
      complexity: simple | standard | complex
      estimated_tasks: number
      agent_types: string[]
      dependencies: string[]    # Other REQ IDs
      risks: string[]
      assumptions: string[]

  agents_required:
    backend: boolean
    frontend: boolean
    qa: boolean
    devops: boolean
    devops_human_fallback: boolean

  estimates:
    total_tasks: number
    duration_range: string      # "2-3 weeks"
    complexity_breakdown:
      simple: number
      standard: number
      complex: number
    confidence: low | medium | high
    risk_level: low | medium | high

  gaps:
    - question: string
      blocking: boolean
      default_assumption: string

  out_of_scope:
    - string

  milestones:
    - name: string
      requirements: string[]
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

### Cross-Cutting Concerns (Do NOT Create Separate REQs)

Some requirements are constraints or foundational steps that apply across multiple components. Do NOT create separate REQ entries for these. Instead, embed them within the requirements they affect.

**Never create standalone REQs for:**
- Responsive/mobile layout → add as constraint/assumption on every frontend REQ
- Brand colors/theming → add as constraint/assumption on every frontend REQ
- Accessibility standards → add as constraint/assumption on every frontend REQ
- Database schema design → this is the first sub-task of the first backend REQ, not a separate REQ
- Error handling patterns → add as constraint on backend REQs
- Logging/monitoring → add as constraint on backend REQs
- Code style/linting → not a task at all
- API structure/conventions → add as assumption on backend REQs

**How to handle them:**
- Mention in the `assumptions` field of affected REQs (e.g., "Mobile responsive using Tailwind breakpoints")
- If they add significant effort, increase `estimated_tasks` on the affected REQs rather than creating a new REQ
- Reference in the project summary or client document as a global constraint
- Database schema design should be listed as a deliverable in the first milestone, not as a standalone requirement

**Example — WRONG:**
```yaml
- id: REQ-006
  description: "Database schema design for all entities"
  category: backend
  complexity: simple
  estimated_tasks: 2
```

**Example — RIGHT:**
```yaml
- id: REQ-001
  description: "User authentication with email/password login, registration, and password reset"
  category: fullstack
  complexity: standard
  estimated_tasks: 5  # Includes schema design for users table as first task
  assumptions:
    - "Database schema for users table designed as first backend sub-task"
    - "Mobile responsive using Tailwind breakpoints (sm, md, lg)"
    - "Brand colors applied via Tailwind theme config"
```

### Red Flags in Briefs
- "Simple" or "just" preceding complex requirements
- No mention of auth/security for user-facing apps
- "Like [competitor] but better" with no specifics
- Timeline mentioned before requirements
- Multiple stakeholders with no clear decision maker
- "No tests" or "no documentation" on existing code — this is a major risk multiplier, not a footnote. Flag as top-level project risk and add discovery/audit milestone.
- "Developer left" or "no handover" — treat all scope estimates as low-confidence until codebase is reviewed

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

This pattern applies when the client has existing code being modified, migrated, or extended.

**Step 1: Assess codebase health (BEFORE estimating anything)**
Flag the following as project-level risks if mentioned or implied in the brief:
- No existing tests → HIGH regression risk, add 30-40% buffer to estimates
- No documentation → reverse-engineering required, add blocking question for repo access
- Single developer / developer left → no knowledge transfer, treat ALL estimates as low-confidence
- "It's a mess" / tech debt signals → add explicit "technical discovery" phase in first milestone
- Old framework or outdated dependencies → migration complexity often underestimated

**Step 2: Require codebase access as BLOCKING**
If you don't have access to the existing repo, database schema, or API structure:
- Add a BLOCKING gap question requesting access
- Set confidence to `low` until access is provided
- Note in the summary that all estimates are preliminary pending codebase review

**Step 3: Add technical discovery milestone**
For any legacy codebase modification, the FIRST milestone must be:
- Audit existing code structure, dependencies, and test coverage
- Document current API endpoints and database schema
- Identify refactoring required before new features can be added safely
- This milestone produces a "go/no-go" recommendation — scope may change after discovery

**Step 4: Increase QA allocation**
- No existing tests = you're building the ENTIRE test foundation, not just testing new features
- Add explicit QA tasks for: regression test suite for existing functionality + new feature tests
- Flag in estimates: "QA effort is higher than typical due to no existing test coverage"
- In `estimates`, if no tests exist, increase `risk_level` by one tier (low→medium, medium→high)

**Step 5: Flag scope uncertainty**
- Legacy modifications have inherently unpredictable scope
- Set `confidence` to `low` or `medium` (never `high`) for legacy projects
- Add a top-level risk: "Scope estimates may change significantly after technical discovery phase"

### Pattern: Non-English Brief Detection

If the brief title OR content is primarily in a language other than English, this is a BLOCKING issue that must be resolved before work begins.

The scoper MAY produce a full provisional scope from translated content, but MUST:
1. Identify the detected language in the summary (e.g., "Brief submitted in French")
2. Mark the summary with "PROVISIONAL SCOPE — pending client confirmation of translated requirements. Do not begin work until translation is verified."
3. The FIRST gap question must be a blocking translation confirmation that includes a complete English summary of all requirements understood from the brief
4. Set `confidence` to `low` (translation uncertainty affects all estimates)
5. Set `risk_level` to minimum `high` (language barrier is inherent risk)
6. All output must remain in English

**The scoper MUST NOT:**
- Set confidence above `low` for translated briefs
- Treat the scope as confirmed before translation verification
- Produce output in the brief's language

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
