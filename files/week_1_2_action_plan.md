# Week 1-2 Action Plan: Build the Foundation

## What You're Building First

**NOT agents.** Agents are useless without orchestration.

You're building:
1. The task queue and state management
2. The human question queue
3. The artifact storage
4. A simple test agent to prove it works

---

## Day 1: Project Setup

```bash
# Create the monorepo structure
mkdir -p product-factory/{packages,apps,agents}
cd product-factory

# Initialize
pnpm init
pnpm add -D typescript @types/node tsx

# Core packages
mkdir -p packages/core          # Orchestration logic
mkdir -p packages/db            # Database schema + queries
mkdir -p packages/agents        # Agent base classes
mkdir -p apps/dashboard         # Next.js UI
mkdir -p apps/worker            # Agent worker process
```

### Recommended Stack (Day 1 Decisions)

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Monorepo | pnpm workspaces | Simple, fast |
| Language | TypeScript | End-to-end type safety |
| Database | PostgreSQL (Neon) | You know it, pgvector included |
| Queue | BullMQ + Redis (Upstash) | Proven, great dashboard |
| API | Hono | Fast, modern, great DX |
| Frontend | Next.js 14 + shadcn | Quick to build |
| ORM | Drizzle | Type-safe, SQL-like |

---

## Day 2: Database Schema

```typescript
// packages/db/schema.ts
import { pgTable, uuid, text, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  brief: text('brief').notNull(),
  status: text('status').notNull().default('initializing'),
  config: jsonb('config').$type<ProjectConfig>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  agentType: text('agent_type').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  // pending | queued | running | waiting_human | blocked | completed | failed
  
  inputs: jsonb('inputs').$type<Record<string, any>>(),
  outputs: jsonb('outputs').$type<Record<string, any>>(),
  error: text('error'),
  
  dependsOn: uuid('depends_on').array(),
  priority: text('priority').default('medium'),
  
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  
  createdAt: timestamp('created_at').defaultNow(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id).notNull(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  
  agentType: text('agent_type').notNull(),
  category: text('category').notNull(), // architecture | design | legal | marketing | technical | strategic
  priority: text('priority').notNull().default('medium'), // critical | high | medium | low
  
  question: text('question').notNull(),
  context: text('context'),
  options: jsonb('options').$type<string[]>(),
  
  answer: text('answer'),
  answeredAt: timestamp('answered_at'),
  
  blocksTaskIds: uuid('blocks_task_ids').array(),
  
  createdAt: timestamp('created_at').defaultNow(),
});

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  taskId: uuid('task_id').references(() => tasks.id),
  
  type: text('type').notNull(), // code | document | image | config | test_result
  path: text('path').notNull(),
  content: text('content'),
  metadata: jsonb('metadata'),
  
  version: integer('version').default(1),
  
  createdAt: timestamp('created_at').defaultNow(),
});

// Types
export type ProjectConfig = {
  techStack?: {
    frontend?: string;
    backend?: string;
    database?: string;
    hosting?: string;
  };
  preferences?: {
    codeStyle?: string;
    brandVoice?: string;
  };
};

export type TaskStatus = 
  | 'pending' 
  | 'queued' 
  | 'running' 
  | 'waiting_human' 
  | 'blocked' 
  | 'completed' 
  | 'failed';
```

---

## Day 3: Task Queue Setup

```typescript
// packages/core/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

// One queue per agent type
export const createAgentQueue = (agentType: string) => {
  return new Queue(`agent:${agentType}`, { connection });
};

// Task structure
export interface AgentTask {
  taskId: string;
  projectId: string;
  agentType: string;
  inputs: Record<string, any>;
  context: {
    projectBrief: string;
    techStack: Record<string, string>;
    relevantArtifacts: string[];
  };
}

// Worker factory
export const createAgentWorker = (
  agentType: string,
  processor: (job: Job<AgentTask>) => Promise<AgentResult>
) => {
  return new Worker(`agent:${agentType}`, processor, {
    connection,
    concurrency: 1, // Start with 1, increase as needed
  });
};

// Result structure
export interface AgentResult {
  success: boolean;
  outputs?: Record<string, any>;
  artifacts?: Array<{
    type: string;
    path: string;
    content: string;
  }>;
  questions?: Array<{
    question: string;
    context: string;
    category: string;
    priority: string;
    options?: string[];
  }>;
  error?: string;
}
```

---

## Day 4: Orchestrator Core

