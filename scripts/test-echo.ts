/**
 * Test Echo Script
 *
 * Creates a test project and echo task to verify the echo agent pipeline.
 */

// Load environment variables BEFORE any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  // Dynamic imports after env is loaded
  const { db } = await import('@soloenterprise/db');
  const { projects } = await import('@soloenterprise/db/schema');
  const { createTask, shutdown } = await import('@soloenterprise/core/services');
  const { eq } = await import('drizzle-orm');

  const TEST_PROJECT_NAME = 'Echo Test Project';

  console.log('[TestEcho] Starting echo test...\n');

  try {
    // Check for existing test project or create new one
    let project = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_NAME),
    });

    if (!project) {
      console.log('[TestEcho] Creating test project...');
      const [newProject] = await db
        .insert(projects)
        .values({
          name: TEST_PROJECT_NAME,
          description: 'Test project for echo agent',
          status: 'active',
        })
        .returning();
      project = newProject;
      console.log(`[TestEcho] Created project: ${project.id}`);
    } else {
      console.log(`[TestEcho] Using existing project: ${project.id}`);
    }

    // Create echo task
    console.log('\n[TestEcho] Creating echo task...');
    const { taskId, jobId } = await createTask(project.id, {
      name: 'Echo Test Task',
      description: 'Test task for echo agent',
      agentType: 'echo',
      priority: 'medium',
      context: {
        input: 'hello world',
      },
    });

    console.log('\n========================================');
    console.log('Echo task created successfully!');
    console.log('========================================');
    console.log(`Project ID: ${project.id}`);
    console.log(`Task ID:    ${taskId}`);
    console.log(`Job ID:     ${jobId}`);
    console.log('========================================');
    console.log('\nTo process this task, run the worker:');
    console.log('  pnpm worker:echo');
    console.log('========================================\n');
  } catch (error) {
    console.error('[TestEcho] Error:', error);
    process.exit(1);
  } finally {
    await shutdown();
    process.exit(0);
  }
}

main();
