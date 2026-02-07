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
