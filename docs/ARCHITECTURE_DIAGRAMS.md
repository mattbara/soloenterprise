# SoloEnterprise — Architecture Diagrams

> Visual architecture reference. Render in VS Code with **Markdown Preview Mermaid Support** extension, or view directly on GitHub.

---

## 1. System Architecture (High-Level)

```mermaid
graph TB
    subgraph UI["Next.js 15 App (App Router)"]
        Pages["Pages<br/>Dashboard | Companies | Projects<br/>Tasks | Questions | Metrics | Errors"]
        API["API Routes<br/>/api/tasks | /api/projects<br/>/api/briefs | /api/reports<br/>/api/workers | /api/questions"]
        Sidebar["Persistent Sidebar<br/>Navigation"]
    end

    subgraph Core["@soloenterprise/core"]
        Services["Services<br/>TaskService | CostTracking<br/>DependencyResolver | WorkerRegistry"]
        Agents["Agent Layer<br/>7 Specialized Agents"]
        Queue["BullMQ Queue<br/>8 Named Queues"]
        Utils["Utilities<br/>SkillLoader | ContextLoader<br/>OutputParser | FileWriter"]
    end

    subgraph DB["@soloenterprise/db"]
        Schema["Drizzle ORM<br/>18 Tables"]
    end

    subgraph External["External Services"]
        Neon["Neon PostgreSQL<br/>(Serverless)"]
        Redis["Upstash Redis<br/>(BullMQ backing)"]
        Claude["Anthropic Claude API<br/>Haiku | Sonnet | Opus"]
        GitHub["GitHub<br/>(Repo + PRs)"]
    end

    subgraph FileSystem["Local File System"]
        Generated["generated/<br/>tasks/{taskId}/<br/>reports/{projectId}/"]
        Skills["skills/<br/>Layered SKILL Files"]
    end

    Pages --> API
    Sidebar --> Pages
    API --> Services
    Services --> Queue
    Services --> Schema
    Queue --> Agents
    Agents --> Utils
    Utils --> Skills
    Utils --> Generated
    Agents --> Claude
    Schema --> Neon
    Queue --> Redis
```

---

## 2. Agent Ecosystem

```mermaid
graph TB
    User["Human User<br/>(Principal Engineer)"]

    subgraph Orchestrator["Orchestrator Agent (Opus 4.6)"]
        ORC_BRAIN["Decomposes projects<br/>Manages dependencies<br/>Delegates to agents<br/>Reviews outputs"]
    end

    subgraph TechAgents["Technical Agents"]
        BE["Backend Agent<br/>Haiku 3.5 / Sonnet 4.5<br/>API routes, services,<br/>migrations"]
        FE["Frontend Agent<br/>Haiku 3.5 / Sonnet 4.5<br/>React components,<br/>pages, UI"]
        QA["QA Agent<br/>Haiku 3.5 / Sonnet 4.5<br/>Unit tests,<br/>integration tests"]
    end

    subgraph BizAgents["Business Agents"]
        SC["Project Scoper<br/>Opus 4.5<br/>Brief → structured scope<br/>+ client document"]
        CR["Client Reporter<br/>Sonnet 4.5<br/>Weekly/milestone reports<br/>+ internal notes"]
    end

    subgraph Support["Support"]
        ECHO["Echo Agent<br/>(Test harness)"]
        ARCH["Architect Layer<br/>Opus — per-task specs<br/>for complex tasks"]
    end

    User -->|"Creates project /<br/>answers questions"| Orchestrator
    Orchestrator -->|"create_task<br/>backend"| BE
    Orchestrator -->|"create_task<br/>frontend"| FE
    Orchestrator -->|"create_task<br/>qa"| QA
    User -->|"Submits brief"| SC
    User -->|"Requests report"| CR
    Orchestrator -.->|"Triggers spec gen<br/>for complex tasks"| ARCH
    ARCH -.->|"technicalSpec<br/>attached to task"| BE
    ARCH -.->|"technicalSpec<br/>attached to task"| FE

    BE -->|"Files + artifacts"| Orchestrator
    FE -->|"Files + artifacts"| Orchestrator
    QA -->|"Test files"| Orchestrator
    SC -->|"Scope YAML +<br/>client doc"| User
    CR -->|"Report markdown +<br/>internal notes"| User
```

