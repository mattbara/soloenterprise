/**
 * Orchestrator Stress Tests (6-10)
 *
 * Run with a test number:
 *   pnpm tsx scripts/test-orchestrator-stress.ts 6    # Test 6: Concurrent Multi-Project Tasks
 *   pnpm tsx scripts/test-orchestrator-stress.ts 7    # Test 7: Large Decomposition
 *   pnpm tsx scripts/test-orchestrator-stress.ts 8    # Test 8: Contradictory Requirements
 *   pnpm tsx scripts/test-orchestrator-stress.ts 9    # Test 9: Requirement Referencing Existing Work
 *   pnpm tsx scripts/test-orchestrator-stress.ts 10   # Test 10: Recovery After Failure
 *   pnpm tsx scripts/test-orchestrator-stress.ts 10a  # Test 10 Step 1: Create stats endpoint task
 *   pnpm tsx scripts/test-orchestrator-stress.ts 10b  # Test 10 Step 2: Manually fail the backend task
 *   pnpm tsx scripts/test-orchestrator-stress.ts 10c  # Test 10 Step 3: Enqueue retry request
 *   pnpm tsx scripts/test-orchestrator-stress.ts verify <testNum>  # Verify results for a test
 */

// Load environment variables BEFORE any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

// ============================================================================
// Test Case Definitions
// ============================================================================

const TEST_PROJECT_1 = 'Orchestrator Test Project'; // Same as baseline tests
const TEST_PROJECT_2 = 'Stress Test Project B';

interface StressTestCase {
  name: string;
  description: string;
  projectName: string;
  projectDescription: string;
  context: Record<string, unknown>;
}

const TEST_CASES: Record<string, StressTestCase | StressTestCase[]> = {
  // Test 6: Concurrent Multi-Project Tasks — two tasks on different projects
  '6': [
    {
      name: 'Settings Page Feature',
      description: 'Add a settings page where users can update their email and password',
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      context: {
        projectName: TEST_PROJECT_1,
        projectDescription: 'Test project for orchestrator agent baseline tests',
        requirements: 'Add a settings page where users can update their email and password',
      },
    },
    {
      name: 'Stripe Webhook Endpoint',
      description: 'Create a webhook endpoint at POST /api/webhooks/stripe that handles payment_intent.succeeded and payment_intent.failed events',
      projectName: TEST_PROJECT_2,
      projectDescription: 'Secondary test project for concurrent stress testing',
      context: {
        projectName: TEST_PROJECT_2,
        projectDescription: 'Secondary test project for concurrent stress testing',
        requirements: 'Create a webhook endpoint at POST /api/webhooks/stripe that handles payment_intent.succeeded and payment_intent.failed events',
      },
    },
  ],

  // Test 7: Large Decomposition
  '7': {
    name: 'Large Decomposition - Project Management Tool',
    description: `Build a complete project management tool with the following:
- User registration and login with JWT
- Organizations (users belong to orgs, orgs have multiple projects)
- Projects with name, description, status
- Tasks within projects: title, description, assignee, status, priority, due date
- Comments on tasks
- Activity log tracking all changes
- Dashboard showing task counts by status, overdue tasks, recent activity
- REST API for all CRUD operations
- Frontend pages: org list, project board (kanban), task detail, dashboard, settings`,
    projectName: TEST_PROJECT_1,
    projectDescription: 'Test project for orchestrator agent baseline tests',
    context: {
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: `Build a complete project management tool with the following:
- User registration and login with JWT
- Organizations (users belong to orgs, orgs have multiple projects)
- Projects with name, description, status
- Tasks within projects: title, description, assignee, status, priority, due date
- Comments on tasks
- Activity log tracking all changes
- Dashboard showing task counts by status, overdue tasks, recent activity
- REST API for all CRUD operations
- Frontend pages: org list, project board (kanban), task detail, dashboard, settings`,
    },
  },

  // Test 8: Contradictory Requirements
  '8': {
    name: 'Contradictory Requirements - Real-Time Chat',
    description: 'Build a real-time chat feature. It should work without WebSockets. Messages should be end-to-end encrypted but also searchable by admins. The frontend should be server-side rendered but also update in real-time without page refreshes. Use MongoDB for storage.',
    projectName: TEST_PROJECT_1,
    projectDescription: 'Test project for orchestrator agent baseline tests',
    context: {
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Build a real-time chat feature. It should work without WebSockets. Messages should be end-to-end encrypted but also searchable by admins. The frontend should be server-side rendered but also update in real-time without page refreshes. Use MongoDB for storage.',
    },
  },

  // Test 9: Requirement Referencing Existing Work
  '9': {
    name: 'Blog Pagination & Search (Extends Existing Blog)',
    description: 'The blog system from earlier needs pagination — 10 posts per page. Also add a search feature that filters posts by title and content.',
    projectName: TEST_PROJECT_1,
    projectDescription: 'Test project for orchestrator agent baseline tests',
    context: {
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'The blog system from earlier needs pagination — 10 posts per page. Also add a search feature that filters posts by title and content.',
    },
  },

  // Test 10a: Create the stats endpoint task
  '10a': {
    name: 'Stats Endpoint',
    description: 'Create a GET /api/stats endpoint that returns total users and total posts counts',
    projectName: TEST_PROJECT_1,
    projectDescription: 'Test project for orchestrator agent baseline tests',
    context: {
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Create a GET /api/stats endpoint that returns total users and total posts counts',
    },
  },

  // Test 10c: Retry request after failure
  '10c': {
    name: 'Stats Endpoint Failure Recovery',
    description: 'The stats endpoint task failed. Please review and retry.',
    projectName: TEST_PROJECT_1,
    projectDescription: 'Test project for orchestrator agent baseline tests',
    context: {
      projectName: TEST_PROJECT_1,
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'The stats endpoint task failed. Please review and retry.',
    },
  },
};

