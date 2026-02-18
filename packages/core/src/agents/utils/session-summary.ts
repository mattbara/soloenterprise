/**
 * Session Summary Extractor
 *
 * After each orchestrator run, extracts a compact summary of decisions made,
 * tasks planned, and questions asked. This summary is stored in task context
 * and injected on re-runs so Claude can continue from where it left off
 * without re-deriving everything from scratch.
 *
 * Uses Haiku for extraction (~$0.001 per call) to minimize overhead.
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordAgentCost } from '../../services/cost-tracking-service';

const SUMMARY_MODEL = 'claude-haiku-4-5-20251001';
const SUMMARY_MAX_TOKENS = 1024;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY required for session summary');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export interface SessionSummary {
  /** Compact summary of decisions, plans, and open items */
  summary: string;
  /** Number of tasks the orchestrator planned/created */
  tasksPlanned: number;
  /** Number of questions asked to the human */
  questionsAsked: number;
  /** Timestamp of this summary */
  timestamp: string;
  /** Token cost of the summary extraction */
  extractionTokens: { input: number; output: number };
}

/**
 * Extract a compact session summary from an orchestrator's response.
 * Returns null if extraction fails (non-blocking — orchestrator continues without summary).
 */
export async function extractSessionSummary(
  orchestratorResponse: string,
  taskName: string,
  previousSummary?: string,
  costContext?: { projectId: string; taskId: string },
): Promise<SessionSummary | null> {
  try {
    const client = getClient();

    const prompt = buildExtractionPrompt(orchestratorResponse, taskName, previousSummary);

    const response = await client.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    // Record cost if context provided
    if (costContext) {
      await recordAgentCost({
        projectId: costContext.projectId,
        taskId: costContext.taskId,
        agentType: 'orchestrator',
        model: SUMMARY_MODEL,
        tokensInput: response.usage?.input_tokens ?? 0,
        tokensOutput: response.usage?.output_tokens ?? 0,
        cachedTokens: 0,
        callSource: 'session-summary',
      });
    }

    const summary = text.text.trim();

    // Count tasks and questions from the summary text (rough heuristic)
    const tasksPlanned = (summary.match(/task/gi) || []).length;
    const questionsAsked = (summary.match(/question|asked|clarif/gi) || []).length;

    return {
      summary,
      tasksPlanned,
      questionsAsked,
      timestamp: new Date().toISOString(),
      extractionTokens: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0,
      },
    };
  } catch (err) {
    console.error('[SessionSummary] Extraction failed (non-blocking):', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function buildExtractionPrompt(
  orchestratorResponse: string,
  taskName: string,
  previousSummary?: string,
): string {
  const parts: string[] = [];

  parts.push('Extract a compact session summary from this orchestrator response. The summary will be used in a future prompt so the orchestrator can continue from where it left off.');
  parts.push('');

  if (previousSummary) {
    parts.push('## Previous Session Summary');
    parts.push(previousSummary);
    parts.push('');
    parts.push('Build on the previous summary — merge, don\'t duplicate.');
    parts.push('');
  }

  parts.push(`## Task: ${taskName}`);
  parts.push('');
  parts.push('## Orchestrator Response');
  // Truncate to keep Haiku call cheap — first 4000 chars is enough for summary
  parts.push(orchestratorResponse.slice(0, 4000));
  parts.push('');
  parts.push('## Instructions');
  parts.push('Write a concise summary (max 300 words) covering:');
  parts.push('1. **Decisions made**: Architecture choices, tech stack, task breakdown strategy');
  parts.push('2. **Tasks created**: List task names and their assigned agent types');
  parts.push('3. **Questions asked**: What was asked of the human and why');
  parts.push('4. **Open items**: What still needs to be decided or done next');
  parts.push('');
  parts.push('Write in plain text, no markdown headers. Be factual and specific — names, counts, agent types. Skip analysis/reasoning, just state what happened.');

  return parts.join('\n');
}

/**
 * Build the session context block for injection into the orchestrator prompt.
 * Returns empty string if no session summary exists.
 */
export function buildSessionContextBlock(sessionSummary: string | undefined): string {
  if (!sessionSummary) return '';

  return [
    '\n**Session State (your previous decisions — continue from here, do NOT re-derive):**',
    sessionSummary,
    '',
    '**IMPORTANT:** The above is what you previously decided. Build on these decisions. Do NOT start over or re-analyze from scratch. Focus only on what\'s new or changed since your last response.',
    '',
  ].join('\n');
}
