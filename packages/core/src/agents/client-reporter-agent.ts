/**
 * Client Reporter Agent
 *
 * A BullMQ worker that generates client-facing progress reports from project data.
 * Uses Claude Sonnet to transform internal metrics into professional reports.
 * Outputs go to generated/reports/{projectId}/ and the client_reports table.
 *
 * Report types:
 * - weekly: Weekly progress update for the client
 * - milestone: Delivered milestone summary
 * - summary: End-of-project retrospective
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '@soloenterprise/db';
import { clientReports, tasks } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { updateTaskStatus, type TaskJobData } from '../services/task-service';
import { loadSkillsForTask } from './utils/skill-loader';
import { buildProjectContext } from './utils/project-context-loader';
import { parseReportOutput } from './utils/report-parser';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';

const __dirname = dirname(fileURLToPath(import.meta.url));

const QUEUE_NAME = 'client-reporter-tasks';

// Reports output directory (sandboxed under generated/)
const REPORTS_DIR = resolve(__dirname, '../../../generated/reports');

// ============================================================================
// Token Baseline Logging
// ============================================================================

interface ReporterTokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'client-reporter';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  layersLoaded: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHitPercent: number;
  estimatedSavingsPercent: number;
}

async function logTokenBaseline(metrics: ReporterTokenMetrics): Promise<void> {
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[ReporterAgent] Failed to save token metrics:', err);
  }

  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration — Reporter uses Sonnet for cost-effective report generation
const MODEL = process.env.REPORTER_MODEL || 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 8000;
const TEMPERATURE = 0.3;

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
      timeout: 5 * 60 * 1000, // 5 minutes
      maxRetries: 2,
    });
  }
  return anthropicClient;
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(
  projectId: string,
  reportType: string,
  period?: string,
): string {
  const parts: string[] = [];

  parts.push('# Report Generation Request\n');
  parts.push(`**Project ID:** ${projectId}`);
  parts.push(`**Report Type:** ${reportType}`);
  if (period) parts.push(`**Period:** ${period}`);
  parts.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
  parts.push('\n---\n');
  parts.push(`Generate a ${reportType} report using the project context provided in the system prompt.`);
  parts.push('Use the <report> and <internal_notes> XML tags as specified in your skill definition.');
  parts.push(`Set the report type attribute to "${reportType}".`);

  return parts.join('\n');
}

// ============================================================================
// Main Processing
// ============================================================================

async function processReporterTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
}> {
  const { taskId, projectId, description, context } = job.data;
  const logger = new TaskLogger(taskId);

  // Extract reporter-specific fields from context
  const reportType = (context.reportType as string) || 'weekly';
  const period = context.period as string | undefined;

  logger.log('ReporterAgent', `Generating ${reportType} report for project ${projectId}`);

  if (!projectId) {
    logger.error('ReporterAgent', 'No projectId in job data');
    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: 'Missing projectId in job data',
    });
    logger.close();
    return { success: false, error: 'Missing projectId in job data' };
  }

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    // Load SKILL layers
    const { content: skillContent, layers, tokens: skillTokens } = await loadSkillsForTask('client-reporter', description);
    logger.log('ReporterAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Build project context (aggregated project data)
    const projectContext = await buildProjectContext(projectId);
    logger.log('ReporterAgent', `Project context built: ${projectContext.length} chars`);

    // Build user prompt
    const userPrompt = buildPrompt(projectId, reportType, period);

    logger.log('ReporterAgent', 'Calling Claude API (Sonnet)...');

    // Build cached system prompt — SKILL files cached, project context not (varies per project)
    const cachedSystem = buildCachedSystemPrompt(skillContent, projectContext);

    // Call Claude API with streaming to prevent timeout
    const client = getAnthropicClient();
    const stream = client.messages.stream({
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

    let chunksReceived = 0;
    stream.on('text', () => {
      chunksReceived++;
      if (chunksReceived % 20 === 0) {
        logger.log('ReporterAgent', `Streaming... ${chunksReceived} chunks received`);
      }
    });

    const response = await stream.finalMessage();

    // Extract text response
    const textContent = response.content.find((block) => block.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    logger.log('ReporterAgent', `Response received: ${responseText.length} chars`);

    // Extract cache metrics
    const cacheMetrics = extractCacheMetrics(response.usage);
    logCacheMetrics('ReporterAgent', cacheMetrics);

    // Log token baseline
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'client-reporter',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(userPrompt.length / 4),
      layersLoaded: layers.length,
      cacheCreationInputTokens: cacheMetrics.cacheCreationInputTokens,
      cacheReadInputTokens: cacheMetrics.cacheReadInputTokens,
      cacheHitPercent: cacheMetrics.cacheHitPercent,
      estimatedSavingsPercent: cacheMetrics.estimatedSavingsPercent,
    });

    // Record cost to cost_tracking table
    await recordAgentCost({
      projectId,
      taskId,
      agentType: 'client-reporter',
      model: MODEL,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Parse the response
    const parseResult = parseReportOutput(responseText);

    if (!parseResult.reportContent) {
      logger.warn('ReporterAgent', 'No report content extracted from response');
      logger.log('ReporterAgent', 'Raw response (first 500):\n' + responseText.substring(0, 500));

      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: 'Malformed response — no report content found',
      });

      return { success: false, error: 'Malformed response from Claude' };
    }

    // Write outputs to filesystem
    const reportDir = resolve(REPORTS_DIR, projectId);
    const dateStr = new Date().toISOString().split('T')[0];

    try {
      await mkdir(reportDir, { recursive: true });

      // Client-facing report
      const reportFilename = `${reportType}-${dateStr}.md`;
      await writeFile(resolve(reportDir, reportFilename), parseResult.reportContent, 'utf-8');

      // Internal notes
      if (parseResult.internalNotes) {
        const notesFilename = `internal-${dateStr}.yaml`;
        await writeFile(resolve(reportDir, notesFilename), parseResult.internalNotes, 'utf-8');
      }

      logger.log('ReporterAgent', `Files written to ${reportDir}`);
    } catch (err) {
      logger.error('ReporterAgent', `Failed to write report files: ${err}`);
      // Non-fatal — DB insert is the primary storage
    }

    // Insert into client_reports table
    try {
      await db.insert(clientReports).values({
        projectId,
        reportType,
        reportContent: parseResult.reportContent,
        internalNotes: parseResult.internalNotes || null,
        period: period || null,
        status: 'draft',
      });
      logger.log('ReporterAgent', 'Report record created in database');
    } catch (err) {
      logger.error('ReporterAgent', `Failed to create report record: ${err}`);
      // Non-fatal — filesystem output is the fallback
    }

    // Build summary
    const summary = `${reportType} report generated for project ${projectId}${period ? ` (${period})` : ''}`;
    logger.log('ReporterAgent', `Task ${taskId} completed: ${summary}`);

    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary,
      outputs: {
        generatedDir: reportDir,
        files: [`${reportType}-${dateStr}.md`, parseResult.internalNotes ? `internal-${dateStr}.yaml` : ''].filter(Boolean),
      },
    });

    return { success: true, summary };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('ReporterAgent', `Task ${taskId} failed: ${errorMessage}`);

    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  } finally {
    logger.close();
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Create and start the client reporter agent worker.
 */
export function createClientReporterWorker(): Worker<TaskJobData> {
  console.log(`[ReporterAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processReporterTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[ReporterAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[ReporterAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[ReporterAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[ReporterAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownClientReporterWorker(worker: Worker): Promise<void> {
  console.log('[ReporterAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[ReporterAgent] Shutdown complete');
}