// ============================================================================
// Main Functions
// ============================================================================

async function getOrCreateProject(
  db: any,
  projectsTable: any,
  eq: any,
  name: string,
  description: string
): Promise<any> {
  let project = await db.query.projects.findFirst({
    where: eq(projectsTable.name, name),
  });

  if (!project) {
    console.log(`[StressTest] Creating project: ${name}`);
    const [newProject] = await db
      .insert(projectsTable)
      .values({
        name,
        description,
        status: 'active',
        config: {
          techStack: ['typescript', 'nextjs', 'drizzle', 'tailwind'],
        },
      })
      .returning();
    project = newProject;
    console.log(`[StressTest] Created project: ${project.id}`);
  } else {
    console.log(`[StressTest] Using existing project: ${project.id} (${name})`);
  }

  return project;
}

async function enqueueTest(testKey: string): Promise<void> {
  const testCase = TEST_CASES[testKey];
  if (!testCase) {
    console.error(`Unknown test: ${testKey}`);
    console.error('Available tests: 6, 7, 8, 9, 10a, 10b, 10c');
    process.exit(1);
  }

  // Dynamic imports after env is loaded
  const { db } = await import('@soloenterprise/db');
  const { projects } = await import('@soloenterprise/db/schema');
  const { createTask, shutdown } = await import('@soloenterprise/core/services');
  const { eq } = await import('drizzle-orm');

  try {
    // Handle concurrent tests (Test 6 — array of test cases)
    if (Array.isArray(testCase)) {
      console.log(`\n[StressTest] ===== STRESS TEST 6: Concurrent Multi-Project Tasks =====\n`);
      console.log(`[StressTest] Enqueuing ${testCase.length} tasks across different projects...\n`);

      const results: { projectId: string; projectName: string; taskId: string; jobId: string; name: string }[] = [];

      for (const tc of testCase) {
        const project = await getOrCreateProject(db, projects, eq, tc.projectName, tc.projectDescription);

        const { taskId, jobId } = await createTask(project.id, {
          name: tc.name,
          description: tc.description,
          agentType: 'orchestrator',
          priority: 'medium',
          context: tc.context,
        });

        results.push({
          projectId: project.id,
          projectName: tc.projectName,
          taskId,
          jobId,
          name: tc.name,
        });

        console.log(`[StressTest] Enqueued: "${tc.name}" → Project "${tc.projectName}"`);
      }

      console.log('\n========================================');
      console.log('TEST 6 - Concurrent tasks enqueued');
      console.log('========================================');
      for (const r of results) {
        console.log(`\n  Project:  ${r.projectName} (${r.projectId})`);
        console.log(`  Task:     ${r.name}`);
        console.log(`  Task ID:  ${r.taskId}`);
        console.log(`  Job ID:   ${r.jobId}`);
      }
      console.log('\n========================================');
      console.log('\nBoth tasks are now in the queue.');
      console.log('Start the orchestrator worker if not already running:');
      console.log('  cd packages/core && pnpm worker:orchestrator');
      console.log('\nWatch for: Race conditions, cross-contamination, file lock conflicts.');
      console.log('========================================\n');

    } else {
      // Single test case
      const testNum = testKey.replace(/[abc]$/, '');
      const stepLabel = testKey.match(/[abc]$/) ? ` (Step ${testKey.slice(-1).toUpperCase()})` : '';

      console.log(`\n[StressTest] ===== STRESS TEST ${testNum}${stepLabel}: ${testCase.name} =====\n`);

      const project = await getOrCreateProject(db, projects, eq, testCase.projectName, testCase.projectDescription);

      console.log(`[StressTest] Enqueuing orchestrator task...`);
      console.log(`[StressTest] Name: ${testCase.name}`);
      console.log(`[StressTest] Description: ${testCase.description}`);

      const { taskId, jobId } = await createTask(project.id, {
        name: testCase.name,
        description: testCase.description,
        agentType: 'orchestrator',
        priority: 'medium',
        context: testCase.context,
      });

      console.log('\n========================================');
      console.log(`TEST ${testKey.toUpperCase()} - Orchestrator task enqueued`);
      console.log('========================================');
      console.log(`Project ID: ${project.id}`);
      console.log(`Task ID:    ${taskId}`);
      console.log(`Job ID:     ${jobId}`);
      console.log('========================================');
      console.log('\nStart the orchestrator worker if not already running:');
      console.log('  cd packages/core && pnpm worker:orchestrator');
      console.log('========================================\n');
    }
  } finally {
    await shutdown();
  }
}

