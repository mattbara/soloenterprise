/**
 * Test Orchestrator Agent Script
 *
 * Creates test projects and orchestrator tasks to verify the orchestrator agent pipeline.
 * Run with a test number to execute a specific test:
 *   pnpm tsx scripts/test-orchestrator-agent.ts 1   # Test 1: Simple single-agent task
 *   pnpm tsx scripts/test-orchestrator-agent.ts 2   # Test 2: Multi-agent task
 *   pnpm tsx scripts/test-orchestrator-agent.ts 3   # Test 3: Task with QA
 *   pnpm tsx scripts/test-orchestrator-agent.ts 4   # Test 4: Ambiguous requirement (should ask questions)
 *   pnpm tsx scripts/test-orchestrator-agent.ts 5   # Test 5: Multi-step feature
 */

// Load environment variables BEFORE any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

const TEST_CASES: Record<number, { name: string; description: string; context: Record<string, unknown> }> = {
  1: {
    name: 'Simple Single-Agent Task',
    description: 'Create a health check endpoint at GET /api/health that returns { status: "ok", timestamp: Date.now() }',
    context: {
      projectName: 'Orchestrator Test Project',
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Create a health check endpoint at GET /api/health that returns { status: "ok", timestamp: Date.now() }',
    },
  },
  2: {
    name: 'Multi-Agent Task',
    description: 'Create a user profile page that shows the user\'s name and email. The page should fetch data from GET /api/users/:id',
    context: {
      projectName: 'Orchestrator Test Project',
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Create a user profile page that shows the user\'s name and email. The page should fetch data from GET /api/users/:id',
    },
  },
  3: {
    name: 'Task with QA',
    description: 'Create a POST /api/contacts endpoint that accepts name, email, and message fields. All fields required. Add validation tests.',
    context: {
      projectName: 'Orchestrator Test Project',
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Create a POST /api/contacts endpoint that accepts name, email, and message fields. All fields required. Add validation tests.',
    },
  },
  4: {
    name: 'Ambiguous Requirement (Should Ask Questions)',
    description: 'Add authentication to the app',
    context: {
      projectName: 'Orchestrator Test Project',
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Add authentication to the app',
    },
  },
  5: {
    name: 'Multi-Step Feature',
    description: 'Build a blog system with posts and comments. Posts have title, content, author. Comments belong to posts. Users can create, read, update, delete posts. Anyone can read, only post author can edit/delete. Add a page to list all posts and a page to view a single post with its comments.',
    context: {
      projectName: 'Orchestrator Test Project',
      projectDescription: 'Test project for orchestrator agent baseline tests',
      requirements: 'Build a blog system with posts and comments. Posts have title, content, author. Comments belong to posts. Users can create, read, update, delete posts. Anyone can read, only post author can edit/delete. Add a page to list all posts and a page to view a single post with its comments.',
    },
  },
};

async function main() {
  const testNum = parseInt(process.argv[2] || '0', 10);

  if (!testNum || !TEST_CASES[testNum]) {
    console.error('Usage: pnpm tsx scripts/test-orchestrator-agent.ts <test-number>');
    console.error('Available tests: 1-5');
    for (const [num, tc] of Object.entries(TEST_CASES)) {
      console.error(`  ${num}: ${tc.name}`);
    }
    process.exit(1);
  }

  const testCase = TEST_CASES[testNum];

  // Dynamic imports after env is loaded
  const { db } = await import('@soloenterprise/db');
  const { projects } = await import('@soloenterprise/db/schema');
  const { createTask, shutdown } = await import('@soloenterprise/core/services');
  const { eq } = await import('drizzle-orm');

  const TEST_PROJECT_NAME = 'Orchestrator Test Project';

  console.log(`\n[TestOrchestrator] ===== BASELINE TEST ${testNum}: ${testCase.name} =====\n`);

  try {
    // Check for existing test project or create new one
    let project = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_NAME),
    });

    if (!project) {
      console.log('[TestOrchestrator] Creating test project...');
      const [newProject] = await db
        .insert(projects)
        .values({
          name: TEST_PROJECT_NAME,
          description: 'Test project for orchestrator agent baseline tests',
          status: 'active',
          config: {
            techStack: ['typescript', 'nextjs', 'drizzle', 'tailwind'],
          },
        })
        .returning();
      project = newProject;
      console.log(`[TestOrchestrator] Created project: ${project.id}`);
    } else {
      console.log(`[TestOrchestrator] Using existing project: ${project.id}`);
    }

    // Create orchestrator task
    console.log(`\n[TestOrchestrator] Enqueuing orchestrator task...`);
    console.log(`[TestOrchestrator] Name: ${testCase.name}`);
    console.log(`[TestOrchestrator] Description: ${testCase.description}`);

    const { taskId, jobId } = await createTask(project.id, {
      name: testCase.name,
      description: testCase.description,
      agentType: 'orchestrator',
      priority: 'medium',
      context: testCase.context,
    });

    console.log('\n========================================');
    console.log(`TEST ${testNum} - Orchestrator task enqueued`);
    console.log('========================================');
    console.log(`Project ID: ${project.id}`);
    console.log(`Task ID:    ${taskId}`);
    console.log(`Job ID:     ${jobId}`);
    console.log('========================================');
    console.log('\nNow start the orchestrator worker in another terminal:');
    console.log('  cd packages/core && pnpm worker:orchestrator');
    console.log('\nThe worker will pick up this task and process it.');
    console.log('Watch the worker output for the orchestrator\'s response.');
    console.log('========================================\n');
  } catch (error) {
    console.error('[TestOrchestrator] Error:', error);
    process.exit(1);
  } finally {
    await shutdown();
    process.exit(0);
  }
}

main();
