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