/**
 * Test 10b: Manually fail the most recent backend task created by Test 10a.
 */
async function failStatsTask(): Promise<void> {
  const { db } = await import('@soloenterprise/db');
  const { projects, tasks } = await import('@soloenterprise/db/schema');
  const { shutdown } = await import('@soloenterprise/core/services');
  const { eq, and, desc, like, or } = await import('drizzle-orm');

  console.log('\n[StressTest] ===== STRESS TEST 10 (Step B): Manually Fail Stats Task =====\n');

  try {
    // Find the test project
    const project = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_1),
    });

    if (!project) {
      console.error('[StressTest] ERROR: Test project not found. Run test 10a first.');
      process.exit(1);
    }

    // Find the most recent backend task related to stats
    const statsTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, project.id),
        eq(tasks.agentType, 'backend'),
      ),
      orderBy: [desc(tasks.createdAt)],
    });

    // Find a stats-related task
    const statsTask = statsTasks.find(t =>
      t.name.toLowerCase().includes('stats') ||
      t.description?.toLowerCase().includes('stats') ||
      t.description?.toLowerCase().includes('/api/stats')
    );

    if (!statsTask) {
      console.error('[StressTest] ERROR: No stats-related backend task found.');
      console.error('[StressTest] Available backend tasks:');
      for (const t of statsTasks.slice(0, 5)) {
        console.error(`  - ${t.id.slice(0, 8)}: "${t.name}" (${t.status})`);
      }
      console.error('\nMake sure test 10a was processed by the worker first.');
      process.exit(1);
    }

    console.log(`[StressTest] Found stats task: ${statsTask.id}`);
    console.log(`[StressTest] Name: ${statsTask.name}`);
    console.log(`[StressTest] Current status: ${statsTask.status}`);

    // Set it to failed
    await db.update(tasks).set({
      status: 'failed',
      attemptCount: 1,
      result: {
        success: false,
        error: 'Simulated failure for stress test 10 - testing recovery workflow',
        summary: 'Task failed during execution (simulated)',
      },
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tasks.id, statsTask.id));

    console.log('\n========================================');
    console.log('TEST 10B - Stats task manually set to FAILED');
    console.log('========================================');
    console.log(`Task ID:  ${statsTask.id}`);
    console.log(`Name:     ${statsTask.name}`);
    console.log(`Status:   failed (was: ${statsTask.status})`);
    console.log('========================================');
    console.log('\nNow run step 10c to enqueue the retry request:');
    console.log('  pnpm tsx scripts/test-orchestrator-stress.ts 10c');
    console.log('========================================\n');
  } finally {
    await shutdown();
  }
}

