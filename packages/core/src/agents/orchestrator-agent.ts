/**
 * Orchestrator Agent
 *
 * A BullMQ worker that processes orchestration tasks using Claude API (Opus).
 * Coordinates other agents by decomposing projects, assigning tasks, and reviewing work.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { questions, tasks } from '@soloenterprise/db/schema';
import { eq, and as drizzleAnd, count } from 'drizzle-orm';
import { updateTaskStatus, getTask, claimTaskForProcessing, type TaskJobData } from '../services/task-service';
import { loadSkillsForOrchestrator, type OrchestratorAction } from './utils/skill-loader';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { buildOrchestratorContextWithDiff, getEmptyOrchestratorContextResult, type OrchestratorContextResult } from './utils/orchestrator-context-loader';
import { selectOrchestratorModel } from './utils/model-selector';
import { assessProjectComplexity } from './utils/project-context-loader';
import { parseOrchestratorOutput, type OrchestratorParseResult } from './utils/orchestrator-output-parser';
import { executeOrchestratorCommands, type ExecutionResult } from './utils/orchestrator-command-executor';
import { extractImageRequirements } from './utils/image-requirement-extractor';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';

const QUEUE_NAME = 'orchestrator-tasks';

// ============================================================================
// Token Baseline Logging - Measurement only, no logic changes
// ============================================================================

interface OrchestratorTokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'orchestrator';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  action: OrchestratorAction;
  layersLoaded: number;
  // Orchestrator context metrics
  orchestratorContextTokens: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  pendingQuestionCount: number;
  lockedFileCount: number;
  // Cache metrics
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHitPercent: number;
  estimatedSavingsPercent: number;
}

async function logTokenBaseline(metrics: OrchestratorTokenMetrics): Promise<void> {
  // Save metrics to database for dashboard
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[OrchestratorAgent] Failed to save token metrics:', err);
  }

  // Keep console log for debugging
  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration
const DEFAULT_MODEL = process.env.ORCHESTRATOR_MODEL || 'claude-opus-4-6';
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
    anthropicClient = new Anthropic({
      apiKey,
      timeout: 10 * 60 * 1000, // 10 minutes — large decompositions need time
      maxRetries: 2, // 3 total attempts on transient failures (network errors, 5xx)
    });
  }
  return anthropicClient;
}

/**
 * Builds the prompt for Claude.
 * Orchestrator prompts are simpler - no source files or test context.
 */
function buildPrompt(
  taskName: string,
  taskDescription: string,
  context: Record<string, unknown>,
  scopeData?: Record<string, unknown> | null,
  clientDocument?: string | null,
): string {
  const parts: string[] = [];

  parts.push('# Orchestration Task\n');
  parts.push(`**Task:** ${taskName}\n`);
  parts.push(`**Description:** ${taskDescription}\n`);

  // Project context if available
  if (context.projectName) {
    parts.push(`\n**Project:** ${context.projectName}\n`);
  }

  if (context.projectDescription) {
    parts.push(`**Project Description:** ${context.projectDescription}\n`);
  }

  // Scope data (from approved project scope)
  if (scopeData) {
    parts.push('\n## Approved Project Scope\n');
    parts.push('The following scope was approved by the client. Use this to guide task decomposition and priorities.\n');
    parts.push('```json');
    parts.push(JSON.stringify(scopeData, null, 2));
    parts.push('```\n');
  }

  // Client document (from scope approval)
  if (clientDocument) {
    parts.push('\n## Client Document\n');
    parts.push(clientDocument);
    parts.push('\n');
  }

  // Requirements
  if (context.requirements) {
    parts.push(`\n**Requirements:**\n${context.requirements}\n`);
  }

  // Current state information
  if (context.currentTasks && Array.isArray(context.currentTasks)) {
    parts.push('\n**Current Tasks in Project:**');
    for (const task of context.currentTasks) {
      const t = task as { name: string; status: string; agentType?: string };
      parts.push(`- ${t.name} (${t.status}${t.agentType ? `, ${t.agentType}` : ''})`);
    }
    parts.push('');
  }

  // Previous attempts
  if (context.previousAttempts && Array.isArray(context.previousAttempts)) {
    parts.push('\n**Previous Attempts (learn from these failures):**');
    for (const attempt of context.previousAttempts) {
      const typedAttempt = attempt as { attemptNumber: number; error: string; timestamp: string };
      parts.push(`- Attempt ${typedAttempt.attemptNumber}: ${typedAttempt.error}`);
    }
    parts.push('');
  }

  // Answered questions from human
  if (context.answeredQuestions && Array.isArray(context.answeredQuestions)) {
    parts.push('\n**Previously Asked Questions (Human has answered these):**');
    for (const qa of context.answeredQuestions) {
      const typedQA = qa as { question: string; answer: string };
      parts.push(`\nQ: ${typedQA.question}`);
      parts.push(`A: ${typedQA.answer}`);
    }
    parts.push('\n');
    parts.push('**IMPORTANT:** Use the answers above to guide your decisions. Do NOT ask these questions again.');
    parts.push('');
  }

  parts.push('\n---\n');
  parts.push('Analyze the task and respond with your orchestration commands in YAML format as specified in your skill definition.');

  return parts.join('\n');
}

