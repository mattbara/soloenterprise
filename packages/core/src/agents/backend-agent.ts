/**
 * Backend Agent
 *
 * A BullMQ worker that processes backend engineering tasks using Claude API.
 * Loads the SKILL file as system context and generates production-ready code.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { artifacts, questions, tasks } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { updateTaskStatus, getTask, claimTaskForProcessing, type TaskJobData } from '../services/task-service';
import { parseAgentOutput, validateParsedFiles } from './utils/output-parser';
import { writeGeneratedFiles } from './utils/file-writer';
import { validateGeneratedFiles } from './utils/file-validator';
import { loadSkillsForTask, type TaskComplexity } from './utils/skill-loader';
import { processWithSyntaxRecovery, type SyntaxError } from './utils/syntax-recovery';
import { buildContextWithProfile, getEmptyContextResult, type ProfiledContextResult } from './utils/context-loader';
import type { ContextProfileName } from './utils/context-profiles';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';

const QUEUE_NAME = 'backend-tasks';

// ============================================================================
// Token Baseline Logging - Measurement only, no logic changes
// ============================================================================

interface TokenMetrics {
  taskId: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  codebaseContextTokens: number;
  questionsAsked: number;
  filesGenerated: number;
  layersLoaded: number;
  complexity: TaskComplexity;
  // Context profile metrics
  contextProfile: ContextProfileName;
  schemaIncluded: boolean;
  tablesLoaded: number;
  routeExamplesLoaded: number;
  serviceExamplesLoaded: number;
  // Cache metrics
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHitPercent: number;
  estimatedSavingsPercent: number;
  // Architect spec metrics
  techSpecTokens: number;
  hasTechSpec: boolean;
}

async function logTokenBaseline(metrics: TokenMetrics): Promise<void> {
  // Save metrics to database for dashboard
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[BackendAgent] Failed to save token metrics:', err);
  }

  // Keep console log for debugging
  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration - configurable via environment variables
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '16384', 10);
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

  // Include answered questions from previous human interaction
  if (context.answeredQuestions && Array.isArray(context.answeredQuestions)) {
    parts.push('\n**Previously Asked Questions (Human has answered these):**');
    for (const qa of context.answeredQuestions) {
      const typedQA = qa as { question: string; answer: string };
      parts.push(`\nQ: ${typedQA.question}`);
      parts.push(`A: ${typedQA.answer}`);
    }
    parts.push('\n');
    parts.push('**IMPORTANT:** Use the answers above to guide your implementation. Do NOT ask these questions again.');
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
  noop?: boolean;
  summary?: string;
  artifactIds?: string[];
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;
  const logger = new TaskLogger(taskId);

  // Claim guard: atomic queued → running transition
  const claim = await claimTaskForProcessing(taskId);
  if (!claim.claimed) {
    logger.log('BackendAgent', `Task ${taskId} already claimed (status: ${claim.currentStatus}), skipping`);
    return { success: false, noop: true, summary: `Task already claimed by another worker (status: ${claim.currentStatus})` };
  }

  logger.log('BackendAgent', `Processing task ${taskId}: ${name}`);

  try {
    // Load SKILL layers based on task complexity
    const { content: skillContent, complexity, layers, tokens: skillTokens } = await loadSkillsForTask('backend', description);

    logger.log('BackendAgent', `Task complexity: simple=${complexity.simple}, database=${complexity.database}, newPattern=${complexity.newPattern}`);
    logger.log('BackendAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load codebase context with profile-based selection
    let codebaseContext: ProfiledContextResult;
    try {
      codebaseContext = await buildContextWithProfile(description);
    } catch (err) {
      logger.warn('BackendAgent', 'Failed to load codebase context, continuing without it: ' + err);
      codebaseContext = getEmptyContextResult('simple-endpoint');
    }

    logger.log('BackendAgent', `Context profile: ${codebaseContext.profile}`);
    logger.log('BackendAgent', `Schema included: ${codebaseContext.schemaIncluded}, Tables: ${codebaseContext.tablesLoaded}`);
    logger.log('BackendAgent', `Context tokens: ~${codebaseContext.tokens}`);

    // Build user prompt (task-specific, not cached)
    // Note: codebase context is now in the cached system prompt
    // Load tech spec from architect layer (if generated)
    const taskRecord = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { technicalSpec: true, techSpecTokens: true },
    });

    let techSpecBlock = '';
    if (taskRecord?.technicalSpec) {
      techSpecBlock = `\n\n## TECHNICAL SPECIFICATION (from Architect)\n\nFollow this spec precisely. It was written by a senior architect who reviewed the full project context.\nIf the spec lists existing dependency files, import from them directly. Do NOT create new files that duplicate existing dependency outputs.\n\n${taskRecord.technicalSpec}\n`;
      logger.log('BackendAgent', `Tech spec available: ~${taskRecord.technicalSpec.length} chars`);
    } else {
      logger.log('BackendAgent', 'No tech spec for this task');
    }

    const userPrompt = buildPrompt(name, description, context) + techSpecBlock;

    logger.log('BackendAgent', 'Calling Claude API...');

    // Build cached system prompt for cost optimization
    // SKILL files are cached (static across tasks, ~1800-2100 tokens)
    // Codebase context is NOT cached (varies per task)
    const cachedSystem = buildCachedSystemPrompt(skillContent, codebaseContext.content);

    // Call Claude API with cached system prompt
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: cachedSystem,
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

    logger.log('BackendAgent', 'Parsing response...');
    logger.log('BackendAgent', 'Response text length: ' + responseText.length);
    logger.log('BackendAgent', 'First 500 chars: ' + responseText.substring(0, 500));
    logger.log('BackendAgent', 'Last 500 chars: ' + responseText.substring(Math.max(0, responseText.length - 500)));

    // Parse the response
    const parseResult = parseAgentOutput(responseText);

    logger.log('BackendAgent', 'Parse result: ' + JSON.stringify({
      filesCount: parseResult.files.length,
      hasQuestions: parseResult.hasQuestions,
      filePaths: parseResult.files.map(f => f.path),
    }));

    // Extract cache metrics from API response
    const cacheMetrics = extractCacheMetrics(response.usage);
    logCacheMetrics('BackendAgent', cacheMetrics);

    // Log token baseline metrics and save to database
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(userPrompt.length / 4),
      codebaseContextTokens: codebaseContext.tokens,
      questionsAsked: parseResult.hasQuestions ? 1 : 0,
      filesGenerated: parseResult.files.length,
      layersLoaded: layers.length,
      complexity,
      // Context profile metrics
      contextProfile: codebaseContext.profile,
      schemaIncluded: codebaseContext.schemaIncluded,
      tablesLoaded: codebaseContext.tablesLoaded,
      routeExamplesLoaded: codebaseContext.routeExamplesLoaded,
      serviceExamplesLoaded: codebaseContext.serviceExamplesLoaded,
      // Cache metrics
      cacheCreationInputTokens: cacheMetrics.cacheCreationInputTokens,
      cacheReadInputTokens: cacheMetrics.cacheReadInputTokens,
      cacheHitPercent: cacheMetrics.cacheHitPercent,
      estimatedSavingsPercent: cacheMetrics.estimatedSavingsPercent,
      // Architect spec metrics
      techSpecTokens: taskRecord?.techSpecTokens ?? 0,
      hasTechSpec: !!taskRecord?.technicalSpec,
    });

    // Record cost to cost_tracking table
    await recordAgentCost({
      projectId,
      taskId,
      agentType: 'backend',
      model: MODEL,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Handle questions — only block pipeline if agent produced NO files
    if (parseResult.hasQuestions && parseResult.questionsContent) {
      if (parseResult.files.length === 0) {
        // No files = real blocker, agent couldn't proceed
        logger.log('BackendAgent', 'Task has questions and no files - blocking for human input...');

        const task = await getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }

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

        await updateTaskStatus(taskId, 'waiting_human', {
          success: false,
          summary: 'Task requires human input - questions pending',
        });

        return {
          success: false,
          summary: 'Task requires human input - questions pending',
        };
      } else {
        // Files generated = agent made its decisions. Discard phantom questions.
        const questionSnippets = parseResult.questionsContent
          .split('\n')
          .filter(l => l.trim())
          .map(q => q.substring(0, 80) + (q.length > 80 ? '...' : ''))
          .join('; ');
        logger.log('BackendAgent',
          `Agent generated ${parseResult.files.length} files alongside question(s). ` +
          `Discarding questions — agent made its decisions by producing output. ` +
          `Questions were: ${questionSnippets}`
        );
        // Do NOT create DB records — continue to file processing below
      }
    }

    // Validate parsed files
    const validation = validateParsedFiles(parseResult.files);
    if (!validation.valid) {
      logger.warn('BackendAgent', 'File validation warnings: ' + JSON.stringify(validation.errors));
    }

    if (parseResult.files.length === 0) {
      logger.log('BackendAgent', 'No files generated - requesting clarification from user');

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

    logger.log('BackendAgent', `Validating ${parseResult.files.length} files with syntax recovery...`);

    // Create validation function for recovery loop
    const validateFiles = async (files: typeof parseResult.files): Promise<SyntaxError[]> => {
      const tempWriteResult = await writeGeneratedFiles(taskId, files, 'backend');
      const validationResult = await validateGeneratedFiles(tempWriteResult.taskDir, tempWriteResult.files);
      return validationResult.errors.map(e => ({
        file: e.file,
        line: e.line,
        message: e.message,
      }));
    };

    // Create fresh generation function for full retries
    const generateFresh = async (): Promise<typeof parseResult.files> => {
      logger.log('BackendAgent', 'Generating fresh response (full retry)...');
      const retryResponse = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: cachedSystem,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const retryText = retryResponse.content.find(c => c.type === 'text');
      const retryResponseText = retryText?.type === 'text' ? retryText.text : '';
      const retryParsed = parseAgentOutput(retryResponseText);
      logger.log('BackendAgent', `Fresh generation produced ${retryParsed.files.length} files`);
      return retryParsed.files;
    };

    // Use recovery loop for syntax errors
    const recoveryResult = await processWithSyntaxRecovery(
      client,
      'BackendAgent',
      parseResult.files,
      validateFiles,
      generateFresh
    );

    logger.log('BackendAgent', `Recovery complete: success=${recoveryResult.success}, fixLoops=${recoveryResult.attempts.fixLoops}, fullRetries=${recoveryResult.attempts.fullRetries}`);

    if (!recoveryResult.success) {
      const errorSummary = recoveryResult.errors
        ?.slice(0, 3)
        .map(e => `${e.file}:${e.line ?? '?'} - ${e.message}`)
        .join('; ') ?? 'Unknown syntax errors';

      const existingContext = (context as Record<string, unknown>) ?? {};
      try {
        await db
          .update(tasks)
          .set({
            warnings: recoveryResult.errors,
            context: {
              ...existingContext,
              syntaxRecoveryAttempts: recoveryResult.attempts,
              finalSyntaxErrors: recoveryResult.errors,
            },
          })
          .where(eq(tasks.id, taskId));
      } catch (err) {
        logger.error('BackendAgent', 'Failed to save recovery context: ' + err);
      }

      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: `Syntax errors after ${recoveryResult.attempts.fixLoops} fix attempts: ${errorSummary}`,
        outputs: {
          errors: recoveryResult.errors,
          recoveryAttempts: recoveryResult.attempts,
        },
      });

      return {
        success: false,
        error: `Generated code has syntax errors after recovery attempts`,
      };
    }

    // Write final validated files
    logger.log('BackendAgent', `Writing ${recoveryResult.files.length} validated files...`);
    const writeResult = await writeGeneratedFiles(taskId, recoveryResult.files, 'backend');

    // Skip bracket check — files already passed TS compiler validation in recovery loop.
    // The regex bracket counter produces false positives on valid code.
    const finalValidation = await validateGeneratedFiles(writeResult.taskDir, writeResult.files, { skipBracketCheck: true });
    if (!finalValidation.valid) {
      logger.warn('BackendAgent', 'Post-recovery warnings (typos/non-syntax): ' + JSON.stringify(finalValidation.errors));
      try {
        await db.update(tasks).set({ warnings: finalValidation.errors }).where(eq(tasks.id, taskId));
      } catch (err) {
        logger.error('BackendAgent', 'Failed to save warnings: ' + err);
      }
    }

    logger.log('BackendAgent', 'Creating artifact records...');

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

    logger.log('BackendAgent', `Task ${taskId} completed successfully`);

    // Update task status
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary: `Generated ${recoveryResult.files.length} file(s)`,
      outputs: {
        generatedDir: writeResult.taskDir,
        files: writeResult.files,
        artifactIds,
        warnings: finalValidation.valid ? [] : finalValidation.errors,
      },
    });

    return {
      success: true,
      summary: `Generated ${recoveryResult.files.length} file(s)`,
      artifactIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('BackendAgent', `Task ${taskId} failed: ${errorMessage}`);

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
  console.log('[BackendAgent] Shutdown complete');
}