---

## 3. Database Schema (Entity Relationships)

```mermaid
erDiagram
    clients ||--o{ projects : "has"
    clients ||--o{ project_briefs : "submits"
    project_briefs ||--o| project_scopes : "generates"
    project_scopes ||--o| projects : "creates"

    projects ||--o{ tasks : "contains"
    projects ||--o{ questions : "has"
    projects ||--o{ artifacts : "produces"
    projects ||--o{ deployments : "tracks"
    projects ||--o{ milestones : "planned in"
    projects ||--o{ client_reports : "reported via"
    projects ||--o{ cost_tracking : "billed through"

    tasks ||--o{ tasks : "parent/subtask"
    tasks ||--o{ questions : "raises"
    tasks ||--o{ artifacts : "generates"
    tasks ||--o{ file_locks : "acquires"
    tasks ||--o{ cost_tracking : "incurs"
    milestones ||--o{ tasks : "groups"

    clients {
        uuid id PK
        text name
        text contactName
        text contactEmail
        text status
    }

    projects {
        uuid id PK
        text name
        text description
        enum status
        jsonb config
        uuid clientId FK
        uuid scopeId FK
    }

    tasks {
        uuid id PK
        uuid projectId FK
        uuid parentTaskId FK
        text name
        enum agentType
        enum status
        enum priority
        jsonb dependsOn
        jsonb context
        jsonb result
        jsonb tokenMetrics
        jsonb technicalSpec
    }

    questions {
        uuid id PK
        uuid projectId FK
        uuid taskId FK
        text question
        enum status
        enum priority
        boolean isBlocking
        text answer
    }

    file_locks {
        uuid id PK
        text filePath
        uuid taskId FK
        enum agentType
        timestamp expiresAt
    }

    artifacts {
        uuid id PK
        uuid projectId FK
        uuid taskId FK
        enum type
        text name
        text filePath
        text content
    }

    project_briefs {
        uuid id PK
        uuid clientId FK
        text title
        text rawContent
        enum status
    }

    project_scopes {
        uuid id PK
        uuid briefId FK
        uuid projectId FK
        jsonb scopeData
        text clientDocument
        enum status
    }

    milestones {
        uuid id PK
        uuid projectId FK
        text name
        jsonb deliverables
        enum status
    }

    client_reports {
        uuid id PK
        uuid projectId FK
        enum reportType
        text reportContent
        text internalNotes
    }

    cost_tracking {
        uuid id PK
        uuid projectId FK
        uuid taskId FK
        enum agentType
        integer tokensInput
        integer tokensOutput
        numeric apiCostUsd
    }

    deployments {
        uuid id PK
        uuid projectId FK
        enum environment
        enum status
        text deployUrl
    }

    agent_sessions {
        uuid id PK
        enum agentType
        enum status
        uuid currentTaskId
    }
```

---

## 4. Task Lifecycle (State Machine)

```mermaid
stateDiagram-v2
    [*] --> pending: Task created

    pending --> queued: Enqueued to BullMQ

    queued --> running: Worker picks up job

    running --> completed: Success
    running --> failed: Error (attempt < 3)
    running --> waiting_human: Questions raised OR<br/>3 strikes exhausted

    failed --> queued: Auto-retry<br/>(attemptCount++)

    waiting_human --> processing_answer: Human answers question
    processing_answer --> queued: Re-enqueued with<br/>answered context

    running --> blocked: Dependency not met /<br/>file lock conflict
    blocked --> queued: Dependency resolved /<br/>lock released

    completed --> [*]

    note right of waiting_human
        3-strike rule:
        After 3 failures,
        escalates to human review
    end note

    note right of running
        Agent processing:
        1. Load SKILLs
        2. Load context
        3. Call Claude API
        4. Parse output
        5. Write files
        6. Record cost
    end note
```

