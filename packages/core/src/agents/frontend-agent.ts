/**
 * Frontend Agent
 *
 * A BullMQ worker that processes frontend engineering tasks using Claude API.
 * Loads the SKILL file as system context and generates production-ready React components.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { artifacts, questions, tasks } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { updateTaskStatus, getTask, type TaskJobData } from '../services/task-service';
import { parseAgentOutput, validateParsedFiles } from './utils/output-parser';
import { writeGeneratedFiles } from './utils/file-writer';
import { validateGeneratedFiles } from './utils/file-validator';
import { loadSkillsForTask, type TaskComplexity } from './utils/skill-loader';
import { buildFrontendContextWithProfile, getEmptyFrontendContextResult, type FrontendProfiledContextResult } from './utils/frontend-context-loader';
import type { FrontendContextProfileName } from './utils/frontend-context-profiles';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';

const QUEUE_NAME = 'frontend-tasks';

// ============================================================================
// Token Baseline Logging - Measurement only, no logic changes
// ============================================================================

interface FrontendTokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'frontend';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  codebaseContextTokens: number;
  questionsAsked: number;
  filesGenerated: number;
  layersLoaded: number;
  complexity: TaskComplexity;
  // Frontend context profile metrics
  contextProfile: FrontendContextProfileName;
  componentExamplesLoaded: number;
  hookExamplesLoaded: number;
}

function logTokenBaseline(metrics: FrontendTokenMetrics): void {
  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration - configurable via environment variables
// Haiku max: 8192, Sonnet max: 16000
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '8192', 10);
const TEMPERATURE = 0;

// Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Builds the prompt for Claude.
 */
function buildPrompt(
  taskName: string,
  taskDescription: string,
  context: Record<string, unknown>
): string {
  const parts: string[] = [];

  parts.push('# Task Requirements\n');
  parts.push(`**Task:** ${taskName}\n`);
  parts.push(`**Description:** ${taskDescription}\n`);

  if (context.requirements) {
    parts.push(`\n**Requirements:**\n${context.requirements}\n`);
  }

  if (context.acceptanceCriteria && Array.isArray(context.acceptanceCriteria)) {
    parts.push('\n**Acceptance Criteria:**');
    for (const criterion of context.acceptanceCriteria) {
      parts.push(`- ${criterion}`);
    }
    parts.push('');
  }

  if (context.relatedFiles && Array.isArray(context.relatedFiles)) {
    parts.push('\n**Related Files:**');
    for (const file of context.relatedFiles) {
      parts.push(`- ${file}`);
    }
    parts.push('');
  }

  if (context.previousAttempts && Array.isArray(context.previousAttempts)) {
    parts.push('\n**Previous Attempts (learn from these failures):**');
    for (const attempt of context.previousAttempts) {
      const typedAttempt = attempt as { attemptNumber: number; error: string; timestamp: string };
      parts.push(`- Attempt ${typedAttempt.attemptNumber}: ${typedAttempt.error}`);
    }
    parts.push('');
  }

  parts.push('\n---\n');
  parts.push('Please analyze this task and provide your implementation following the output format specified in your skill definition.');
  parts.push('Remember to output all code files using the <file path="...">content</file> XML format.');

  return parts.join('\n');
}

/**
 * Determines artifact type from file extension (frontend-specific).
 */
function getArtifactType(filePath: string): 'code' | 'test' | 'config' | 'doc' | 'migration' | 'asset' | 'log' {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/tests/')) {
    return 'test';
  }
  if (lowerPath.includes('.stories.') || lowerPath.includes('/stories/')) {
    return 'doc'; // Storybook stories are documentation
  }
  if (lowerPath.endsWith('.md') || lowerPath.includes('/docs/')) {
    return 'doc';
  }
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.yaml') ||
    lowerPath.endsWith('.yml') ||
    lowerPath.endsWith('.env') ||
    lowerPath.endsWith('.toml')
  ) {
    return 'config';
  }
  if (
    lowerPath.endsWith('.png') ||
    lowerPath.endsWith('.jpg') ||
    lowerPath.endsWith('.svg') ||
    lowerPath.endsWith('.ico') ||
    lowerPath.endsWith('.webp')
  ) {
    return 'asset';
  }

  return 'code';
}

/**
 * Process a frontend task.
 */
