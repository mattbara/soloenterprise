/**
 * Backend Agent
 *
 * A BullMQ worker that processes backend engineering tasks using Claude API.
 * Loads the SKILL file as system context and generates production-ready code.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { db } from '@soloenterprise/db';
import { artifacts, questions } from '@soloenterprise/db/schema';
import { updateTaskStatus, getTask, type TaskJobData } from '../services/task-service';
import { parseAgentOutput, validateParsedFiles } from './utils/output-parser';
import { writeGeneratedFiles } from './utils/file-writer';
import { validateGeneratedFiles } from './utils/file-validator';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';

const QUEUE_NAME = 'backend-tasks';

// Claude API configuration - configurable via environment variables
// Haiku max: 8192, Sonnet max: 16000
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '8192', 10);
const TEMPERATURE = 0;

// Get directory of this file for locating SKILL file
const __dirname = dirname(fileURLToPath(import.meta.url));

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

// Cache for SKILL file content
let skillFileContent: string | null = null;

/**
 * Loads common + backend engineer SKILL file content.
 */
async function loadSkillFile(): Promise<string> {
  if (skillFileContent) {
    return skillFileContent;
  }

  // Paths from packages/core/src/agents -> skills/
  const skillsDir = resolve(__dirname, '../../../../skills');
  const commonPath = resolve(skillsDir, 'SKILL-common.md');
  const agentPath = resolve(skillsDir, 'SKILL-backend-engineer.md');

  try {
    const [commonSkill, agentSkill] = await Promise.all([
      readFile(commonPath, 'utf-8'),
      readFile(agentPath, 'utf-8'),
    ]);
    
    skillFileContent = `${commonSkill}\n\n---\n\n${agentSkill}`;
    console.log('[BackendAgent] Loaded SKILL files successfully');
    return skillFileContent;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load SKILL files: ${message}`);
  }
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
 * Determines artifact type from file extension.
 */
function getArtifactType(filePath: string): 'code' | 'test' | 'config' | 'doc' | 'migration' | 'asset' | 'log' {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/tests/')) {
    return 'test';
  }
  if (lowerPath.endsWith('.md') || lowerPath.includes('/docs/')) {
    return 'doc';
  }
  if (lowerPath.includes('/migrations/') || lowerPath.includes('.migration.')) {
    return 'migration';
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
    lowerPath.endsWith('.ico')
  ) {
    return 'asset';
  }

  return 'code';
}

/**
 * Process a backend task.
 */
async function processBackendTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  summary?: string;
  artifactIds?: string[];
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;

  console.log(`[BackendAgent] Processing task ${taskId}: ${name}`);

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    // Load SKILL file
    const skillContent = await loadSkillFile();

    // Build prompt
    const userPrompt = buildPrompt(name, description, context);

    console.log('[BackendAgent] Calling Claude API...');

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

    console.log('[BackendAgent] Parsing response...');

    // Parse the response
    const parseResult = parseAgentOutput(responseText);

    // Handle questions if present
    if (parseResult.hasQuestions && parseResult.questionsContent) {
      console.log('[BackendAgent] Task has questions, creating question record...');

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
        askedByAgent: 'backend',
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
      console.warn('[BackendAgent] File validation warnings:', validation.errors);
    }

    if (parseResult.files.length === 0) {
      console.log('[BackendAgent] No files generated - requesting clarification from user');

      // Get task to find project ID
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Create clarification question - don't silently complete with no output
      await db.insert(questions).values({
        projectId: task.projectId,
        taskId,
        question: `I wasn't able to generate code for this task. The request may need more details or may not be a backend engineering task.\n\n**Original request:** ${name}\n\n**What I understood:** ${description}\n\n**Claude's response:**\n${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}\n\n**Please clarify:**\n- What specific backend functionality do you need?\n- What files or APIs should be created?\n- Or should this task be cancelled?`,
        context: `Task: ${name}\n\nDescription: ${description}`,
        askedByAgent: 'backend',
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

    console.log(`[BackendAgent] Writing ${parseResult.files.length} files...`);

    // Write files to disk
    const writeResult = await writeGeneratedFiles(taskId, parseResult.files, 'backend');

    // Validate generated files for syntax errors
    console.log('[BackendAgent] Validating generated files...');
    const validationResult = await validateGeneratedFiles(writeResult.taskDir, writeResult.files);

    if (!validationResult.valid) {
      console.warn('[BackendAgent] Syntax validation errors:', validationResult.errors);

      // Create question for human with syntax errors
      const task = await getTask(taskId);
      if (task) {
        const errorList = validationResult.errors
          .map(e => `- ${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`)
          .join('\n');

        await db.insert(questions).values({
          projectId: task.projectId,
          taskId,
          question: `Generated code has syntax errors:\n\n${errorList}\n\nFiles were generated but may not compile. Please review and fix, or request regeneration.`,
          context: `Task: ${name}\n\nDescription: ${description}`,
          askedByAgent: 'backend',
          status: 'pending',
          priority: 'important',
          isBlocking: false, // Non-blocking - files exist but have issues
        });
      }
    }

    console.log('[BackendAgent] Creating artifact records...');

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
          description: `Generated by backend agent for task: ${name}`,
          filePath: `generated/tasks/${taskId}/${filePath}`,
          createdByAgent: 'backend',
          metadata: {
            language: getLanguageFromPath(filePath),
          },
        })
        .returning({ id: artifacts.id });

      artifactIds.push(artifact.id);
    }

    console.log(`[BackendAgent] Task ${taskId} completed successfully`);

    // Build summary with validation info
    const validationWarnings = validationResult.errors.length;
    const summary = validationWarnings > 0
      ? `Generated ${parseResult.files.length} file(s) with ${validationWarnings} validation warning(s)`
      : `Generated ${parseResult.files.length} file(s)`;

    // Update task status
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary,
      outputs: {
        generatedDir: writeResult.taskDir,
        files: writeResult.files,
        artifactIds,
        validationErrors: validationResult.errors.length > 0 ? validationResult.errors : undefined,
      },
    });

    return {
      success: true,
      summary,
      artifactIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BackendAgent] Task ${taskId} failed:`, errorMessage);

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
 * Determines programming language from file path.
 */
function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
  };

  return ext ? languageMap[ext] : undefined;
}

/**
 * Create and start the backend agent worker.
 */
export function createBackendWorker(): Worker<TaskJobData> {
  console.log(`[BackendAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processBackendTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[BackendAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[BackendAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[BackendAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[BackendAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownBackendWorker(worker: Worker): Promise<void> {
  console.log('[BackendAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();

  // Clear cached SKILL content
  skillFileContent = null;

  console.log('[BackendAgent] Shutdown complete');
}
