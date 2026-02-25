/**
 * QA Agent
 *
 * A BullMQ worker that processes QA testing tasks using Claude API.
 * Loads the SKILL file as system context and generates test files.
 *
 * NOTE: This agent GENERATES tests, it does NOT run them. CI handles test execution.
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
import { processWithSyntaxRecovery, type SyntaxError, type CostTrackingCallback } from './utils/syntax-recovery';
import { buildQAContext, getEmptyQAContextResult, type QAContextResult } from './utils/qa-context-loader';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';
import { generateScaffold, type ScaffoldResult } from '../scaffolder/index';

const QUEUE_NAME = 'qa-tasks';

// ============================================================================
// Token Baseline Logging - Measurement only, no logic changes
// ============================================================================

interface QATokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'qa';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  codebaseContextTokens: number;
  questionsAsked: number;
  filesGenerated: number;
  layersLoaded: number;
  complexity: TaskComplexity;
  // QA context metrics
  sourceFilesLoaded: number;
  hasExistingTests: boolean;
  hasSchema: boolean;
  // Cache metrics
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHitPercent: number;
  estimatedSavingsPercent: number;
  // Architect spec metrics
  techSpecTokens: number;
  hasTechSpec: boolean;
}

async function logTokenBaseline(metrics: QATokenMetrics): Promise<void> {
  // Save metrics to database for dashboard
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[QAAgent] Failed to save token metrics:', err);
  }

  // Keep console log for debugging
  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration - QA uses Sonnet for higher quality test generation
const MODEL = 'claude-sonnet-4-5-20250929';
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

  // QA-specific: source files to test
  if (context.sourceFiles && Array.isArray(context.sourceFiles)) {
    parts.push('\n**Source Files to Test:**');
    for (const file of context.sourceFiles) {
      parts.push(`- ${file}`);
    }
    parts.push('');
  }

  // QA-specific: test type
  if (context.testType) {
    parts.push(`\n**Test Type:** ${context.testType}\n`);
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
  parts.push('Please analyze the source files and generate comprehensive tests following the output format specified in your skill definition.');
  parts.push('Remember to output all test files using the <file path="...">content</file> XML format.');
  parts.push('\n**Important:** Focus on Vitest + React Testing Library. Do NOT generate E2E or Playwright tests.');

  return parts.join('\n');
}

/**
 * Determines artifact type from file extension (QA-specific - all files are tests).
 */
function getArtifactType(filePath: string): 'code' | 'test' | 'config' | 'doc' | 'migration' | 'asset' | 'log' {
  const lowerPath = filePath.toLowerCase();

  // QA agent primarily generates tests
  if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/tests/') || lowerPath.includes('/__tests__/')) {
    return 'test';
  }
  if (lowerPath.endsWith('.md') || lowerPath.includes('/docs/')) {
    return 'doc';
  }
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.yaml') ||
    lowerPath.endsWith('.yml')
  ) {
    return 'config';
  }

  // Default to test for QA agent
  return 'test';
}

/**
 * Process a QA task.
 */
