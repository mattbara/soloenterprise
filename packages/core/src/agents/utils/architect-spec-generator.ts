/**
 * Architect Spec Generator
 *
 * Generates technical specifications for ALL tasks BEFORE they enter the BullMQ queue.
 * Every task gets a spec — foundational tasks (0 deps) receive enhanced prompts
 * emphasizing public API contract definition to prevent downstream divergence.
 *
 * Guardrail #9: Every task gets a spec. Cost is managed via model tiering, NOT by skipping.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { selectContextProfile } from './context-profiles';
import { TaskLogger } from '../../utils/task-logger';
import { getGeneratedTaskDir as getGeneratedTaskDirFn } from '../../utils/generated-dir';
import { summarizeArtifact, shouldSummarize, estimateTokens } from './artifact-summarizer';
import { recordAgentCost } from '../../services/cost-tracking-service';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Anthropic Client (own singleton — cannot share with orchestrator-agent.ts)
// ============================================================================

const MODEL = process.env.ORCHESTRATOR_MODEL || 'claude-opus-4-6';

let architectClient: Anthropic | null = null;

function getArchitectClient(): Anthropic {
  if (!architectClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    architectClient = new Anthropic({
      apiKey,
      timeout: 10 * 60 * 1000,
      maxRetries: 2,
    });
  }
  return architectClient;
}

// ============================================================================
// File System Helpers (same pattern as qa-context-loader.ts)
// ============================================================================

function getGeneratedTaskDir(taskId: string): string {
  return getGeneratedTaskDirFn(taskId);
}

function getAllFilesSync(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllFilesSync(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }
  return files;
}

// ============================================================================
// Architect System Prompt
// ============================================================================

const ARCHITECT_SYSTEM_PROMPT = `You are a Senior Software Architect for SoloEnterprise, an AI agent orchestration system.

Your job is to write a precise technical specification that a junior developer (AI agent) will follow exactly.

## Project Tech Stack (MANDATORY — do NOT deviate)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend Framework | **Hono** | NOT Express, NOT Fastify. All routes use \`new Hono()\`. |
| ORM | **Drizzle ORM** | NOT Knex, NOT Prisma, NOT TypeORM. |
| Database | **PostgreSQL** (Neon) | Serverless Postgres. |
| Validation | **Zod** | All request/response validation uses Zod schemas. |
| Frontend | **Next.js 15** (App Router) | Server Components by default. |
| UI | **shadcn/ui + Tailwind CSS** | |
| Testing | **Vitest** | NOT Jest. |
| Language | **TypeScript** | Strict mode. No .js files. |

When writing implementation steps, ALL code examples and file references MUST use this stack.
- API routes: \`import { Hono } from 'hono'\`, NOT \`import express from 'express'\`
- DB queries: \`import { db } from '@soloenterprise/db'\` with Drizzle query builder, NOT Knex
- Validation: \`import { z } from 'zod'\`, NOT Joi or Yup
- Tests: \`import { describe, it, expect } from 'vitest'\`, NOT Jest globals

## Output Format

Write a spec with these sections:

### Objective
One sentence describing what this task accomplishes.

### Implementation Steps
Numbered list of exact steps. Each step must include:
- The file path to create/modify
- What to add/change (be specific — function names, types, imports)
- Any edge cases to handle

### Data Model
If the task touches the database, list:
- Tables and columns involved
- Query patterns (SELECT/INSERT/UPDATE)
- Relationships and foreign keys

### Dependencies
If this task depends on outputs from other tasks:
- What files/APIs from dependencies to use
- How to import/reference them

### Constraints
- Security considerations
- Performance requirements
- Error handling approach

## Rules
- Be specific: exact file paths, function signatures, type definitions
- Keep it under 2000 words — agents have limited context
- Don't include boilerplate or generic advice
- If dependency artifacts are provided, reference them by file path
- PATH ENFORCEMENT: Examine all dependency artifacts. ALL new files MUST follow the same base path pattern as dependency artifacts. If dependencies write to packages/ui/src/components/, new files go there too — NOT src/components/. NEVER instruct the developer to create a file that already exists in dependency artifacts — specify the exact import path instead. If this task produces types/utilities that overlap with dependency outputs, state: "DO NOT recreate — import from {exact path}".`;

// ============================================================================
// Token Budget
// ============================================================================

const MAX_DEPENDENCY_CHARS = 60_000; // ~15,000 tokens

/**
 * Additional prompt context for foundational/root tasks (0 dependencies).
 * These tasks define contracts that downstream tasks consume — their specs
 * are the MOST important because divergence here cascades everywhere.
 */