---

## 5. Request Flow (End to End)

```mermaid
sequenceDiagram
    actor User
    participant UI as Next.js UI
    participant API as API Route
    participant Svc as TaskService
    participant Q as BullMQ Queue
    participant W as Worker
    participant Agent as Agent
    participant Skill as SKILL Loader
    participant Ctx as Context Loader
    participant AI as Claude API
    participant FW as File Writer
    participant DB as Neon PostgreSQL

    User->>UI: Create task
    UI->>API: POST /api/tasks/create
    API->>Svc: createTask(projectId, input)
    Svc->>DB: INSERT task (status: pending)
    Svc->>Q: enqueueTask(taskId, agentType, priority)
    Svc->>DB: UPDATE task (status: queued)
    API-->>UI: { task }

    Note over Q,W: Async — worker polling

    Q->>W: Job picked up
    W->>DB: UPDATE task (status: running)
    W->>Agent: processTask(task)

    Agent->>Skill: loadSkillsForTask(agentType, description)
    Skill-->>Agent: core + patterns? + examples?

    Agent->>Ctx: buildContext(task)
    Ctx->>DB: Load schema, routes, deps
    Ctx-->>Agent: Profiled context

    Agent->>AI: messages[] with SKILL + context
    AI-->>Agent: Response (code files / YAML commands)

    Agent->>FW: writeGeneratedFiles(taskId, files)
    FW-->>Agent: Files written to generated/

    Agent->>DB: Record artifacts + cost tracking
    Agent->>DB: UPDATE task (status: completed, result)
    W-->>Q: Job complete
```

---

## 6. Monorepo Package Graph

```mermaid
graph LR
    subgraph Root["Root Workspace"]
        NextApp["Next.js 15 App<br/>(src/)"]
        Turbo["Turborepo<br/>build | dev | test | lint"]
    end

    subgraph Packages["packages/"]
        Core["@soloenterprise/core<br/>─────────────<br/>agents/<br/>queue/<br/>services/<br/>utils/"]
        DBPkg["@soloenterprise/db<br/>─────────────<br/>schema.ts<br/>index.ts (Neon client)"]
    end

    subgraph SkillFiles["skills/"]
        S1["backend/ (3 layers)"]
        S2["frontend/ (3 layers)"]
        S3["qa/ (3 layers)"]
        S4["orchestrator/ (4 layers)"]
        S5["project-scoper/ (3 layers)"]
        S6["client-reporter/ (2 layers)"]
    end

    NextApp -->|"import"| Core
    NextApp -->|"import"| DBPkg
    Core -->|"import"| DBPkg
    Core -->|"reads at runtime"| SkillFiles
    Turbo -->|"orchestrates"| NextApp
    Turbo -->|"orchestrates"| Core
    Turbo -->|"orchestrates"| DBPkg
```

---

## 7. SKILL Loading Strategy

```mermaid
flowchart TD
    TaskDesc["Task Description"]

    TaskDesc --> Detect{"Complexity<br/>Detection"}

    Detect -->|"Simple endpoint<br/>basic component"| Simple["Load: Core only<br/>~1,000 tokens"]
    Detect -->|"Database work<br/>complex feature"| Medium["Load: Core + Patterns<br/>~2,000 tokens"]
    Detect -->|"New pattern<br/>(auth, queues, WS)"| Full["Load: Core + Patterns + Examples<br/>~3,500 tokens"]

    Simple --> Cache["Apply Prompt Caching<br/>(SKILL = ephemeral cache)"]
    Medium --> Cache
    Full --> Cache

    Cache --> Prompt["Final Prompt:<br/>system[] + SKILL + context + task"]

    subgraph Layers["SKILL Layers"]
        L1["Core<br/>Always loaded<br/>Conventions, output format"]
        L2["Patterns<br/>Conditionally loaded<br/>DB patterns, state mgmt"]
        L3["Examples<br/>Rarely loaded<br/>Full implementation examples"]
    end
```

