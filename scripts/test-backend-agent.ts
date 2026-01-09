/**
 * Test Backend Agent Script
 *
 * Creates a test project and backend task to verify the backend agent pipeline.
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

  const TEST_PROJECT_NAME = 'Backend Agent Test Project';

  console.log('[TestBackend] Starting backend agent test...\n');

  try {
    // Check for existing test project or create new one
    let project = await db.query.projects.findFirst({
      where: eq(projects.name, TEST_PROJECT_NAME),
    });

    if (!project) {
      console.log('[TestBackend] Creating test project...');
      const [newProject] = await db
        .insert(projects)
        .values({
          name: TEST_PROJECT_NAME,
          description: 'Test project for backend agent',
          status: 'active',
          config: {
            techStack: ['typescript', 'nodejs', 'drizzle'],
          },
        })
        .returning();
      project = newProject;
      console.log(`[TestBackend] Created project: ${project.id}`);
    } else {
      console.log(`[TestBackend] Using existing project: ${project.id}`);
    }

    // Create backend task with sample requirements
    console.log('\n[TestBackend] Creating backend task...');
    const { taskId, jobId } = await createTask(project.id, {
      name: 'Create Health Check Endpoint',
      description: 'Create a health check endpoint for the API',
      agentType: 'backend',
      priority: 'medium',
      context: {
        requirements: `Create a health check endpoint at GET /api/health that returns:
{
  "status": "ok",
  "timestamp": "<ISO timestamp>",
  "version": "1.0.0",
  "uptime": "<process uptime in seconds>"
}

The endpoint should:
1. Return HTTP 200 for healthy status
2. Include proper TypeScript types
3. Use Hono framework (already in project)
4. Include basic error handling
5. Be production-ready code`,
        acceptanceCriteria: [
          'Endpoint returns 200 status code',
          'Response includes all required fields',
          'TypeScript types are properly defined',
          'Error handling is implemented',
        ],
        relatedFiles: ['src/app/api/route.ts'],
      },
    });

    console.log('\n========================================');
    console.log('Backend task created successfully!');
    console.log('========================================');
    console.log(`Project ID: ${project.id}`);
    console.log(`Task ID:    ${taskId}`);
    console.log(`Job ID:     ${jobId}`);
    console.log('========================================');
    console.log('\nTo process this task, run the worker:');
    console.log('  pnpm worker:backend');
    console.log('\nOr run all workers:');
    console.log('  pnpm worker');
    console.log('========================================\n');
    console.log('After processing, check generated files at:');
    console.log(`  generated/tasks/${taskId}/`);
    console.log('========================================\n');
  } catch (error) {
    console.error('[TestBackend] Error:', error);
    process.exit(1);
  } finally {
    await shutdown();
    process.exit(0);
  }
}

main();
