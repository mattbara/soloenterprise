/**
 * Seed: System Test Sandbox Project
 *
 * Creates a permanent project with a fully permissive scope for integration testing.
 * Idempotent — skips insertion if the project already exists.
 *
 * Usage: pnpm --filter @soloenterprise/db seed:test-project
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from monorepo root (2 levels up from packages/db/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env') });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../schema';
import {
  SYSTEM_TEST_PROJECT_ID,
  SYSTEM_TEST_BRIEF_ID,
  SYSTEM_TEST_SCOPE_ID,
} from '../constants';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(databaseUrl);
const db = drizzle(sql, { schema });

const SCOPE_DATA = {
  projectName: 'System Test Sandbox',
  overview: 'Integration testing project. All agent types enabled, all task types and domains permitted.',
  agents: {
    orchestrator: true,
    backend: true,
    frontend: true,
    qa: true,
    devops: true,
    feedback: true,
    scoper: true,
    'client-reporter': true,
  },
  features: [
    'All endpoints permitted',
    'All UI patterns permitted',
    'All database operations permitted',
    'All task types permitted',
    'No domain restrictions',
  ],
  techStack: ['Next.js', 'Hono', 'Drizzle', 'PostgreSQL', 'TypeScript', 'Tailwind CSS', 'shadcn/ui', 'Vitest', 'Zod'],
  restrictions: 'none',
  domainRestrictions: 'none',
};

const CLIENT_DOCUMENT = `# System Test Sandbox

This is a system test sandbox. All endpoints, UI patterns, database operations, and task types are in scope. No domain restrictions apply. All agents are available.

## Scope
- Backend: Any API route, middleware, service, database migration
- Frontend: Any page, component, layout, hook, utility
- QA: Any test file, test utility, coverage configuration
- DevOps: Any CI/CD pipeline, deployment config, infrastructure
- Orchestrator: Full decomposition and coordination authority

## Acceptance
All tasks are accepted. No scope validation failures should occur for any task submitted to this project.`;

async function seed() {
  console.log('Seeding System Test Sandbox project...');

  // Check if project already exists
  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.id, SYSTEM_TEST_PROJECT_ID),
  });

  if (existing) {
    console.log(`Project "${existing.name}" already exists (${SYSTEM_TEST_PROJECT_ID}). Skipping.`);
    return;
  }

  // 1. Create brief (required FK for projectScopes.briefId)
  await db.insert(schema.projectBriefs).values({
    id: SYSTEM_TEST_BRIEF_ID,
    title: 'System Test Sandbox Brief',
    rawContent: 'Permanent integration testing project. All agents and task types permitted.',
    status: 'approved',
  });
  console.log('  Created project brief');

  // 2. Create project (without scopeId initially — we'll link after scope exists)
  await db.insert(schema.projects).values({
    id: SYSTEM_TEST_PROJECT_ID,
    name: 'System Test Sandbox',
    description: 'Integration testing project. All agent types enabled, all task types and domains permitted.',
    status: 'active',
    config: {
      techStack: ['Next.js', 'Hono', 'Drizzle', 'PostgreSQL', 'TypeScript', 'Tailwind CSS', 'shadcn/ui', 'Vitest', 'Zod'],
    },
  });
  console.log('  Created project');

  // 3. Create permissive scope
  await db.insert(schema.projectScopes).values({
    id: SYSTEM_TEST_SCOPE_ID,
    briefId: SYSTEM_TEST_BRIEF_ID,
    projectId: SYSTEM_TEST_PROJECT_ID,
    scopeData: SCOPE_DATA,
    clientDocument: CLIENT_DOCUMENT,
    estimatedTasks: 999,
    estimatedDuration: 'ongoing',
    riskLevel: 'low',
    status: 'approved',
    approvedBy: 'system',
    approvedAt: new Date(),
  });
  console.log('  Created project scope');

  // 4. Link scope back to project
  await db.update(schema.projects)
    .set({ scopeId: SYSTEM_TEST_SCOPE_ID })
    .where(eq(schema.projects.id, SYSTEM_TEST_PROJECT_ID));
  console.log('  Linked scope to project');

  console.log(`\nDone. System Test Sandbox project created: ${SYSTEM_TEST_PROJECT_ID}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