async function processQATask(job: Job<TaskJobData>): Promise<{
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
    logger.log('QAAgent', `Task ${taskId} already claimed (status: ${claim.currentStatus}), skipping`);
    logger.close();
    return { success: false, noop: true, summary: `Task already claimed by another worker (status: ${claim.currentStatus})` };
  }

  logger.log('QAAgent', `Processing task ${taskId}: ${name}`);

  try {
    // Load SKILL layers based on task complexity
    const { content: skillContent, complexity, layers, tokens: skillTokens } = await loadSkillsForTask('qa', description);

    logger.log('QAAgent', `Task complexity: simple=${complexity.simple}, database=${complexity.database}, newPattern=${complexity.newPattern}`);
    logger.log('QAAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load QA-specific context (source files to test, existing patterns, schema)
    // Also loads generated files from dependency tasks (backend/frontend)
    let qaContext: QAContextResult;
    try {
      // Extract explicit source files from task context if provided
      const explicitSourceFiles = (context.sourceFiles as string[]) || undefined;
      // Pass taskId to load artifacts from dependency tasks
      qaContext = await buildQAContext(description, explicitSourceFiles, taskId);
    } catch (err) {
      logger.warn('QAAgent', 'Failed to load QA context, continuing without it: ' + err);
      qaContext = getEmptyQAContextResult();
    }

    logger.log('QAAgent', `Source files loaded: ${qaContext.sourceFilesLoaded}`);
    logger.log('QAAgent', `Dependency artifacts loaded: ${qaContext.dependencyArtifactsLoaded}`);
    logger.log('QAAgent', `Has existing tests: ${qaContext.hasExistingTests}`);
    logger.log('QAAgent', `Context tokens: ~${qaContext.tokens}`);

    // Load tech spec from architect layer (if generated)
    const taskRecord = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { technicalSpec: true, techSpecTokens: true },
    });

    let techSpecBlock = '';
    if (taskRecord?.technicalSpec) {
      techSpecBlock = `\n\n## TECHNICAL SPECIFICATION (from Architect)\n\nFollow this spec precisely. It was written by a senior architect who reviewed the full project context.\nIf the spec lists existing dependency files, import from them directly. Do NOT create new files that duplicate existing dependency outputs.\n\n${taskRecord.technicalSpec}\n`;
      logger.log('QAAgent', `Tech spec available: ~${taskRecord.technicalSpec.length} chars`);
    } else {
      logger.log('QAAgent', 'No tech spec for this task');
    }

    // Scaffold pipeline: generate test shells locally (free), send to Claude with TODO markers
    // Wire source file data from QA context so test-shell scaffolder can parse exports
    const primarySource = qaContext.rawSourceFiles[0];
    let scaffoldResult: ScaffoldResult | null = null;
    try {
      scaffoldResult = generateScaffold({
        agentType: 'qa',
        taskDescription: description,
        taskName: name,
        requirements: buildPrompt(name, description, context),
        techSpec: taskRecord?.technicalSpec ?? undefined,
        sourceFilePath: primarySource?.path,
        sourceContent: primarySource?.content,
      });
      if (scaffoldResult.success && scaffoldResult.files.length > 0) {
        logger.log('QAAgent', `Scaffold generated: ${scaffoldResult.scaffoldType}, ${scaffoldResult.files.length} files`);
      } else {
        logger.warn('QAAgent', `Scaffold skipped: success=${scaffoldResult.success}, files=${scaffoldResult.files.length}, type=${scaffoldResult.scaffoldType ?? 'none'}${scaffoldResult.error ? `, reason=${scaffoldResult.error}` : ''}`);
      }
    } catch (err) {
      logger.warn('QAAgent', 'Scaffold generation failed, continuing without it: ' + err);
    }

    // Build user prompt (task-specific, not cached)
    const userPrompt = (scaffoldResult?.success && scaffoldResult.files.length > 0)
      ? scaffoldResult.prompt + techSpecBlock
      : buildPrompt(name, description, context) + techSpecBlock;

    logger.log('QAAgent', 'Calling Claude API...');

    // Build cached system prompt for cost optimization
    // SKILL files are cached (static across tasks)
    // QA context is NOT cached (varies per task - different source files)
    const cachedSystem = buildCachedSystemPrompt(skillContent, qaContext.content);

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

    logger.log('QAAgent', 'Parsing response...');
    logger.log('QAAgent', 'Response text length: ' + responseText.length);
    logger.log('QAAgent', 'First 500 chars: ' + responseText.substring(0, 500));
    logger.log('QAAgent', 'Last 500 chars: ' + responseText.substring(Math.max(0, responseText.length - 500)));

    // Parse the response
    const parseResult = parseAgentOutput(responseText);

    logger.log('QAAgent', 'Parse result: ' + JSON.stringify({
      filesCount: parseResult.files.length,
      hasQuestions: parseResult.hasQuestions,
      filePaths: parseResult.files.map(f => f.path),
    }));

    // Extract cache metrics from API response
    const cacheMetrics = extractCacheMetrics(response.usage);
    logCacheMetrics('QAAgent', cacheMetrics);

    // Log token baseline metrics and save to database
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'qa',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(userPrompt.length / 4),
      codebaseContextTokens: qaContext.tokens,
      questionsAsked: parseResult.hasQuestions ? 1 : 0,
      filesGenerated: parseResult.files.length,
      layersLoaded: layers.length,
      complexity,
      // QA context metrics
      sourceFilesLoaded: qaContext.sourceFilesLoaded,
      hasExistingTests: qaContext.hasExistingTests,
      hasSchema: qaContext.hasSchema,
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
      agentType: 'qa',
      model: MODEL,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Handle questions — only block pipeline if agent produced NO files
    if (parseResult.hasQuestions && parseResult.questionsContent) {
      if (parseResult.files.length === 0) {
        // No files = real blocker, agent couldn't proceed
        logger.log('QAAgent', 'Task has questions and no files - blocking for human input...');

        const task = await getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }

        await db.insert(questions).values({
          projectId: task.projectId,
          taskId,
          question: parseResult.questionsContent,
          context: `Task: ${name}\n\nDescription: ${description}`,
          askedByAgent: 'qa',
          status: 'pending',
          priority: 'blocking',
          isBlocking: true,
        });

        await updateTaskStatus(taskId, 'waiting_human', {
          success: false,
          summary: 'Task requires human input - questions pending',
        });

        throw new Error('Task requires human input - questions pending');
      } else {
        // Files generated = agent made its decisions. Discard phantom questions.
        const questionSnippets = parseResult.questionsContent
          .split('\n')
          .filter(l => l.trim())
          .map(q => q.substring(0, 80) + (q.length > 80 ? '...' : ''))
          .join('; ');
        logger.log('QAAgent',
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
      logger.warn('QAAgent', 'File validation warnings: ' + JSON.stringify(validation.errors));
    }

    if (parseResult.files.length === 0) {
      logger.log('QAAgent', 'No files generated - requesting clarification from user');

      // Get task to find project ID
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Create clarification question - don't silently complete with no output
      await db.insert(questions).values({
        projectId: task.projectId,
        taskId,
        question: `I wasn't able to generate tests for this task. The request may need more details or I may need to see the source files.\n\n**Original request:** ${name}\n\n**What I understood:** ${description}\n\n**Claude's response:**\n${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}\n\n**Please clarify:**\n- Which specific files need tests?\n- What test type (unit, component, integration)?\n- Or should this task be cancelled?`,
        context: `Task: ${name}\n\nDescription: ${description}`,
        askedByAgent: 'qa',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      // Update task status to waiting_human - NOT completed
      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: 'Clarification needed - no test output generated',
        outputs: { rawResponse: responseText },
      });

      throw new Error('Clarification needed - no test output generated');
    }

    logger.log('QAAgent', `Validating ${parseResult.files.length} files with syntax recovery...`);

    // Create validation function for recovery loop
    const validateFiles = async (files: typeof parseResult.files): Promise<SyntaxError[]> => {
      const tempWriteResult = await writeGeneratedFiles(taskId, files, 'qa');
      const validationResult = await validateGeneratedFiles(tempWriteResult.taskDir, tempWriteResult.files);
      return validationResult.errors.map(e => ({
        file: e.file,
        line: e.line,
        message: e.message,
      }));
    };

    // Cost tracking callback for syntax recovery
    const onRecoveryCost: CostTrackingCallback = async (usage) => {
      await recordAgentCost({
        projectId,
        taskId,
        agentType: 'qa',
        model: usage.callSource === 'syntax-fix' ? 'claude-3-5-haiku-latest' : MODEL,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        callSource: usage.callSource,
      });
    };

    // Create fresh generation function for full retries
    const generateFresh = async (): Promise<typeof parseResult.files> => {
      logger.log('QAAgent', 'Generating fresh response (full retry)...');
      const retryResponse = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: cachedSystem,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Track full retry cost
      await onRecoveryCost({
        inputTokens: retryResponse.usage?.input_tokens ?? 0,
        outputTokens: retryResponse.usage?.output_tokens ?? 0,
        cachedTokens: (retryResponse.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
        callSource: 'full-retry',
      });

      const retryText = retryResponse.content.find(c => c.type === 'text');
      const retryResponseText = retryText?.type === 'text' ? retryText.text : '';
      const retryParsed = parseAgentOutput(retryResponseText);
      logger.log('QAAgent', `Fresh generation produced ${retryParsed.files.length} files`);
      return retryParsed.files;
    };

    // Use recovery loop for syntax errors
    const recoveryResult = await processWithSyntaxRecovery(
      client,
      'QAAgent',
      parseResult.files,
      validateFiles,
      generateFresh,
      onRecoveryCost
    );

    logger.log('QAAgent', `Recovery complete: success=${recoveryResult.success}, fixLoops=${recoveryResult.attempts.fixLoops}, fullRetries=${recoveryResult.attempts.fullRetries}`);

    // 0-file safety check: recovery reported success but produced no files
    if (recoveryResult.success && recoveryResult.files.length === 0) {
      logger.error('QAAgent', `Syntax recovery succeeded but produced 0 files from ${parseResult.files.length} input files`);
      throw new Error(`Syntax recovery produced 0 files from ${parseResult.files.length} declared — aborting to prevent silent completion`);
    }

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
        logger.error('QAAgent', 'Failed to save recovery context: ' + err);
      }

      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: `Syntax errors in tests after ${recoveryResult.attempts.fixLoops} fix attempts: ${errorSummary}`,
        outputs: {
          errors: recoveryResult.errors,
          recoveryAttempts: recoveryResult.attempts,
        },
      });

      throw new Error(`Generated tests have syntax errors after recovery attempts: ${errorSummary}`);
    }

    // Write final validated files
    logger.log('QAAgent', `Writing ${recoveryResult.files.length} validated files...`);
    const writeResult = await writeGeneratedFiles(taskId, recoveryResult.files, 'qa');

    // Skip bracket check — files already passed TS compiler validation in recovery loop.
    // The regex bracket counter produces false positives on valid code.
    const finalValidation = await validateGeneratedFiles(writeResult.taskDir, writeResult.files, { skipBracketCheck: true });
    if (!finalValidation.valid) {
      logger.warn('QAAgent', 'Post-recovery warnings (typos/non-syntax): ' + JSON.stringify(finalValidation.errors));
      try {
        await db.update(tasks).set({ warnings: finalValidation.errors }).where(eq(tasks.id, taskId));
      } catch (err) {
        logger.error('QAAgent', 'Failed to save warnings: ' + err);
      }
    }

    logger.log('QAAgent', 'Creating artifact records...');

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
          description: `Generated by QA agent for task: ${name}`,
          filePath: `generated/tasks/${taskId}/${filePath}`,
          createdByAgent: 'qa',
          metadata: {
            language: getLanguageFromPath(filePath),
          },
        })
        .returning({ id: artifacts.id });

      artifactIds.push(artifact.id);
    }

    logger.log('QAAgent', `Task ${taskId} completed successfully`);

    // Update task status
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary: `Generated ${recoveryResult.files.length} test file(s)`,
      outputs: {
        generatedDir: writeResult.taskDir,
        files: writeResult.files,
        artifactIds,
        warnings: finalValidation.valid ? [] : finalValidation.errors,
      },
    });

    return {
      success: true,
      summary: `Generated ${recoveryResult.files.length} test file(s)`,
      artifactIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('QAAgent', `Task ${taskId} failed: ${errorMessage}`);

    // Update task status to failed (may already be set by throw sites above)
    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: errorMessage,
    });

    throw error; // Re-throw so BullMQ marks job as failed
  } finally {
    logger.close();
  }
}

/**
 * Determines programming language from file path (QA-specific).
 */
function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript-react',
    js: 'javascript',
    jsx: 'javascript-react',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
  };

  return ext ? languageMap[ext] : undefined;
}

/**
 * Create and start the QA agent worker.
 */
export function createQAWorker(): Worker<TaskJobData> {
  console.log(`[QAAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processQATask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[QAAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[QAAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[QAAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[QAAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownQAWorker(worker: Worker): Promise<void> {
  console.log('[QAAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[QAAgent] Shutdown complete');
}
