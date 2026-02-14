# Project Scoper - Examples

<!-- Token Target: 1,500-2,000 tokens -->
<!-- Load When: first scoping task, complex briefs -->

## Example 1: E-commerce API Brief

### Client Brief (Input)
"We need a backend API for our e-commerce store. Products, categories, shopping cart, checkout with Stripe. Users need to register and log in. Admin panel to manage products. We already have a React frontend team, so just the API please."

### Scoped Output

<scope>
```yaml
project_scope:
  project_name: E-commerce API
  client: Example Corp
  brief_id: brief-001
  summary: "Backend API for e-commerce with product management, cart, Stripe checkout, auth, and admin endpoints. Frontend excluded per client request."

  requirements:
    - id: REQ-001
      description: "User authentication (register, login, password reset, JWT tokens)"
      category: backend
      complexity: standard
      estimated_tasks: 3
      agent_types: [backend, qa]
      dependencies: []
      risks: ["Password reset requires email service"]
      assumptions: ["JWT-based auth, not session-based"]

    - id: REQ-002
      description: "Product and category CRUD with search and filtering"
      category: backend
      complexity: standard
      estimated_tasks: 4
      agent_types: [backend, qa]
      dependencies: [REQ-001]
      risks: ["Search complexity depends on requirements"]
      assumptions: ["Basic text search, not full-text/Elasticsearch"]

    - id: REQ-003
      description: "Shopping cart (add, remove, update quantity, persist)"
      category: backend
      complexity: standard
      estimated_tasks: 3
      agent_types: [backend, qa]
      dependencies: [REQ-001, REQ-002]
      risks: ["Cart persistence strategy affects complexity"]
      assumptions: ["Cart tied to user account, not anonymous sessions"]

    - id: REQ-004
      description: "Stripe checkout integration (create session, webhooks, order creation)"
      category: backend
      complexity: complex
      estimated_tasks: 5
      agent_types: [backend, qa]
      dependencies: [REQ-003]
      risks: ["Stripe webhook reliability", "Idempotency for payment processing"]
      assumptions: ["Stripe Checkout Sessions, not custom payment flow"]

    - id: REQ-005
      description: "Admin endpoints for product management (separate from public API)"
      category: backend
      complexity: simple
      estimated_tasks: 2
      agent_types: [backend, qa]
      dependencies: [REQ-001, REQ-002]
      risks: []
      assumptions: ["Role-based access: admin vs regular user"]

  agents_required:
    backend: true
    frontend: false
    qa: true
    devops: false
    devops_human_fallback: false

  estimates:
    total_tasks: 17
    duration_range: "2-3 weeks"
    complexity_breakdown:
      simple: 2
      standard: 10
      complex: 5
    confidence: high
    risk_level: medium

  gaps:
    - question: "Which email service for password reset and order confirmations?"
      blocking: false
      default_assumption: "Will use Resend — can swap later"
    - question: "Do you have Stripe test API keys we can use?"
      blocking: true
      default_assumption: null
    - question: "Cart behavior: does it persist across devices for logged-in users?"
      blocking: false
      default_assumption: "Yes, cart is tied to user account"

  out_of_scope:
    - "Frontend / React components"
    - "Image upload/storage service"
    - "Email template design"
    - "Production deployment / infrastructure"
    - "Rate limiting / advanced security"

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
</scope>

## Example 2: Vague Brief → Questions

### Client Brief (Input)
"We need an app for our team to track projects."

### Scoped Output

<scope>
```yaml
project_scope:
  project_name: Team Project Tracker
  client: Unknown
  brief_id: brief-002
  summary: "INCOMPLETE — Brief is too vague to scope. Questions below must be answered before proceeding."

  requirements: []

  agents_required:
    backend: false
    frontend: false
    qa: false
    devops: false
    devops_human_fallback: false

  estimates:
    total_tasks: 0
    duration_range: "Cannot estimate without requirements"
    complexity_breakdown:
      simple: 0
      standard: 0
      complex: 0
    confidence: low
    risk_level: high

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
    - question: "Do you have existing tools (Jira, Asana, Trello) you're replacing? What's missing from them?"
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

  out_of_scope: []

  milestones: []
```
</scope>

<client_document>
```markdown
# Project Scope: Team Project Tracker
## Status: Pending — Additional Information Required

We'd love to help build your project tracking tool, but we need a bit more detail before we can provide an accurate scope and timeline.

### Questions We Need Answered

**Must answer before we can proceed:**
1. Is this a web application, mobile app, or both?
2. What specifically should "track projects" include — task management, time tracking, milestones, Gantt charts, or something else?
3. What user roles do you need (admin, manager, team member)?

**Helpful but not blocking:**
4. How many team members will use this?
5. Are you replacing an existing tool? If so, which one and what's missing?
6. Any integrations needed (Slack, email, calendar)?
7. Timeline and budget range?

Once we have answers to the required questions, we'll provide a detailed scope with timeline and milestones.
```
</client_document>

This is the CORRECT behavior — never scope what you can't define.
