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