/**
 * Verify test results by querying the database.
 */
async function verifyTest(testNum: string): Promise<void> {
  const { db } = await import('@soloenterprise/db');
  const { projects, tasks, questions, fileLocks } = await import('@soloenterprise/db/schema');
  const { shutdown } = await import('@soloenterprise/core/services');
  const { eq, desc, and, gt } = await import('drizzle-orm');

  console.log(`\n[StressTest] ===== VERIFY TEST ${testNum} =====\n`);

  try {
    // Get projects
    const project1 = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_1),
    });
    const project2 = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_2),
    });

    const projectIds = [project1?.id, project2?.id].filter(Boolean) as string[];

    if (projectIds.length === 0) {
      console.error('[StressTest] No test projects found.');
      process.exit(1);
    }

    for (const projectId of projectIds) {
      const project = projectId === project1?.id ? project1 : project2;
      console.log(`\n--- Project: ${project!.name} (${projectId.slice(0, 8)}) ---\n`);

      // All tasks for this project
      const allTasks = await db.query.tasks.findMany({
        where: eq(tasks.projectId, projectId),
        orderBy: [desc(tasks.createdAt)],
      });

      // Orchestrator tasks
      const orchTasks = allTasks.filter(t => t.agentType === 'orchestrator');
      const childTasks = allTasks.filter(t => t.agentType !== 'orchestrator');

      console.log(`Total tasks: ${allTasks.length} (${orchTasks.length} orchestrator, ${childTasks.length} child)`);
      console.log('');

      // Show orchestrator tasks
      console.log('Orchestrator Tasks:');
      for (const t of orchTasks) {
        const result = t.result as any;
        const tokenMetrics = t.tokenMetrics as any;
        const inputTokens = tokenMetrics?.inputTokens ?? '?';
        const outputTokens = tokenMetrics?.outputTokens ?? '?';
        console.log(`  ${t.id.slice(0, 8)} | ${t.status.padEnd(14)} | ${t.name}`);
        console.log(`           | tokens: ${inputTokens} in / ${outputTokens} out`);
        if (result?.summary) {
          console.log(`           | ${result.summary}`);
        }
        if (result?.error) {
          console.log(`           | ERROR: ${result.error}`);
        }
      }
      console.log('');

      // Show child tasks
      if (childTasks.length > 0) {
        console.log('Child Tasks:');
        console.log('  ID       | Agent     | Status         | Priority | Deps | Name');
        console.log('  ' + '-'.repeat(80));
        for (const t of childTasks) {
          const deps = t.dependsOn?.length ? t.dependsOn.map(d => d.slice(0, 8)).join(',') : '-';
          console.log(`  ${t.id.slice(0, 8)} | ${t.agentType.padEnd(9)} | ${t.status.padEnd(14)} | ${t.priority.padEnd(8)} | ${deps.padEnd(4)} | ${t.name}`);
        }
        console.log('');
      }

      // Show questions
      const projectQuestions = await db.query.questions.findMany({
        where: eq(questions.projectId, projectId),
        orderBy: [desc(questions.createdAt)],
      });

      if (projectQuestions.length > 0) {
        console.log(`Questions (${projectQuestions.length}):`);
        for (const q of projectQuestions) {
          console.log(`  ${q.id.slice(0, 8)} | ${q.status.padEnd(10)} | ${q.priority.padEnd(12)} | ${q.isBlocking ? 'BLOCKING' : '-'.padEnd(8)} | ${q.question.slice(0, 60)}`);
        }
        console.log('');
      }

      // Show file locks
      const locks = await db.query.fileLocks.findMany({
        where: gt(fileLocks.expiresAt, new Date()),
      });
      const projectTaskIds = allTasks.map(t => t.id);
      const projectLocks = locks.filter(l => projectTaskIds.includes(l.taskId));

      if (projectLocks.length > 0) {
        console.log(`Active File Locks (${projectLocks.length}):`);
        for (const l of projectLocks) {
          console.log(`  ${l.filePath} → task ${l.taskId.slice(0, 8)} (${l.agentType})`);
        }
        console.log('');
      }
    }

    // Token summary across all orchestrator tasks
    console.log('\n--- Token Usage Summary ---\n');
    const allOrchTasks = await db.query.tasks.findMany({
      where: eq(tasks.agentType, 'orchestrator'),
      orderBy: [desc(tasks.createdAt)],
    });

    let totalInput = 0;
    let totalOutput = 0;
    let maxOutputTokens = 0;
    let maxOutputTest = '';

    for (const t of allOrchTasks) {
      const metrics = t.tokenMetrics as any;
      if (metrics?.inputTokens) totalInput += metrics.inputTokens;
      if (metrics?.outputTokens) {
        totalOutput += metrics.outputTokens;
        if (metrics.outputTokens > maxOutputTokens) {
          maxOutputTokens = metrics.outputTokens;
          maxOutputTest = t.name;
        }
      }
    }

    console.log(`Total orchestrator tasks: ${allOrchTasks.length}`);
    console.log(`Total input tokens:  ${totalInput.toLocaleString()}`);
    console.log(`Total output tokens: ${totalOutput.toLocaleString()}`);
    console.log(`Total tokens:        ${(totalInput + totalOutput).toLocaleString()}`);
    console.log(`Biggest output:      ${maxOutputTokens.toLocaleString()} tokens (${maxOutputTest})`);
    console.log('');

  } finally {
    await shutdown();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const arg = process.argv[2] || '';

  if (!arg) {
    console.error('Usage:');
    console.error('  pnpm tsx scripts/test-orchestrator-stress.ts <test>');
    console.error('  pnpm tsx scripts/test-orchestrator-stress.ts verify [testNum]');
    console.error('');
    console.error('Tests:');
    console.error('  6     Concurrent Multi-Project Tasks (enqueues 2 tasks)');
    console.error('  7     Large Decomposition (project management tool)');
    console.error('  8     Contradictory Requirements');
    console.error('  9     Requirement Referencing Existing Work');
    console.error('  10a   Recovery After Failure - Step 1: Create stats task');
    console.error('  10b   Recovery After Failure - Step 2: Manually fail the task');
    console.error('  10c   Recovery After Failure - Step 3: Enqueue retry request');
    console.error('  verify  Show results for all tests');
    process.exit(1);
  }

  if (arg === 'verify') {
    await verifyTest(process.argv[3] || 'all');
    process.exit(0);
  }

  if (arg === '10b') {
    await failStatsTask();
    process.exit(0);
  }

  // Map "10" to "10a" for convenience
  const testKey = arg === '10' ? '10a' : arg;

  await enqueueTest(testKey);
  process.exit(0);
}

main().catch((err) => {
  console.error('[StressTest] Fatal error:', err);
  process.exit(1);
});