---

## 8. Consulting Pipeline Flow

```mermaid
flowchart LR
    subgraph Input["Client Input"]
        Brief["Project Brief<br/>(raw text)"]
    end

    subgraph Scoping["Project Scoper Agent"]
        Analyze["Analyze brief<br/>+ ask clarifying Qs"]
        Scope["Generate scope:<br/>YAML spec +<br/>client document"]
    end

    subgraph Approval["Human Review"]
        Review["Principal reviews<br/>scope + estimates"]
        Approve{"Approved?"}
    end

    subgraph Execution["Project Execution"]
        Project["Create Project<br/>+ Milestones"]
        Orchestrator["Orchestrator<br/>decomposes into tasks"]
        Agents["Tech Agents<br/>execute tasks"]
    end

    subgraph Reporting["Client Reporter Agent"]
        Report["Generate report:<br/>weekly / milestone /<br/>summary"]
        Deliver["Client-facing<br/>markdown report +<br/>internal notes"]
    end

    Brief --> Analyze
    Analyze --> Scope
    Scope --> Review
    Review --> Approve
    Approve -->|"Yes"| Project
    Approve -->|"No / Changes"| Analyze
    Project --> Orchestrator
    Orchestrator --> Agents
    Agents --> Report
    Report --> Deliver
```

---

## 9. File Sandbox Security Model

```mermaid
flowchart TD
    Agent["Agent Output<br/>file path + content"]

    Agent --> FW["File Writer<br/>(file-writer.ts)"]

    FW --> Check{"Path Analysis"}

    Check -->|"/etc/passwd"| Strip1["Strip absolute path"]
    Check -->|"../../../etc/passwd"| Strip2["Strip traversal"]
    Check -->|"packages/db/src/schema.ts"| Strip3["Sandbox production path"]

    Strip1 --> Sandbox
    Strip2 --> Sandbox
    Strip3 --> Sandbox

    Sandbox["Sandboxed Path:<br/>packages/core/generated/<br/>tasks/{taskId}/{path}"]

    Sandbox --> Write["Write file safely"]

    subgraph GeneratedDir["generated/ (sandboxed output)"]
        Tasks["tasks/{taskId}/<br/>Agent-generated code"]
        Reports["reports/{projectId}/<br/>Scoper + Reporter output"]
    end

    Write --> Tasks
    Write --> Reports

    style Sandbox fill:#2d5a27,color:#fff
    style Check fill:#8b4513,color:#fff
```

---

## 10. Cost Tracking Flow

```mermaid
flowchart LR
    subgraph AgentExec["Agent Execution"]
        Call["Claude API Call"]
        Usage["Token Usage:<br/>input | output | cached"]
    end

    subgraph Pricing["Token Pricing Engine"]
        Model{"Model?"}
        Model -->|"Haiku 3.5"| H["$0.25 / $1.25<br/>per M tokens"]
        Model -->|"Sonnet 4.5"| S["$3.00 / $15.00<br/>per M tokens"]
        Model -->|"Opus 4.6"| O["$5.00 / $25.00<br/>per M tokens"]
        CacheDisc["Cached tokens:<br/>90% discount"]
    end

    subgraph Storage["Cost Tracking Service"]
        Record["recordAgentCost()"]
        DB["cost_tracking table:<br/>tokensIn, tokensOut,<br/>cachedTokens,<br/>apiCostUsd,<br/>estimatedBillableHours"]
    end

    subgraph Dashboard["Metrics Dashboard"]
        Total["Total API cost"]
        PerProject["Cost per project"]
        PerAgent["Cost per agent type"]
    end

    Call --> Usage
    Usage --> Model
    H --> CacheDisc
    S --> CacheDisc
    O --> CacheDisc
    CacheDisc --> Record
    Record --> DB
    DB --> Dashboard
```
