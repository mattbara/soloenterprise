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
import { eq } from 'drizzle-orm';
import { updateTaskStatus, getTask, type TaskJobData } from '../services/task-service';
import { loadSkillsForOrchestrator, type OrchestratorAction } from './utils/skill-loader';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { buildOrchestratorContext, getEmptyOrchestratorContextResult, type OrchestratorContextResult } from './utils/orchestrator-context-loader';
import { parseOrchestratorOutput, type OrchestratorParseResult } from './utils/orchestrator-output-parser';
import { executeOrchestratorCommands, type ExecutionResult } from './utils/orchestrator-command-executor';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';

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

// Claude API configuration - Orchestrator uses Opus for high-quality reasoning
const MODEL = process.env.ORCHESTRATOR_MODEL || 'claude-opus-4-6';
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
 * Orchestrator prompts are simpler - no source files or test context.
 */
function buildPrompt(
  taskName: string,
  taskDescription: string,
  context: Record<string, unknown>
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
  summary?: string;
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;

  console.log(`[OrchestratorAgent] Processing task ${taskId}: ${name}`);

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    // Load SKILL layers based on detected action
    const { content: skillContent, action, layers, tokens: skillTokens } = await loadSkillsForOrchestrator(description);

    console.log(`[OrchestratorAgent] Detected action: ${action}`);
    console.log(`[OrchestratorAgent] Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load orchestrator-specific context (project state, tasks, locks, questions)
    let orchestratorContext: OrchestratorContextResult;
    try {
      orchestratorContext = await buildOrchestratorContext(projectId);
    } catch (err) {
      console.warn('[OrchestratorAgent] Failed to load orchestrator context, continuing without it:', err);
      orchestratorContext = getEmptyOrchestratorContextResult();
    }

    console.log(`[OrchestratorAgent] Context: ${orchestratorContext.activeTaskCount} active, ${orchestratorContext.blockedTaskCount} blocked, ${orchestratorContext.pendingQuestionCount} questions, ${orchestratorContext.lockedFileCount} locks, ~${orchestratorContext.tokens} tokens`);

    // Build user prompt
    const userPrompt = buildPrompt(name, description, context);

    console.log('[OrchestratorAgent] Calling Claude API (Opus)...');

    // Build cached system prompt with orchestrator context
    const cachedSystem = buildCachedSystemPrompt(skillContent, orchestratorContext.content);

    // Call Claude API
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

    console.log('[OrchestratorAgent] Raw response received:');
    console.log('---');
    console.log(responseText);
    console.log('---');

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

    // Parse YAML response
    const parseResult = parseOrchestratorOutput(responseText);

    if (!parseResult.success) {
      console.warn('[OrchestratorAgent] Failed to parse response:', parseResult.error);
      // Don't fail the task — store raw response for debugging
    } else {
      console.log(`[OrchestratorAgent] Parsed: action=${parseResult.action}, tasks=${parseResult.tasks.length}, questions=${parseResult.questions.length}`);
    }

    // Execute orchestrator commands (create tasks, update statuses, manage locks)
    // Note: Questions are handled separately below
    let executionResult: ExecutionResult | null = null;

    if (parseResult.success && (parseResult.tasks.length > 0 || parseResult.statusUpdates.length > 0 || parseResult.fileLocks.length > 0)) {
      console.log('[OrchestratorAgent] Executing commands...');
      executionResult = await executeOrchestratorCommands(projectId, taskId, parseResult);

      if (executionResult.errors.length > 0) {
        console.warn('[OrchestratorAgent] Execution had errors:', executionResult.errors);
      }

      console.log(`[OrchestratorAgent] Execution complete: ${executionResult.tasksCreated.length} tasks created, ${executionResult.statusesUpdated.length} statuses updated, ${executionResult.locksAcquired.length} locks acquired, ${executionResult.locksReleased.length} locks released`);
    }

    // Check if orchestrator needs human input (has questions in parsed output)
    const hasQuestions = parseResult.success && parseResult.questions.length > 0;

    if (hasQuestions) {
      console.log(`[OrchestratorAgent] Response contains ${parseResult.questions.length} question(s), creating question records...`);

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

      return {
        success: false,
        summary: `Orchestrator needs human input - ${parseResult.questions.length} question(s) pending`,
      };
    }

    console.log(`[OrchestratorAgent] Task ${taskId} completed successfully`);

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
    console.error(`[OrchestratorAgent] Task ${taskId} failed:`, errorMessage);

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
