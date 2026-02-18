/**
 * Project Scoper Agent
 *
 * A BullMQ worker that processes client briefs using Claude Opus.
 * Transforms raw briefs into structured scope specs (YAML) and client-facing documents.
 * Outputs go to generated/reports/{briefId}/ and the project_scopes table.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { parse as parseYaml } from 'yaml';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '@soloenterprise/db';
import { projectBriefs, projectScopes, tasks } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { updateTaskStatus, type TaskJobData } from '../services/task-service';
import { loadSkillsForTask } from './utils/skill-loader';
import { buildScoperContext } from './utils/scoper-context-loader';
import { buildCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from './utils/cache-helper';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';

const __dirname = dirname(fileURLToPath(import.meta.url));

const QUEUE_NAME = 'scoper-tasks';

// Reports output directory (sandboxed under generated/)
const REPORTS_DIR = resolve(__dirname, '../../../generated/reports');

// ============================================================================
// Token Baseline Logging
// ============================================================================

interface ScoperTokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'project-scoper';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  layersLoaded: number;
  // Cache metrics
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHitPercent: number;
  estimatedSavingsPercent: number;
}

async function logTokenBaseline(metrics: ScoperTokenMetrics): Promise<void> {
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[ScoperAgent] Failed to save token metrics:', err);
  }

  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration — Scoper uses Opus for high-quality reasoning
const MODEL = process.env.SCOPER_MODEL || 'claude-opus-4-5-20251101';
const MAX_TOKENS = 16000;
const TEMPERATURE = 0.2;

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
      timeout: 10 * 60 * 1000, // 10 minutes
      maxRetries: 2,
    });
  }
  return anthropicClient;
}

// ============================================================================
// Scoper Output Parser
// ============================================================================

export interface ScoperParseResult {
  scopeYaml: string;
  clientDocument: string;
}

/**
 * Parses scoper output to extract <scope> YAML and <client_document> markdown.
 */
export function parseScoperOutput(response: string): ScoperParseResult {
  // Extract <scope>...</scope>
  const scopeMatch = /<scope>([\s\S]*?)<\/scope>/i.exec(response);
  let scopeYaml = scopeMatch?.[1]?.trim() ?? '';

  // Strip markdown code fences (```yaml, ```) from scope content
  scopeYaml = scopeYaml.replace(/^```(?:yaml|yml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Extract <client_document>...</client_document>
  const clientMatch = /<client_document>([\s\S]*?)<\/client_document>/i.exec(response);
  const clientDocument = clientMatch?.[1]?.trim() ?? '';

  return { scopeYaml, clientDocument };
}

// ============================================================================
// Prompt Builder
// ============================================================================

function buildPrompt(briefId: string, briefTitle: string, briefContent: string): string {
  const parts: string[] = [];

  parts.push('# Scoping Request\n');
  parts.push(`**Brief ID:** ${briefId}`);
  parts.push(`**Brief Title:** ${briefTitle}\n`);
  parts.push('**Brief Content:**\n');
  parts.push(briefContent);
  parts.push('\n---\n');
  parts.push('Analyze this brief and produce your scoping output using the <scope> and <client_document> XML tags as specified in your skill definition.');
  parts.push(`\nIMPORTANT: Use exactly \`${briefId}\` as the \`brief_id\` value in the YAML output. Do NOT invent a different ID.`);

  return parts.join('\n');
}

// ============================================================================
// Main Processing
// ============================================================================

/**
 * Process a scoper task.
 */