const FOUNDATIONAL_TASK_NOTE = `
## Foundational Task — No Upstream Dependencies

This is a **root/foundational task**. Other tasks WILL depend on your output.
You MUST define the public API contract explicitly:

- **List every export** — functions, components, types, constants, and their signatures
- **Specify exact file paths** for each export (e.g., \`src/components/AnimatedCard.tsx\`)
- **Define prop types / function parameters** with TypeScript types
- **State what this module does NOT export** if there is ambiguity risk
- If this task builds a shared module (e.g., animation utilities, data constants), treat the spec as the **binding contract** that all downstream consumers will follow`;

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Generate a technical spec for a task.
 *
 * Every task gets a spec. Foundational tasks (0 deps) get enhanced prompts
 * emphasizing public API contract definition.
 *
 * Returns null only if: task not found, already has spec, or API failure.
 */
export async function generateTechSpec(
  taskId: string
): Promise<{ spec: string; tokens: number } | null> {
  // 1. Load task
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    console.warn(`[ArchitectSpec] Task ${taskId} not found`);
    return null;
  }

  const logger = new TaskLogger(taskId);

  // 2. Skip if spec already exists
  if (task.technicalSpec) {
    logger.log('ArchitectSpec', `Task ${taskId} already has a tech spec, skipping`);
    logger.close();
    return null;
  }

  // 3. Determine profile and dependencies
  const profile = selectContextProfile(task.description, { agentType: task.agentType });
  const deps = (task.dependsOn as string[] | null) ?? [];
  const hasDeps = deps.length > 0;

  logger.log('ArchitectSpec', `Generating spec for task ${taskId} (${task.agentType}, profile=${profile}, deps=${deps.length})`);

  // 4. Load dependency artifacts (with summarization for large files)
  let dependencyContext = '';
  let depCount = 0;
  let summarizedCount = 0;
  let totalOriginalTokens = 0;
  let totalSummaryTokens = 0;
  let hasSummarizedDeps = false;

  // Hoisted so the file-list builder below can reuse without a second DB query
  const depTasks = hasDeps
    ? await db.query.tasks.findMany({ where: inArray(tasks.id, deps) })
    : [];

  if (hasDeps) {

    let totalChars = 0;

    for (const depTask of depTasks) {
      if (depTask.status !== 'completed') continue;

      const taskDir = getGeneratedTaskDir(depTask.id);
      if (!existsSync(taskDir)) continue;

      const files = getAllFilesSync(taskDir);

      for (const filePath of files) {
        // Skip manifest, hidden files
        const fileName = filePath.split('/').pop() ?? '';
        if (fileName === 'manifest.json' || fileName.startsWith('.')) continue;

        if (totalChars >= MAX_DEPENDENCY_CHARS) break;

        try {
          const content = readFileSync(filePath, 'utf-8');
          const relativePath = filePath.replace(taskDir + '/', '');

          let displayContent: string;
          let marker = '';

          if (shouldSummarize(relativePath, content)) {
            const summary = summarizeArtifact(relativePath, content);
            displayContent = summary.summary;
            marker = ' (API Surface Summary)';
            summarizedCount++;
            totalOriginalTokens += summary.originalTokens;
            totalSummaryTokens += summary.summaryTokens;
            hasSummarizedDeps = true;
          } else {
            displayContent = content;
            totalOriginalTokens += estimateTokens(content);
            totalSummaryTokens += estimateTokens(content);
          }

          const block = `\n### Dependency: "${depTask.name}" — ${relativePath}${marker}\n\`\`\`\n${displayContent}\n\`\`\`\n`;

          if (totalChars + block.length > MAX_DEPENDENCY_CHARS) break;

          dependencyContext += block;
          totalChars += block.length;
          depCount++;
        } catch {
          // Skip unreadable files
        }
      }
    }

    if (summarizedCount > 0) {
      const reduction = totalOriginalTokens > 0
        ? Math.round((1 - totalSummaryTokens / totalOriginalTokens) * 100)
        : 0;
      logger.log(
        'ArchitectSpec',
        `Dependency context: ${depCount} artifacts (${summarizedCount} summarized), ` +
        `~${totalOriginalTokens} original tokens → ~${totalSummaryTokens} summary tokens ` +
        `(${reduction}% reduction)`
      );
    }
  }

  // 5. Build user prompt
  const userParts: string[] = [
    `# Task: ${task.name}`,
    `**Agent Type:** ${task.agentType}`,
    `**Description:** ${task.description}`,
  ];

  const ctx = task.context as Record<string, unknown> | null;
  if (ctx?.requirements) {
    userParts.push(`**Requirements:** ${ctx.requirements}`);
  }
  if (ctx?.acceptanceCriteria && Array.isArray(ctx.acceptanceCriteria)) {
    userParts.push(`**Acceptance Criteria:**\n${(ctx.acceptanceCriteria as string[]).map(c => `- ${c}`).join('\n')}`);
  }

  if (dependencyContext) {
    userParts.push(`\n## Dependency Artifacts (${depCount} files)\n${dependencyContext}`);

    // Build flat file list so architect cannot miss existing files
    // Reuses depTasks loaded in step 4 above — no second DB query
    const existingFiles: string[] = [];
    if (hasDeps) {
      for (const depTask of depTasks) {
        if (depTask.status !== 'completed') continue;
        const taskDir = getGeneratedTaskDir(depTask.id);
        if (!existsSync(taskDir)) continue;
        const files = getAllFilesSync(taskDir);
        for (const filePath of files) {
          const fileName = filePath.split('/').pop() ?? '';
          if (fileName === 'manifest.json' || fileName.startsWith('.')) continue;
          existingFiles.push(filePath.replace(taskDir + '/', ''));
        }
      }
    }
    if (existingFiles.length > 0) {
      userParts.push(`\n## EXISTING FILES FROM DEPENDENCIES (DO NOT RECREATE)\n- ${existingFiles.join('\n- ')}`);
    }
  }

  if (!hasDeps) {
    userParts.push(FOUNDATIONAL_TASK_NOTE);
  }

  userParts.push('\nWrite the technical specification for this task.');

  const userPrompt = userParts.join('\n\n');

  // 6. Call Claude API
  try {
    const client = getArchitectClient();

    // Append summary context note when dependencies were summarized
    let systemPrompt = ARCHITECT_SYSTEM_PROMPT;
    if (hasSummarizedDeps) {
      systemPrompt += `

## Dependency Context Note

Some dependency artifacts below are shown as **API surface summaries** (marked with "API Surface").
These show only exported types, function signatures, and component props — not full implementation.

When writing specs that reference these dependencies:
- Use the exported types and interfaces as shown
- Reference function signatures for integration points
- Do NOT assume internal implementation details
- If you need a specific implementation detail that's not in the summary, note it as a spec assumption`;
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const spec = textBlock?.type === 'text' ? textBlock.text : '';

    if (!spec) {
      logger.warn('ArchitectSpec', `Empty response for task ${taskId}`);
      logger.close();
      return null;
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // 7. Save to DB
    await db
      .update(tasks)
      .set({
        technicalSpec: spec,
        techSpecGeneratedAt: new Date(),
        techSpecTokens: totalTokens,
      })
      .where(eq(tasks.id, taskId));

    logger.log('ArchitectSpec', `Generated spec for task ${taskId} (${task.agentType}): ~${totalTokens} tokens, ${depCount} dependency artifacts loaded (${summarizedCount} summarized)`);

    // Log TOKEN_BASELINE
    console.log(
      'TOKEN_BASELINE',
      JSON.stringify({
        type: 'architect-spec',
        taskId,
        timestamp: new Date().toISOString(),
        inputTokens,
        outputTokens,
        totalTokens,
        dependencyArtifacts: depCount,
        summarizedArtifacts: summarizedCount,
        estimatedOriginalTokens: totalOriginalTokens,
        estimatedSummaryTokens: totalSummaryTokens,
        profile,
        agentType: task.agentType,
      })
    );

    // Track cost (previously untracked — Opus calls were invisible)
    await recordAgentCost({
      projectId: task.projectId,
      taskId,
      agentType: 'architect',
      model: MODEL,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
      callSource: 'architect-spec',
    });

    logger.close();
    return { spec, tokens: totalTokens };
  } catch (err) {
    logger.error('ArchitectSpec', `API call failed for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    logger.close();
    return null;
  }
}

// ============================================================================
// Batch Spec Generation
// ============================================================================

const BATCH_SPEC_DELIMITER_START = '---SPEC:';
const BATCH_SPEC_DELIMITER_END = '---END-SPEC---';

/**
 * Parse a batch response into per-task specs using delimiters.
 * Returns null if parsing fails (triggers fallback to individual calls).
 */
function parseBatchResponse(responseText: string, taskIds: string[]): Map<string, string> | null {
  const specs = new Map<string, string>();

  for (const taskId of taskIds) {
    const startMarker = `${BATCH_SPEC_DELIMITER_START}${taskId}---`;
    const startIdx = responseText.indexOf(startMarker);
    if (startIdx === -1) return null;

    const contentStart = startIdx + startMarker.length;
    const endIdx = responseText.indexOf(BATCH_SPEC_DELIMITER_END, contentStart);
    if (endIdx === -1) return null;

    const spec = responseText.slice(contentStart, endIdx).trim();
    if (!spec) return null;

    specs.set(taskId, spec);
  }

  return specs.size === taskIds.length ? specs : null;
}

/**
 * Generate tech specs for multiple tasks in a single API call.
 *
 * Batches sibling tasks (created by orchestrator in one run) to:
 * - Deduplicate shared dependency artifacts across tasks
 * - Reduce Opus API calls from N to 1
 *
 * Falls back to individual generateTechSpec() calls if batch parsing fails.
 */
export async function generateTechSpecBatch(
  taskIds: string[]
): Promise<{ results: Map<string, { spec: string; tokens: number }>; batchUsed: boolean }> {
  const results = new Map<string, { spec: string; tokens: number }>();

  if (taskIds.length === 0) {
    return { results, batchUsed: false };
  }

  // Single task — just use the regular function
  if (taskIds.length === 1) {
    const result = await generateTechSpec(taskIds[0]);
    if (result) {
      results.set(taskIds[0], result);
    }
    return { results, batchUsed: false };
  }

  // Load all tasks
  const allTasks = await db.query.tasks.findMany({
    where: inArray(tasks.id, taskIds),
  });

  // Filter: skip tasks that already have specs
  const tasksNeedingSpecs = allTasks.filter(t => !t.technicalSpec);
  if (tasksNeedingSpecs.length === 0) {
    console.log('[ArchitectSpec] All tasks already have specs, skipping batch');
    return { results, batchUsed: false };
  }

  // If only 1 task needs a spec after filtering, use individual
  if (tasksNeedingSpecs.length === 1) {
    const result = await generateTechSpec(tasksNeedingSpecs[0].id);
    if (result) {
      results.set(tasksNeedingSpecs[0].id, result);
    }
    return { results, batchUsed: false };
  }

  console.log(`[ArchitectSpec] Batch: generating specs for ${tasksNeedingSpecs.length} tasks in one API call`);

  // Collect ALL unique dependency IDs across all tasks
  const allDepIds = new Set<string>();
  for (const task of tasksNeedingSpecs) {
    const deps = (task.dependsOn as string[] | null) ?? [];
    for (const dep of deps) {
      allDepIds.add(dep);
    }
  }

  // Load dependency artifacts ONCE (deduplicated)
  let sharedDependencyContext = '';
  let depArtifactCount = 0;

  if (allDepIds.size > 0) {
    const depTasks = await db.query.tasks.findMany({
      where: inArray(tasks.id, [...allDepIds]),
    });

    let totalChars = 0;

    for (const depTask of depTasks) {
      if (depTask.status !== 'completed') continue;
      const taskDir = getGeneratedTaskDir(depTask.id);
      if (!existsSync(taskDir)) continue;

      const files = getAllFilesSync(taskDir);
      for (const filePath of files) {
        const fileName = filePath.split('/').pop() ?? '';
        if (fileName === 'manifest.json' || fileName.startsWith('.')) continue;
        if (totalChars >= MAX_DEPENDENCY_CHARS) break;

        try {
          const content = readFileSync(filePath, 'utf-8');
          const relativePath = filePath.replace(taskDir + '/', '');

          let displayContent: string;
          let marker = '';

          if (shouldSummarize(relativePath, content)) {
            const summary = summarizeArtifact(relativePath, content);
            displayContent = summary.summary;
            marker = ' (API Surface Summary)';
          } else {
            displayContent = content;
          }

          const block = `\n### Dependency: "${depTask.name}" (${depTask.id}) — ${relativePath}${marker}\n\`\`\`\n${displayContent}\n\`\`\`\n`;

          if (totalChars + block.length > MAX_DEPENDENCY_CHARS) break;

          sharedDependencyContext += block;
          totalChars += block.length;
          depArtifactCount++;
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  // Build batch prompt
  const batchParts: string[] = [
    '# Batch Technical Specification Request',
    `Generate a separate spec for EACH of the ${tasksNeedingSpecs.length} tasks below. Use shared dependencies.`,
  ];

  if (sharedDependencyContext) {
    batchParts.push(`\n## Shared Dependencies (${depArtifactCount} artifacts)\n${sharedDependencyContext}`);
  }

  for (const task of tasksNeedingSpecs) {
    const profile = selectContextProfile(task.description, { agentType: task.agentType });
    const deps = (task.dependsOn as string[] | null) ?? [];

    batchParts.push(`\n## Task: ${task.name} (ID: ${task.id})`);
    batchParts.push(`Agent: ${task.agentType} | Profile: ${profile} | Dependencies: ${deps.length}`);
    batchParts.push(`Description: ${task.description}`);

    const ctx = task.context as Record<string, unknown> | null;
    if (ctx?.requirements) {
      batchParts.push(`Requirements: ${ctx.requirements}`);
    }

    if (!deps.length) {
      batchParts.push(FOUNDATIONAL_TASK_NOTE);
    }
  }

  batchParts.push('\n## Output Format');
  batchParts.push('For EACH task, output the spec between these exact delimiters:');
  batchParts.push('```');
  batchParts.push(`${BATCH_SPEC_DELIMITER_START}<task-id>---`);
  batchParts.push('<spec content>');
  batchParts.push(BATCH_SPEC_DELIMITER_END);
  batchParts.push('```');
  batchParts.push(`\nGenerate specs for ALL ${tasksNeedingSpecs.length} tasks now.`);

  const batchPrompt = batchParts.join('\n');

  try {
    const client = getArchitectClient();

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192, // Larger for batch
      temperature: 0,
      system: [
        {
          type: 'text',
          text: ARCHITECT_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: batchPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // Track cost
    // Use the first task's projectId for cost tracking (all tasks share a project)
    await recordAgentCost({
      projectId: tasksNeedingSpecs[0].projectId,
      taskId: tasksNeedingSpecs[0].id,
      agentType: 'architect',
      model: MODEL,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
      callSource: 'architect-spec-batch',
    });

    console.log(
      'TOKEN_BASELINE',
      JSON.stringify({
        type: 'architect-spec-batch',
        taskIds: tasksNeedingSpecs.map(t => t.id),
        timestamp: new Date().toISOString(),
        inputTokens,
        outputTokens,
        totalTokens,
        taskCount: tasksNeedingSpecs.length,
        sharedDependencyArtifacts: depArtifactCount,
      })
    );

    // Parse batch response
    const specs = parseBatchResponse(responseText, tasksNeedingSpecs.map(t => t.id));

    if (!specs) {
      console.warn('[ArchitectSpec] Batch parsing failed, falling back to individual calls');
      // Fallback: call individual generateTechSpec for each task
      for (const task of tasksNeedingSpecs) {
        const result = await generateTechSpec(task.id);
        if (result) {
          results.set(task.id, result);
        }
      }
      return { results, batchUsed: false };
    }

    // Save each spec to DB
    const tokensPerTask = Math.ceil(totalTokens / tasksNeedingSpecs.length);

    for (const [taskId, spec] of specs) {
      await db
        .update(tasks)
        .set({
          technicalSpec: spec,
          techSpecGeneratedAt: new Date(),
          techSpecTokens: tokensPerTask,
        })
        .where(eq(tasks.id, taskId));

      results.set(taskId, { spec, tokens: tokensPerTask });
    }

    console.log(
      `[ArchitectSpec] Batch complete: ${specs.size} specs generated in 1 API call ` +
      `(~${totalTokens} tokens, ${depArtifactCount} shared deps)`
    );

    return { results, batchUsed: true };
  } catch (err) {
    console.error(`[ArchitectSpec] Batch API call failed: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('[ArchitectSpec] Falling back to individual spec generation');

    // Fallback: individual calls
    for (const task of tasksNeedingSpecs) {
      const result = await generateTechSpec(task.id);
      if (result) {
        results.set(task.id, result);
      }
    }
    return { results, batchUsed: false };
  }
}