async function processFrontendTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  summary?: string;
  artifactIds?: string[];
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;

  console.log(`[FrontendAgent] Processing task ${taskId}: ${name}`);

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    // Load SKILL layers based on task complexity
    const { content: skillContent, complexity, layers, tokens: skillTokens } = await loadSkillsForTask('frontend', description);

    console.log(`[FrontendAgent] Task complexity: simple=${complexity.simple}, database=${complexity.database}, newPattern=${complexity.newPattern}`);
    console.log(`[FrontendAgent] Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load codebase context with frontend-specific profile selection
    let codebaseContext: FrontendProfiledContextResult;
    try {
      codebaseContext = await buildFrontendContextWithProfile(description);
    } catch (err) {
      console.warn('[FrontendAgent] Failed to load codebase context, continuing without it:', err);
      codebaseContext = getEmptyFrontendContextResult('simple-component');
    }

    console.log(`[FrontendAgent] Context profile: ${codebaseContext.profile}`);
    console.log(`[FrontendAgent] Components loaded: ${codebaseContext.componentExamplesLoaded}, Hooks: ${codebaseContext.hookExamplesLoaded}`);
    console.log(`[FrontendAgent] Context tokens: ~${codebaseContext.tokens}`);

    // Build prompt with codebase context prepended
    const basePrompt = buildPrompt(name, description, context);
    const userPrompt = codebaseContext.content
      ? `${codebaseContext.content}\n\n${basePrompt}`
      : basePrompt;

    console.log('[FrontendAgent] Calling Claude API...');

    // Call Claude API
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: skillContent,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text response
    const textContent = response.content.find((block) => block.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    console.log('[FrontendAgent] Parsing response...');

    // Parse the response
    const parseResult = parseAgentOutput(responseText);

    // Log token baseline metrics
    logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'frontend',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(basePrompt.length / 4),
      codebaseContextTokens: codebaseContext.tokens,
      questionsAsked: parseResult.hasQuestions ? 1 : 0,
      filesGenerated: parseResult.files.length,
      layersLoaded: layers.length,
      complexity,
      // Frontend context profile metrics
      contextProfile: codebaseContext.profile,
      componentExamplesLoaded: codebaseContext.componentExamplesLoaded,
      hookExamplesLoaded: codebaseContext.hookExamplesLoaded,
    });

    // Handle questions if present
    if (parseResult.hasQuestions && parseResult.questionsContent) {
      console.log('[FrontendAgent] Task has questions, creating question record...');

      // Get task to find project ID
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Create question record
      await db.insert(questions).values({
        projectId: task.projectId,
        taskId,
        question: parseResult.questionsContent,
        context: `Task: ${name}\n\nDescription: ${description}`,
        askedByAgent: 'frontend',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      // Update task status to waiting_human
      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: 'Task requires human input - questions pending',
      });

      return {
        success: false,
        summary: 'Task requires human input - questions pending',
      };
    }

    // Validate parsed files
    const validation = validateParsedFiles(parseResult.files);
    if (!validation.valid) {
      console.warn('[FrontendAgent] File validation warnings:', validation.errors);
    }

    if (parseResult.files.length === 0) {
      console.log('[FrontendAgent] No files generated - requesting clarification from user');

      // Get task to find project ID
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Create clarification question - don't silently complete with no output
      await db.insert(questions).values({
        projectId: task.projectId,
        taskId,
        question: `I wasn't able to generate code for this task. The request may need more details or may not be a frontend engineering task.\n\n**Original request:** ${name}\n\n**What I understood:** ${description}\n\n**Claude's response:**\n${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}\n\n**Please clarify:**\n- What specific React component or UI do you need?\n- What files or components should be created?\n- Or should this task be cancelled?`,
        context: `Task: ${name}\n\nDescription: ${description}`,
        askedByAgent: 'frontend',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      // Update task status to waiting_human - NOT completed
      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: 'Clarification needed - no code output generated',
        outputs: { rawResponse: responseText },
      });

      return {
        success: false,
        summary: 'Clarification needed - no code output generated',
      };
    }

    console.log(`[FrontendAgent] Writing ${parseResult.files.length} files...`);

    // Write files to disk
    const writeResult = await writeGeneratedFiles(taskId, parseResult.files, 'frontend');

    // Validate generated files for syntax errors
    console.log('[FrontendAgent] Validating generated files...');
    const validationResult = await validateGeneratedFiles(writeResult.taskDir, writeResult.files);

    if (!validationResult.valid) {
      console.warn('[FrontendAgent] Syntax warnings:', validationResult.errors);

      // Store warnings on task record for dashboard visibility
      try {
        await db
          .update(tasks)
          .set({ warnings: validationResult.errors })
          .where(eq(tasks.id, taskId));
        console.log('[FrontendAgent] Warnings saved to task record');
      } catch (err) {
        console.error('[FrontendAgent] Failed to save warnings:', err);
      }
    }

    console.log('[FrontendAgent] Creating artifact records...');

    // Create artifact records
    const artifactIds: string[] = [];

    for (const filePath of writeResult.files) {
      const [artifact] = await db
        .insert(artifacts)
        .values({
          projectId,
          taskId,
          type: getArtifactType(filePath),
          name: filePath.split('/').pop() || filePath,
          description: `Generated by frontend agent for task: ${name}`,
          filePath: `generated/tasks/${taskId}/${filePath}`,
          createdByAgent: 'frontend',
          metadata: {
            language: getLanguageFromPath(filePath),
          },
        })
        .returning({ id: artifacts.id });

      artifactIds.push(artifact.id);
    }

    console.log(`[FrontendAgent] Task ${taskId} completed successfully`);

    // Update task status
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary: `Generated ${parseResult.files.length} file(s)`,
      outputs: {
        generatedDir: writeResult.taskDir,
        files: writeResult.files,
        artifactIds,
        warnings: validationResult.valid ? [] : validationResult.errors,
      },
    });

    return {
      success: true,
      summary: `Generated ${parseResult.files.length} file(s)`,
      artifactIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FrontendAgent] Task ${taskId} failed:`, errorMessage);

    // Update task status to failed
    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Determines programming language from file path (frontend-specific).
 */
function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript-react',
    js: 'javascript',
    jsx: 'javascript-react',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    html: 'html',
  };

  return ext ? languageMap[ext] : undefined;
}

/**
 * Create and start the frontend agent worker.
 */
export function createFrontendWorker(): Worker<TaskJobData> {
  console.log(`[FrontendAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processFrontendTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[FrontendAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[FrontendAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[FrontendAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[FrontendAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownFrontendWorker(worker: Worker): Promise<void> {
  console.log('[FrontendAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[FrontendAgent] Shutdown complete');
}