/**
 * Process an orchestrator task.
 */
async function processOrchestratorTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  noop?: boolean;
  summary?: string;
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;
  const logger = new TaskLogger(taskId);

  // Claim guard: atomic queued → running transition
  const claim = await claimTaskForProcessing(taskId);
  if (!claim.claimed) {
    logger.log('OrchestratorAgent', `Task ${taskId} already claimed (status: ${claim.currentStatus}), skipping`);
    logger.close();
    return { success: false, noop: true, summary: `Task already claimed by another worker (status: ${claim.currentStatus})` };
  }

  logger.log('OrchestratorAgent', `Processing task ${taskId}: ${name}`);

  try {
    // Load SKILL layers based on detected action
    const { content: skillContent, action, layers, tokens: skillTokens } = await loadSkillsForOrchestrator(description);

    logger.log('OrchestratorAgent', `Detected action: ${action}`);
    logger.log('OrchestratorAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load orchestrator-specific context with diff-awareness (returns minimal summary if unchanged)
    let orchestratorContext: OrchestratorContextResult;
    try {
      orchestratorContext = await buildOrchestratorContextWithDiff(projectId);
    } catch (err) {
      logger.warn('OrchestratorAgent', `Failed to load orchestrator context, continuing without it: ${err}`);
      orchestratorContext = getEmptyOrchestratorContextResult();
    }

    logger.log('OrchestratorAgent', `Context: ${orchestratorContext.activeTaskCount} active, ${orchestratorContext.blockedTaskCount} blocked, ${orchestratorContext.pendingQuestionCount} questions, ${orchestratorContext.lockedFileCount} locks, ~${orchestratorContext.tokens} tokens`);

    // Image requirement extraction (runs only if images attached)
    let imageReqBlock = '';
    try {
      const imageResult = await extractImageRequirements(taskId);
      if (imageResult) {
        imageReqBlock = `\n\n## VISUAL REQUIREMENTS (extracted from attached images)\n\n${imageResult.requirements}\n`;
        logger.log('OrchestratorAgent', `Image requirements extracted: ~${imageResult.tokens} tokens`);
      }
    } catch (err) {
      logger.warn('OrchestratorAgent', `Image extraction failed, continuing without: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Circuit breaker: check question rounds before calling API
    const maxQuestionRounds = parseInt(process.env.ORCHESTRATOR_MAX_QUESTION_ROUNDS || '5', 10);
    const [questionCountResult] = await db
      .select({ value: count() })
      .from(questions)
      .where(drizzleAnd(eq(questions.taskId, taskId), eq(questions.askedByAgent, 'orchestrator')));
    const questionCount = questionCountResult?.value ?? 0;

    if (questionCount >= maxQuestionRounds) {
      logger.warn('OrchestratorAgent', `Circuit breaker triggered: ${questionCount} question rounds reached (max: ${maxQuestionRounds})`);

      await db.insert(questions).values({
        projectId,
        taskId,
        question: `This task has asked ${questionCount} rounds of questions without producing actionable output. Review the task requirements or answer 'cancelled' to stop.`,
        context: `Task: ${name}\n\nDescription: ${description}\n\nThis is an automatic escalation — the orchestrator has exceeded the maximum allowed question rounds.`,
        askedByAgent: 'orchestrator',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: `Circuit breaker: ${questionCount} question rounds exceeded (max: ${maxQuestionRounds})`,
      });

      throw new Error(`Circuit breaker triggered after ${questionCount} question rounds`);
    }

    // Build user prompt with enriched description (thread scope data from context loader)
    const enrichedDescription = description + imageReqBlock;
    const userPrompt = buildPrompt(
      name,
      enrichedDescription,
      context,
      orchestratorContext.scopeData,
      orchestratorContext.clientDocument,
    );

    // Dynamic model selection based on task context and project complexity
    const hasAnsweredQuestions = Array.isArray(context.answeredQuestions) && context.answeredQuestions.length > 0;
    const isFirstRun = !hasAnsweredQuestions && job.data.attemptNumber <= 1;
    let estimatedTaskCount: number | undefined;
    try {
      const complexity = await assessProjectComplexity(projectId);
      estimatedTaskCount = complexity === 'simple' ? 3 : complexity === 'moderate' ? 10 : 20;
    } catch {
      // Non-fatal
    }

    const selectedModel = process.env.ORCHESTRATOR_MODEL
      ? DEFAULT_MODEL // Explicit env override takes precedence
      : selectOrchestratorModel({ hasAnsweredQuestions, isFirstRun, estimatedTaskCount });

    logger.log('OrchestratorAgent', `Calling Claude API (model: ${selectedModel})...`);

    // Build cached system prompt with orchestrator context (cache both blocks for Anthropic prompt caching)
    const cachedSystem = buildCachedSystemPrompt(skillContent, orchestratorContext.content, {
      cacheCodebaseContext: true, // Safe now: diff-aware loader returns minimal summary when unchanged
    });

    // Call Claude API (streaming keeps connection alive, prevents timeout on large responses)
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: selectedModel,
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

    let chunksReceived = 0;
    stream.on('text', () => {
      chunksReceived++;
      if (chunksReceived % 20 === 0) {
        logger.log('OrchestratorAgent', `Streaming... ${chunksReceived} chunks received`);
      }
    });

    const response = await stream.finalMessage();

    // Extract text response
    const textContent = response.content.find((block) => block.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    logger.log('OrchestratorAgent', 'Raw response:\n' + responseText);

    // Extract cache metrics from API response
    const cacheMetrics = extractCacheMetrics(response.usage);
    logCacheMetrics('OrchestratorAgent', cacheMetrics);

    // Log token baseline metrics and save to database
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'orchestrator',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(userPrompt.length / 4),
      action,
      layersLoaded: layers.length,
      // Orchestrator context metrics
      orchestratorContextTokens: orchestratorContext.tokens,
      activeTaskCount: orchestratorContext.activeTaskCount,
      blockedTaskCount: orchestratorContext.blockedTaskCount,
      pendingQuestionCount: orchestratorContext.pendingQuestionCount,
      lockedFileCount: orchestratorContext.lockedFileCount,
      // Cache metrics
      cacheCreationInputTokens: cacheMetrics.cacheCreationInputTokens,
      cacheReadInputTokens: cacheMetrics.cacheReadInputTokens,
      cacheHitPercent: cacheMetrics.cacheHitPercent,
      estimatedSavingsPercent: cacheMetrics.estimatedSavingsPercent,
    });

    // Record cost to cost_tracking table
    await recordAgentCost({
      projectId,
      taskId,
      agentType: 'orchestrator',
      model: selectedModel,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Parse YAML response
    const parseResult = parseOrchestratorOutput(responseText);

    if (!parseResult.success) {
      logger.warn('OrchestratorAgent', `Failed to parse response: ${parseResult.error}`);
      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: `YAML parse failure: ${parseResult.error}`,
        outputs: { rawResponse: responseText },
      });
      throw new Error(`YAML parse failure: ${parseResult.error}`);
    } else {
      logger.log('OrchestratorAgent', `Parsed: action=${parseResult.action}, tasks=${parseResult.tasks.length}, questions=${parseResult.questions.length}`);
    }

    // Execute orchestrator commands (create tasks, update statuses, manage locks)
    // Note: Questions are handled separately below
    let executionResult: ExecutionResult | null = null;

    if (parseResult.success && (parseResult.tasks.length > 0 || parseResult.statusUpdates.length > 0 || parseResult.fileLocks.length > 0)) {
      logger.log('OrchestratorAgent', 'Executing commands...');
      executionResult = await executeOrchestratorCommands(projectId, taskId, parseResult);

      if (executionResult.errors.length > 0) {
        logger.warn('OrchestratorAgent', `Execution had errors: ${JSON.stringify(executionResult.errors)}`);
      }

      logger.log('OrchestratorAgent', `Execution complete: ${executionResult.tasksCreated.length} tasks created, ${executionResult.statusesUpdated.length} statuses updated, ${executionResult.locksAcquired.length} locks acquired, ${executionResult.locksReleased.length} locks released`);
    }

    // No-output guard: if orchestrator produced nothing actionable, escalate
    const executedCommandCount = executionResult
      ? executionResult.tasksCreated.length + executionResult.statusesUpdated.length + executionResult.locksAcquired.length + executionResult.locksReleased.length
      : 0;
    const hasQuestionsInOutput = parseResult.success && parseResult.questions.length > 0;

    if (executedCommandCount === 0 && !hasQuestionsInOutput) {
      logger.warn('OrchestratorAgent', 'No-output guard triggered: orchestrator produced no actionable commands and no questions');

      await db.insert(questions).values({
        projectId,
        taskId,
        question: 'The orchestrator produced no actionable output for this task. Please review the task description and provide clarification, or answer \'cancelled\' to stop.',
        context: `Task: ${name}\n\nDescription: ${description}\n\nRaw response was received but contained no executable commands or questions.`,
        askedByAgent: 'orchestrator',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: 'No-output guard: orchestrator produced no actionable output',
        outputs: {
          rawResponse: responseText,
          parsed: parseResult.success,
          action: parseResult.action,
        },
      });

      throw new Error('No-output guard: orchestrator produced no actionable output');
    }

    // Check if orchestrator needs human input (has questions in parsed output)
    const hasQuestions = parseResult.success && parseResult.questions.length > 0;

    if (hasQuestions) {
      logger.log('OrchestratorAgent', `Response contains ${parseResult.questions.length} question(s), creating question records...`);

      // Create question records from parsed questions
      for (const q of parseResult.questions) {
        await db.insert(questions).values({
          projectId,
          taskId,
          question: q.question,
          context: q.context ?? `Task: ${name}\n\nDescription: ${description}`,
          askedByAgent: 'orchestrator',
          status: 'pending',
          priority: q.priority === 'critical' ? 'blocking' : q.priority === 'high' ? 'important' : 'informational',
          isBlocking: q.priority === 'critical',
        });
      }

      // Update task status to waiting_human
      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: `Orchestrator needs human input - ${parseResult.questions.length} question(s) pending`,
        outputs: {
          rawResponse: responseText,
          parsed: parseResult.success,
          action: parseResult.action,
          questionsCount: parseResult.questions.length,
        },
      });

      throw new Error(`Orchestrator needs human input - ${parseResult.questions.length} question(s) pending`);
    }

    logger.log('OrchestratorAgent', `Task ${taskId} completed successfully`);

    // Build summary based on what was actually executed
    const summary = executionResult
      ? `Created ${executionResult.tasksCreated.length} tasks, updated ${executionResult.statusesUpdated.length} statuses`
      : 'Orchestrator response parsed (no executable commands)';

    // Update task status with parse and execution results
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary,
      outputs: {
        rawResponse: responseText,
        parsed: parseResult.success,
        action: parseResult.action,
        tasksCount: parseResult.tasks.length,
        questionsCount: parseResult.questions.length,
        statusUpdatesCount: parseResult.statusUpdates.length,
        fileLocksCount: parseResult.fileLocks.length,
        // Execution results
        execution: executionResult ? {
          tasksCreated: executionResult.tasksCreated,
          statusesUpdated: executionResult.statusesUpdated,
          locksAcquired: executionResult.locksAcquired,
          locksReleased: executionResult.locksReleased,
          errors: executionResult.errors,
        } : null,
      },
    });

    return {
      success: true,
      summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('OrchestratorAgent', `Task ${taskId} failed: ${errorMessage}`);

    // Only overwrite status if task is still in a processing state.
    // Do NOT overwrite waiting_human (set when agent asks a question) or blocked.
    const currentTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { status: true },
    });
    if (!currentTask || currentTask.status === 'running' || currentTask.status === 'queued') {
      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: errorMessage,
      });
    }

    throw error; // Re-throw so BullMQ marks job as failed
  } finally {
    logger.close();
  }
}

/**
 * Create and start the orchestrator agent worker.
 */
export function createOrchestratorWorker(): Worker<TaskJobData> {
  console.log(`[OrchestratorAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processOrchestratorTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[OrchestratorAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[OrchestratorAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[OrchestratorAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[OrchestratorAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownOrchestratorWorker(worker: Worker): Promise<void> {
  console.log('[OrchestratorAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[OrchestratorAgent] Shutdown complete');
}
