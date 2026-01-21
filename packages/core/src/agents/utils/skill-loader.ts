/**
 * Skill Loader Utility
 *
 * Dynamically loads SKILL file layers based on task complexity.
 * Reduces token usage by loading only what's needed.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to skills directory (from packages/core/src/agents/utils -> skills/)
const SKILLS_DIR = resolve(__dirname, '../../../../../skills');

export interface TaskComplexity {
  simple: boolean;      // Single endpoint, bug fix, health check
  database: boolean;    // Touches schema, migrations, queries
  newPattern: boolean;  // Auth, queues, websockets, first-time patterns
}

export type OrchestratorAction =
  | 'assign'
  | 'decompose'
  | 'review'
  | 'complete'
  | 'promote'
  | 'kickoff'
  | 'question';

/**
 * Classify task complexity from description.
 */
export function classifyTaskComplexity(description: string): TaskComplexity {
  const lower = description.toLowerCase();

  // Helper: check if word appears WITHOUT negation before it
  const hasWithoutNegation = (word: string): boolean => {
    const negationPatterns = [
      `no ${word}`,
      `not ${word}`,
      `without ${word}`,
      `don't ${word}`,
      `doesn't ${word}`,
      `no-${word}`,
    ];

    // If negation pattern exists, don't count it
    for (const pattern of negationPatterns) {
      if (lower.includes(pattern)) {
        return false;
      }
    }

    return lower.includes(word);
  };

  // Check for complex indicators
  const hasComplexIndicators = (
    hasWithoutNegation('feature') ||
    lower.includes('business logic') ||
    hasWithoutNegation('multiple') ||
    hasWithoutNegation('system') ||
    hasWithoutNegation('complex') ||
    hasWithoutNegation('integrate')
  );

  // Check for database work
  const isDatabase = (
    hasWithoutNegation('database') ||
    hasWithoutNegation('schema') ||
    hasWithoutNegation('table') ||
    hasWithoutNegation('migration') ||
    hasWithoutNegation('drizzle') ||
    hasWithoutNegation('filter') ||
    hasWithoutNegation('pagination') ||
    (hasWithoutNegation('query') && (lower.includes('param') || lower.includes('search')))
  );

  // Check for new patterns
  const isNewPattern = (
    hasWithoutNegation('auth') ||
    hasWithoutNegation('authentication') ||
    hasWithoutNegation('websocket') ||
    hasWithoutNegation('queue') ||
    hasWithoutNegation('bullmq') ||
    hasWithoutNegation('integration') ||
    lower.includes('initial setup') ||
    lower.includes('first time')
  );

  // Simple tasks: single endpoints, bug fixes, health checks
  const isSimple = (
    !hasComplexIndicators &&
    !isDatabase &&
    !isNewPattern &&
    (
      lower.includes('fix') ||
      lower.includes('bug') ||
      lower.includes('health') ||
      lower.includes('ping') ||
      lower.includes('simple') ||
      lower.includes('basic') ||
      (lower.includes('endpoint') && !lower.includes('endpoints'))
    )
  );

  return {
    simple: isSimple,
    database: isDatabase,
    newPattern: isNewPattern,
  };
}

/**
 * Select which SKILL layers to load for an agent.
 */
export function selectSkillLayers(
  agentType: string,
  complexity: TaskComplexity
): string[] {
  const base = `${SKILLS_DIR}/${agentType}`;

  // Always load core
  const layers: string[] = [`${base}/SKILL-${agentType}-core.md`];

  // Load patterns for non-simple tasks or database work
  if (!complexity.simple || complexity.database) {
    layers.push(`${base}/SKILL-${agentType}-patterns.md`);
  }

  // Load examples only for new patterns
  if (complexity.newPattern) {
    layers.push(`${base}/SKILL-${agentType}-examples.md`);
  }

  return layers;
}

/**
 * Load and combine SKILL content from layers.
 */
export async function loadSkillContent(layers: string[]): Promise<string> {
  // Always load common first
  const commonPath = `${SKILLS_DIR}/common/SKILL-common.md`;

  let common = '';
  try {
    common = await readFile(commonPath, 'utf-8');
  } catch (err) {
    console.warn('[SkillLoader] SKILL-common.md not found');
  }

  // Load agent-specific layers
  const layerContents = await Promise.all(
    layers.map(async (path) => {
      try {
        return await readFile(path, 'utf-8');
      } catch (err) {
        console.warn(`[SkillLoader] Layer not found: ${path}`);
        return '';
      }
    })
  );

  const combined = [common, ...layerContents].filter(Boolean).join('\n\n---\n\n');

  const estimatedTokens = Math.ceil(combined.length / 4);
  console.log(`[SkillLoader] Loaded ${layers.length} layers, ~${estimatedTokens} tokens`);

  return combined;
}

/**
 * Estimate tokens from text (rough: 4 chars ≈ 1 token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Main entry point: Load skills for a task.
 */
export async function loadSkillsForTask(
  agentType: string,
  taskDescription: string
): Promise<{ content: string; complexity: TaskComplexity; layers: string[]; tokens: number }> {
  const complexity = classifyTaskComplexity(taskDescription);
  const layers = selectSkillLayers(agentType, complexity);
  const content = await loadSkillContent(layers);
  const tokens = estimateTokens(content);

  console.log(`[SkillLoader] Task complexity:`, complexity);
  console.log(`[SkillLoader] Layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

  return { content, complexity, layers, tokens };
}

/**
 * Select SKILL layers for orchestrator based on action type.
 */
export function selectOrchestratorLayers(action: OrchestratorAction): string[] {
  const base = `${SKILLS_DIR}/orchestrator`;

  // Always load core
  const layers: string[] = [`${base}/SKILL-orchestrator-core.md`];

  switch (action) {
    case 'assign':
    case 'decompose':
    case 'question':
      layers.push(`${base}/SKILL-orchestrator-assignment.md`);
      break;

    case 'review':
    case 'complete':
    case 'promote':
      layers.push(`${base}/SKILL-orchestrator-quality.md`);
      break;

    case 'kickoff':
      // Project kickoff needs assignment + examples
      layers.push(`${base}/SKILL-orchestrator-assignment.md`);
      layers.push(`${base}/SKILL-orchestrator-examples.md`);
      break;
  }

  return layers;
}

/**
 * Detect orchestrator action from task/command description.
 */
export function detectOrchestratorAction(description: string): OrchestratorAction {
  const lower = description.toLowerCase();

  if (lower.includes('kickoff') || lower.includes('start project') || lower.includes('new project')) {
    return 'kickoff';
  }

  if (lower.includes('promote') || lower.includes('deploy') || lower.includes('release')) {
    return 'promote';
  }

  if (lower.includes('review') || lower.includes('complete') || lower.includes('verify') || lower.includes('gate')) {
    return 'review';
  }

  if (lower.includes('question') || lower.includes('answer') || lower.includes('decision')) {
    return 'question';
  }

  if (lower.includes('decompose') || lower.includes('break down') || lower.includes('plan')) {
    return 'decompose';
  }

  // Default to assign
  return 'assign';
}

/**
 * Load skills for orchestrator task.
 */
export async function loadSkillsForOrchestrator(
  description: string
): Promise<{ content: string; action: OrchestratorAction; layers: string[]; tokens: number }> {
  const action = detectOrchestratorAction(description);
  const layers = selectOrchestratorLayers(action);
  const content = await loadSkillContent(layers);
  const tokens = estimateTokens(content);

  console.log(`[SkillLoader] Orchestrator action: ${action}`);
  console.log(`[SkillLoader] Layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

  return { content, action, layers, tokens };
}