```typescript
// packages/core/orchestrator.ts
import { db } from '../db';
import { tasks, questions, artifacts, projects } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createAgentQueue } from './queue';

export class Orchestrator {
  
  // Create a new project and its initial tasks
  async createProject(name: string, brief: string): Promise<string> {
    const [project] = await db.insert(projects).values({
      name,
      brief,
      status: 'initializing',
    }).returning();
    
    // Create initial tasks based on project type
    // For now, just create a simple task chain
    await this.createInitialTasks(project.id, brief);
    
    return project.id;
  }
  
  // Queue a task for execution
  async queueTask(taskId: string): Promise<void> {
    const [task] = await db.select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    // Check dependencies
    const canRun = await this.checkDependencies(taskId);
    if (!canRun) {
      await db.update(tasks)
        .set({ status: 'blocked' })
        .where(eq(tasks.id, taskId));
      return;
    }
    
    // Queue it
    const queue = createAgentQueue(task.agentType);
    await queue.add(task.name, {
      taskId: task.id,
      projectId: task.projectId,
      agentType: task.agentType,
      inputs: task.inputs,
      context: await this.buildContext(task.projectId, taskId),
    });
    
    await db.update(tasks)
      .set({ status: 'queued' })
      .where(eq(tasks.id, taskId));
  }
  
  // Check if all dependencies are met
  async checkDependencies(taskId: string): Promise<boolean> {
    const [task] = await db.select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }
    
    const deps = await db.select()
      .from(tasks)
      .where(inArray(tasks.id, task.dependsOn));
    
    return deps.every(d => d.status === 'completed');
  }
  
  // Handle task completion
  async completeTask(taskId: string, result: AgentResult): Promise<void> {
    // Update task
    await db.update(tasks)
      .set({
        status: result.success ? 'completed' : 'failed',
        outputs: result.outputs,
        error: result.error,
        completedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    
    // Store artifacts
    if (result.artifacts) {
      for (const artifact of result.artifacts) {
        await db.insert(artifacts).values({
          projectId: (await this.getTask(taskId)).projectId,
          taskId,
          type: artifact.type,
          path: artifact.path,
          content: artifact.content,
        });
      }
    }
    
    // Queue questions
    if (result.questions) {
      for (const q of result.questions) {
        await this.queueQuestion(taskId, q);
      }
    }
    
    // Unblock dependent tasks
    await this.checkAndUnblockTasks(taskId);
  }
  
  // Queue a question for human input
  async queueQuestion(taskId: string, question: Omit<Question, 'id' | 'taskId'>): Promise<void> {
    const task = await this.getTask(taskId);
    
    await db.insert(questions).values({
      taskId,
      projectId: task.projectId,
      agentType: task.agentType,
      ...question,
    });
    
    // Update task status
    await db.update(tasks)
      .set({ status: 'waiting_human' })
      .where(eq(tasks.id, taskId));
  }
  
  // Answer a question and potentially resume task
  async answerQuestion(questionId: string, answer: string): Promise<void> {
    const [question] = await db.select()
      .from(questions)
      .where(eq(questions.id, questionId));
    
    await db.update(questions)
      .set({ answer, answeredAt: new Date() })
      .where(eq(questions.id, questionId));
    
    // Check if task can resume
    const pendingQuestions = await db.select()
      .from(questions)
      .where(and(
        eq(questions.taskId, question.taskId),
        eq(questions.answer, null)
      ));
    
    if (pendingQuestions.length === 0) {
      // Re-queue the task with the answer in context
      await this.queueTask(question.taskId);
    }
  }
  
  // Build context for an agent
  private async buildContext(projectId: string, taskId: string) {
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));
    
    const relevantArtifacts = await db.select()
      .from(artifacts)
      .where(eq(artifacts.projectId, projectId))
      .limit(10); // TODO: Semantic search for relevance
    
    const answeredQuestions = await db.select()
      .from(questions)
      .where(and(
        eq(questions.projectId, projectId),
        not(eq(questions.answer, null))
      ));
    
    return {
      projectBrief: project.brief,
      techStack: project.config?.techStack || {},
      relevantArtifacts: relevantArtifacts.map(a => a.content),
      decisions: answeredQuestions.map(q => ({
        question: q.question,
        answer: q.answer,
      })),
    };
  }
  
  // After a task completes, check if blocked tasks can now run
  private async checkAndUnblockTasks(completedTaskId: string) {
    const blockedTasks = await db.select()
      .from(tasks)
      .where(eq(tasks.status, 'blocked'));
    
    for (const task of blockedTasks) {
      if (task.dependsOn?.includes(completedTaskId)) {
        const canRun = await this.checkDependencies(task.id);
        if (canRun) {
          await this.queueTask(task.id);
        }
      }
    }
  }
}
```

---

## Day 5: Test Agent

A simple agent that proves the system works:

```typescript
// packages/agents/echo-agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { createAgentWorker, AgentTask, AgentResult } from '../core/queue';

const anthropic = new Anthropic();

export const echoAgent = createAgentWorker('echo', async (job): Promise<AgentResult> => {
  const task = job.data as AgentTask;
  
  // Simple test: ask Claude to echo with a twist
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Echo this message but make it more professional: "${task.inputs.message}"`
    }]
  });
  
  const content = response.content[0];
  if (content.type !== 'text') {
    return { success: false, error: 'Unexpected response type' };
  }
  
  return {
    success: true,
    outputs: {
      original: task.inputs.message,
      professional: content.text,
    },
    artifacts: [{
      type: 'document',
      path: '/outputs/echo-result.txt',
      content: content.text,
    }],
    // Test question flow
    questions: task.inputs.askQuestion ? [{
      question: 'Should I make this even more formal?',
      context: `Original: ${task.inputs.message}\nProfessional: ${content.text}`,
      category: 'design',
      priority: 'low',
      options: ['Yes, more formal', 'No, this is good', 'Make it casual instead'],
    }] : [],
  };
});
```

---

## Day 6-7: Minimal Dashboard

```typescript
// apps/dashboard/app/page.tsx
import { db } from '@product-factory/db';
import { projects, tasks, questions } from '@product-factory/db/schema';
import { desc, eq } from 'drizzle-orm';

export default async function Dashboard() {
  const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));
  const pendingQuestions = await db.select().from(questions).where(eq(questions.answer, null));
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Product Factory</h1>
      
      {/* Pending Questions - Most Important */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">
          Pending Decisions ({pendingQuestions.length})
        </h2>
        <QuestionQueue questions={pendingQuestions} />
      </section>
      
      {/* Projects */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Projects</h2>
        <ProjectList projects={allProjects} />
      </section>
    </div>
  );
}

// apps/dashboard/components/question-queue.tsx
'use client';

import { useState } from 'react';
import { answerQuestion } from '../actions';

export function QuestionQueue({ questions }) {
  return (
    <div className="space-y-4">
      {questions.map(q => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </div>
  );
}

function QuestionCard({ question }) {
  const [answer, setAnswer] = useState('');
  
  const handleSubmit = async () => {
    await answerQuestion(question.id, answer);
  };
  
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-1 rounded text-xs ${
          question.priority === 'critical' ? 'bg-red-100 text-red-800' :
          question.priority === 'high' ? 'bg-orange-100 text-orange-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {question.priority}
        </span>
        <span className="text-sm text-gray-500">{question.agentType}</span>
      </div>
      
      <p className="font-medium mb-2">{question.question}</p>
      
      {question.context && (
        <p className="text-sm text-gray-600 mb-4">{question.context}</p>
      )}
      
      {question.options ? (
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => { setAnswer(opt); handleSubmit(); }}
              className="block w-full text-left px-3 py-2 border rounded hover:bg-gray-50"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
            placeholder="Your answer..."
          />
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## End of Week 2: What You Should Have

✅ PostgreSQL database with projects, tasks, questions, artifacts tables  
✅ BullMQ task queues connected to Redis  
✅ Orchestrator that can create projects, queue tasks, handle dependencies  
✅ Question queue that pauses tasks and resumes them  
✅ One test agent proving the pipeline works  
✅ Basic dashboard showing pending questions and project status  

### Test It

```typescript
// scripts/test-pipeline.ts
import { Orchestrator } from '../packages/core/orchestrator';

const orchestrator = new Orchestrator();

async function test() {
  // Create a project
  const projectId = await orchestrator.createProject(
    'Test Project',
    'A simple test to validate the pipeline'
  );
  console.log('Created project:', projectId);
  
  // Create a task
  const taskId = await orchestrator.createTask(projectId, {
    agentType: 'echo',
    name: 'Echo Test',
    inputs: {
      message: 'Hello world',
      askQuestion: true,
    },
  });
  console.log('Created task:', taskId);
  
  // Queue it
  await orchestrator.queueTask(taskId);
  console.log('Task queued');
  
  // Now run the worker and watch the dashboard...
}

test();
```

---

## Week 3 Preview: Real Backend Agent

Once the foundation works, you build the first real agent:

```typescript
// packages/agents/backend-developer.ts
const SYSTEM_PROMPT = `You are a senior backend developer.

You will receive:
1. A feature specification
2. The tech stack to use
3. Any relevant existing code

Your job:
1. Plan the implementation
2. Write production-ready code with error handling
3. Write tests
4. If you need a decision (architecture, dependencies, etc.), ask

Output format:
- PLAN: Your implementation plan
- CODE: The actual code files (use XML tags for each file)
- TESTS: Test files
- QUESTIONS: Any decisions needed (or "None")
`;

// This is where the real work happens...
```

---

## Immediate Next Steps

1. **Fork/clone a starter repo** or set up the structure above
2. **Get your infrastructure running:**
   - Neon database (free tier)
   - Upstash Redis (free tier)
   - Local dev environment
3. **Build the schema and orchestrator first**
4. **Test with the echo agent before touching real code generation**

---

## Your Call

Do you want me to:

A) **Flesh out a specific agent** (e.g., the backend developer with full system prompt and tool usage)?

B) **Design the dashboard UI in more detail** (React components, real-time updates)?

C) **Map out the complete task dependency graph** for a "new product" workflow?

D) **Something else?**

What's your preferred starting point?