async function processScoperTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;
  const logger = new TaskLogger(taskId);

  // Extract scoper-specific fields from context
  const briefId = (context.briefId as string) || '';
  const briefTitle = (context.briefTitle as string) || name || 'Untitled Brief';
  const clientId = context.clientId as string | undefined;

  logger.log('ScoperAgent', `Processing brief ${briefId}: ${briefTitle}`);

  if (!briefId) {
    logger.error('ScoperAgent', 'No briefId in job context');
    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: 'Missing briefId in job context',
    });
    return { success: false, error: 'Missing briefId in job context' };
  }

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    // Load SKILL layers
    const { content: skillContent, layers, tokens: skillTokens } = await loadSkillsForTask('project-scoper', description);
    logger.log('ScoperAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Build scoper context (brief + client info)
    const scoperContext = await buildScoperContext({
      briefId,
      briefContent: description,
      briefTitle,
      clientId,
    });

    // Build user prompt
    const userPrompt = buildPrompt(briefId, briefTitle, description);

    logger.log('ScoperAgent', 'Calling Claude API (Opus)...');

    // Build cached system prompt — SKILL files cached, scoper context not (varies per brief)
    const cachedSystem = buildCachedSystemPrompt(skillContent, scoperContext);

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
        logger.log('ScoperAgent', `Streaming... ${chunksReceived} chunks received`);
      }
    });

    const response = await stream.finalMessage();

    // Extract text response
    const textContent = response.content.find((block) => block.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    logger.log('ScoperAgent', `Response received: ${responseText.length} chars`);

    // Extract cache metrics
    const cacheMetrics = extractCacheMetrics(response.usage);
    logCacheMetrics('ScoperAgent', cacheMetrics);

    // Log token baseline
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'project-scoper',
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
      agentType: 'scoper',
      model: MODEL,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Parse the response
    const parseResult = parseScoperOutput(responseText);

    if (!parseResult.scopeYaml && !parseResult.clientDocument) {
      logger.warn('ScoperAgent', 'No <scope> or <client_document> tags found in response');
      logger.log('ScoperAgent', 'Raw response (first 500):\n' + responseText.substring(0, 500));

      // Reset brief status so it can be retried
      try {
        await db.update(projectBriefs)
          .set({ status: 'received', updatedAt: new Date() })
          .where(eq(projectBriefs.id, briefId));
      } catch (err) {
        logger.error('ScoperAgent', 'Failed to reset brief status: ' + err);
      }

      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: 'Malformed response — no scope or client document tags found',
        outputs: { rawResponse: responseText },
      });

      return { success: false, error: 'Malformed response from Claude' };
    }

    // Parse YAML scope into JSON
    let scopeData: Record<string, unknown> = {};
    let yamlParseError = false;

    if (parseResult.scopeYaml) {
      try {
        scopeData = parseYaml(parseResult.scopeYaml) as Record<string, unknown>;
        logger.log('ScoperAgent', 'YAML scope parsed successfully');
      } catch (err) {
        yamlParseError = true;
        logger.warn('ScoperAgent', `YAML parse failed: ${err instanceof Error ? err.message : String(err)}`);
        // Store raw text as fallback — don't crash
        scopeData = { _raw: parseResult.scopeYaml, _parseError: String(err) };
      }
    }

    // Write outputs to filesystem
    const reportDir = resolve(REPORTS_DIR, briefId);
    try {
      await mkdir(reportDir, { recursive: true });

      if (parseResult.scopeYaml) {
        await writeFile(resolve(reportDir, 'scope.yaml'), parseResult.scopeYaml, 'utf-8');
      }
      if (parseResult.clientDocument) {
        await writeFile(resolve(reportDir, 'scope-client.md'), parseResult.clientDocument, 'utf-8');
      }

      logger.log('ScoperAgent', `Files written to ${reportDir}`);
    } catch (err) {
      logger.error('ScoperAgent', `Failed to write report files: ${err}`);
      // Non-fatal — DB update is the primary storage
    }

    // Extract estimates from scope data
    // YAML schema wraps everything under `project_scope:`, so parsed object is { project_scope: { estimates: { ... } } }
    const projectScope = (scopeData.project_scope ?? scopeData) as Record<string, unknown>;
    const estimates = (projectScope.estimates ?? projectScope.estimate ?? {}) as Record<string, unknown>;
    const estimatedTasks = typeof estimates.total_tasks === 'number'
      ? estimates.total_tasks
      : null;
    const estimatedDuration = typeof estimates.duration_range === 'string'
      ? estimates.duration_range
      : null;
    const riskLevel = typeof estimates.risk_level === 'string'
      ? estimates.risk_level
      : null;

    // Insert into project_scopes table
    try {
      await db.insert(projectScopes).values({
        briefId,
        projectId: projectId || undefined,
        scopeData,
        clientDocument: parseResult.clientDocument || null,
        estimatedTasks,
        estimatedDuration,
        riskLevel,
        status: 'draft',
      });
      logger.log('ScoperAgent', 'Scope record created in database');
    } catch (err) {
      logger.error('ScoperAgent', `Failed to create scope record: ${err}`);
      // Non-fatal — filesystem output is the fallback
    }

    // Update brief status to 'scoped'
    try {
      await db.update(projectBriefs)
        .set({ status: 'scoped', updatedAt: new Date() })
        .where(eq(projectBriefs.id, briefId));
      logger.log('ScoperAgent', 'Brief status updated to scoped');
    } catch (err) {
      logger.error('ScoperAgent', `Failed to update brief status: ${err}`);
    }

    // Build summary
    const summary = yamlParseError
      ? `Scope generated with YAML parse warning. Files written to reports/${briefId}/`
      : `Scope generated: ${estimatedTasks ?? '?'} tasks, ${estimatedDuration ?? 'unknown'} duration, ${riskLevel ?? 'unknown'} risk`;

    logger.log('ScoperAgent', `Task ${taskId} completed: ${summary}`);

    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary,
      outputs: {
        generatedDir: reportDir,
        files: ['scope.yaml', 'scope-client.md'],
      },
    });

    return { success: true, summary };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('ScoperAgent', `Task ${taskId} failed: ${errorMessage}`);

    // Reset brief status on failure so it can be retried
    if (briefId) {
      try {
        await db.update(projectBriefs)
          .set({ status: 'received', updatedAt: new Date() })
          .where(eq(projectBriefs.id, briefId));
      } catch (err) {
        logger.error('ScoperAgent', 'Failed to reset brief status: ' + err);
      }
    }

    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Create and start the project scoper agent worker.
 */
export function createScoperWorker(): Worker<TaskJobData> {
  console.log(`[ScoperAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processScoperTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[ScoperAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[ScoperAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[ScoperAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[ScoperAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownScoperWorker(worker: Worker): Promise<void> {
  console.log('[ScoperAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[ScoperAgent] Shutdown complete');
}
