/**
 * Architect Spec Generator
 *
 * Generates technical specifications for complex tasks BEFORE they enter the BullMQ queue.
 * Uses Opus to produce precise specs that junior agents (Haiku/Sonnet) follow.
 *
 * Guardrail #9: Tasks with `database-task` or `full-feature` profiles MUST have a tech spec.
 * Tasks with dependencies ALWAYS get a tech spec regardless of profile.
 * Tasks with `simple-endpoint` or `bug-fix` profiles and no dependencies skip this step.
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
import { summarizeArtifact, shouldSummarize, estimateTokens } from './artifact-summarizer';

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
  return resolve(__dirname, '../../../generated/tasks', taskId);
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

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Generate a technical spec for a task, if needed.
 *
 * Returns null if:
 * - Task already has a spec
 * - Task profile is simple-endpoint/bug-fix AND has no dependencies
 *
 * Returns { spec, tokens } on success.
 * Returns null on API failure (graceful degradation — task proceeds without spec).
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
    return null;
  }

  // 3. Determine if spec is needed
  const profile = selectContextProfile(task.description, { agentType: task.agentType });
  const deps = (task.dependsOn as string[] | null) ?? [];
  const hasDeps = deps.length > 0;

  const needsSpec =
    profile === 'database-task' ||
    profile === 'full-feature' ||
    hasDeps;

  if (!needsSpec) {
    logger.log('ArchitectSpec', `Skipping spec for task ${taskId} (profile=${profile}, deps=${deps.length})`);
    return null;
  }

  logger.log('ArchitectSpec', `Generating spec for task ${taskId} (${task.agentType}, profile=${profile}, deps=${deps.length})`);

  // 4. Load dependency artifacts (with summarization for large files)
  let dependencyContext = '';
  let depCount = 0;
  let summarizedCount = 0;
  let totalOriginalTokens = 0;
  let totalSummaryTokens = 0;
  let hasSummarizedDeps = false;

  if (hasDeps) {
    const depTasks = await db.query.tasks.findMany({
      where: inArray(tasks.id, deps),
    });

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
    const existingFiles: string[] = [];
    if (hasDeps) {
      const depTasksForFiles = await db.query.tasks.findMany({
        where: inArray(tasks.id, deps),
      });
      for (const depTask of depTasksForFiles) {
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

    return { spec, tokens: totalTokens };
  } catch (err) {
    logger.error('ArchitectSpec', `API call failed for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
