/**
 * Skill Loader Utility
 *
 * Dynamically loads SKILL file layers based on task complexity.
 * Specialized SKILL files are auto-discovered via <!-- Load When: ... --> headers.
 * Reduces token usage by loading only what's needed.
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to skills directory (from packages/core/src/agents/utils -> skills/)
const SKILLS_DIR = resolve(__dirname, '../../../../../skills');

// Standard layer filenames — handled by the existing system, excluded from header-based discovery
const STANDARD_LAYERS = ['core', 'patterns', 'examples'];

/**
 * Parse the <!-- Load When: ... --> header from a SKILL file's content.
 * Returns an array of lowercase keyword phrases, or null if no header found.
 */
export function parseLoadWhenHeader(content: string): string[] | null {
  const match = content.match(/<!--\s*Load When:\s*(.+?)\s*-->/i);
  if (!match) return null;
  return match[1].split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
}

/**
 * Check if a task description matches any of the Load When keywords.
 * "always" matches everything. Other keywords are matched as substrings.
 */
export function matchesLoadCondition(taskDescription: string, keywords: string[]): boolean {
  const lower = taskDescription.toLowerCase();
  for (const keyword of keywords) {
    if (keyword === 'always') return true;
    // Split multi-word keywords by / to support "route/page/layout" syntax
    const alternatives = keyword.split('/').map(k => k.trim());
    for (const alt of alternatives) {
      if (alt && lower.includes(alt)) return true;
    }
  }
  return false;
}

/**
 * Discover specialized SKILL files in an agent's directory that match the task.
 * Reads all SKILL-{agent}-*.md files, parses their Load When headers,
 * and returns paths of files whose conditions match the task description.
 * Excludes core/patterns/examples (handled by the existing layer system).
 */
export async function discoverSpecializedSkills(
  agentType: string,
  taskDescription: string
): Promise<string[]> {
  const agentDir = `${SKILLS_DIR}/${agentType}`;
  const prefix = `SKILL-${agentType}-`;

  let files: string[];
  try {
    files = await readdir(agentDir);
  } catch {
    return [];
  }

  // Filter to SKILL files, excluding standard layers
  const candidates = files.filter(f => {
    if (!f.startsWith(prefix) || !f.endsWith('.md')) return false;
    const layerName = f.slice(prefix.length, -3); // Remove prefix and .md
    return !STANDARD_LAYERS.includes(layerName);
  });

  if (candidates.length === 0) return [];

  // Read headers in parallel and match against task
  const matched: string[] = [];
  await Promise.all(
    candidates.map(async (filename) => {
      const filepath = `${agentDir}/${filename}`;
      try {
        // Read only the first 500 bytes — header is always at the top
        const fd = await readFile(filepath, 'utf-8');
        const headerSlice = fd.slice(0, 500);
        const keywords = parseLoadWhenHeader(headerSlice);
        if (keywords && matchesLoadCondition(taskDescription, keywords)) {
          matched.push(filepath);
        }
      } catch {
        // File unreadable — skip silently
      }
    })
  );

  return matched.sort(); // Deterministic order
}

/**
 * Discover specialized common SKILL files that match the task.
 * Scans skills/common/ for non-standard SKILL files with matching Load When headers.
 */
export async function discoverCommonSkills(
  taskDescription: string
): Promise<string[]> {
  const commonDir = `${SKILLS_DIR}/common`;

  let files: string[];
  try {
    files = await readdir(commonDir);
  } catch {
    return [];
  }

  // Filter to SKILL files, excluding the main SKILL-common.md (already loaded)
  const candidates = files.filter(f =>
    f.startsWith('SKILL-common-') && f.endsWith('.md')
  );

  if (candidates.length === 0) return [];

  const matched: string[] = [];
  await Promise.all(
    candidates.map(async (filename) => {
      const filepath = `${commonDir}/${filename}`;
      try {
        const fd = await readFile(filepath, 'utf-8');
        const headerSlice = fd.slice(0, 500);
        const keywords = parseLoadWhenHeader(headerSlice);
        if (keywords && matchesLoadCondition(taskDescription, keywords)) {
          matched.push(filepath);
        }
      } catch {
        // Skip
      }
    })
  );

  return matched.sort();
}

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
 * Loads standard layers (core/patterns/examples) plus any specialized SKILL files
 * whose <!-- Load When: ... --> headers match the task description.
 */
export async function loadSkillsForTask(
  agentType: string,
  taskDescription: string
): Promise<{ content: string; complexity: TaskComplexity; layers: string[]; tokens: number }> {
  const complexity = classifyTaskComplexity(taskDescription);
  const layers = selectSkillLayers(agentType, complexity);

  // Discover specialized skills (agent-specific + common) in parallel
  const [specializedAgent, specializedCommon] = await Promise.all([
    discoverSpecializedSkills(agentType, taskDescription),
    discoverCommonSkills(taskDescription),
  ]);

  // Append specialized files after standard layers
  const allLayers = [...layers, ...specializedAgent, ...specializedCommon];

  const content = await loadSkillContent(allLayers);
  const tokens = estimateTokens(content);

  console.log(`[SkillLoader] Task complexity:`, complexity);
  console.log(`[SkillLoader] Layers: ${allLayers.map(l => l.split('/').pop()).join(', ')}`);
  if (specializedAgent.length > 0 || specializedCommon.length > 0) {
    console.log(`[SkillLoader] Specialized: ${[...specializedAgent, ...specializedCommon].map(l => l.split('/').pop()).join(', ')}`);
  }

  return { content, complexity, layers: allLayers, tokens };
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

  if (lower.includes('decompose') || lower.includes('break down') || lower.includes('plan') || lower.includes('build a complete') || lower.includes('build a full')) {
    return 'decompose';
  }

  if (lower.includes('promote') || lower.includes('deploy') || lower.includes('release')) {
    return 'promote';
  }

  if (lower.includes('review') || lower.includes('verify') || lower.includes('gate') ||
      lower.includes('complete task') || lower.includes('mark complete') || lower.includes('mark as complete')) {
    return 'review';
  }

  if (lower.includes('question') || lower.includes('answer') || lower.includes('decision')) {
    return 'question';
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
