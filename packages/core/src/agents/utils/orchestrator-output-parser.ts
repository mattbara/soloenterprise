/**
 * Orchestrator Output Parser
 *
 * Parses YAML output from the orchestrator agent.
 * Handles action plans, task definitions, questions, and status updates.
 */

import { parse as parseYaml } from 'yaml';

// ============================================================================
// Types
// ============================================================================

export type AgentType = 'backend' | 'frontend' | 'qa' | 'devops';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'blocked' | 'completed' | 'failed';
export type QuestionCategory = 'architecture' | 'design' | 'security' | 'technical' | 'strategic';
export type QuestionPriority = 'critical' | 'high' | 'medium';
export type FileLockAction = 'acquire' | 'release';
export type OrchestratorActionType =
  | 'decompose_project'
  | 'decompose_requirements'
  | 'decompose_and_assign'
  | 'analyze_existing_tasks'
  | 'assign_task'
  | 'complete_task'
  | 'create_question'
  | 'promote_environment'
  | 'answer_pending_question'  // Orchestrator answering its own questions
  | 'review_progress'          // Orchestrator checking task status
  | 'reassign_task'            // Moving task to different agent
  | 'cancel_task'              // Canceling a task
  | 'unblock_task'             // Manually unblocking a task
  | 'retry_task';              // Retrying a failed task

export interface OrchestratorTaskDefinition {
  id?: string;
  name: string;
  description: string;
  agent: AgentType;
  priority: TaskPriority;
  dependencies?: string[];
  fileLocks?: string[];
}

export interface OrchestratorQuestion {
  question: string;
  category: QuestionCategory;
  priority: QuestionPriority;
  context?: string;
}

export interface OrchestratorStatusUpdate {
  taskId: string;
  status: TaskStatus;
  oldStatus?: TaskStatus | null;
  reason?: string;
}

export interface OrchestratorFileLock {
  action: FileLockAction;
  path: string;
  taskId: string;
}

export interface OrchestratorParseResult {
  success: boolean;
  action?: OrchestratorActionType;
  tasks: OrchestratorTaskDefinition[];
  questions: OrchestratorQuestion[];
  statusUpdates: OrchestratorStatusUpdate[];
  fileLocks: OrchestratorFileLock[];
  rawYaml?: string;
  error?: string;
}

// ============================================================================
// Validation helpers
// ============================================================================

const VALID_AGENTS: AgentType[] = ['backend', 'frontend', 'qa', 'devops'];
const VALID_TASK_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_TASK_STATUSES: TaskStatus[] = ['pending', 'queued', 'running', 'blocked', 'completed', 'failed'];
const VALID_QUESTION_CATEGORIES: QuestionCategory[] = ['architecture', 'design', 'security', 'technical', 'strategic'];
const VALID_QUESTION_PRIORITIES: QuestionPriority[] = ['critical', 'high', 'medium'];
const VALID_FILE_LOCK_ACTIONS: FileLockAction[] = ['acquire', 'release'];
const VALID_ACTIONS: OrchestratorActionType[] = [
  'decompose_project',
  'decompose_requirements',
  'decompose_and_assign',
  'analyze_existing_tasks',
  'assign_task',
  'complete_task',
  'create_question',
  'promote_environment',
  'answer_pending_question',
  'review_progress',
  'reassign_task',
  'cancel_task',
  'unblock_task',
  'retry_task',
];

function isValidAgent(value: unknown): value is AgentType {
  return typeof value === 'string' && VALID_AGENTS.includes(value as AgentType);
}

function isValidTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && VALID_TASK_PRIORITIES.includes(value as TaskPriority);
}

function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && VALID_TASK_STATUSES.includes(value as TaskStatus);
}

function isValidQuestionCategory(value: unknown): value is QuestionCategory {
  return typeof value === 'string' && VALID_QUESTION_CATEGORIES.includes(value as QuestionCategory);
}

function isValidQuestionPriority(value: unknown): value is QuestionPriority {
  return typeof value === 'string' && VALID_QUESTION_PRIORITIES.includes(value as QuestionPriority);
}

function isValidFileLockAction(value: unknown): value is FileLockAction {
  return typeof value === 'string' && VALID_FILE_LOCK_ACTIONS.includes(value as FileLockAction);
}

function isValidAction(value: unknown): value is OrchestratorActionType {
  return typeof value === 'string' && VALID_ACTIONS.includes(value as OrchestratorActionType);
}

// ============================================================================
// YAML Extraction
// ============================================================================

/**
 * Extract YAML content from response text.
 * Handles markdown code blocks (```yaml ... ```) and raw YAML.
 */
function extractYamlContent(responseText: string): string | null {
  // Try to find YAML in markdown code block first
  const yamlBlockRegex = /```(?:yaml|yml)\s*\n([\s\S]*?)\n```/i;
  const match = responseText.match(yamlBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Try generic code block
  const genericBlockRegex = /```\s*\n([\s\S]*?)\n```/;
  const genericMatch = responseText.match(genericBlockRegex);
  if (genericMatch && genericMatch[1]) {
    // Check if it looks like YAML (has key: value patterns)
    const content = genericMatch[1].trim();
    if (content.includes(':') && !content.startsWith('{')) {
      return content;
    }
  }

  // Check if the entire response looks like YAML
  const trimmed = responseText.trim();
  if (trimmed.startsWith('action:') || trimmed.startsWith('tasks:') || trimmed.startsWith('questions:')) {
    return trimmed;
  }

  // Look for YAML-like content anywhere in the response
  const lines = responseText.split('\n');
  const yamlStartIdx = lines.findIndex(line =>
    line.trim().startsWith('action:') ||
    line.trim().startsWith('tasks:') ||
    line.trim().startsWith('questions:') ||
    line.trim().startsWith('status_updates:') ||
    line.trim().startsWith('file_locks:')
  );

  if (yamlStartIdx >= 0) {
    // Find where YAML ends (next non-YAML content or end)
    let yamlEndIdx = lines.length;
    for (let i = yamlStartIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // If we hit a line that's clearly not YAML (like prose with no colon), stop
      if (line.trim() && !line.trim().startsWith('-') && !line.includes(':') && !line.startsWith(' ') && !line.startsWith('\t')) {
        yamlEndIdx = i;
        break;
      }
    }
    return lines.slice(yamlStartIdx, yamlEndIdx).join('\n').trim();
  }

  return null;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a task definition from raw YAML object.
 */
function parseTaskDefinition(raw: unknown, index: number): OrchestratorTaskDefinition | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[OrchestratorParser] Task at index ${index} is not an object`);
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    console.warn(`[OrchestratorParser] Task at index ${index} missing required 'name' field`);
    return null;
  }

  if (typeof obj.description !== 'string' || !obj.description.trim()) {
    console.warn(`[OrchestratorParser] Task at index ${index} missing required 'description' field`);
    return null;
  }

  if (!isValidAgent(obj.agent)) {
    console.warn(`[OrchestratorParser] Task at index ${index} has invalid agent '${obj.agent}', expected one of: ${VALID_AGENTS.join(', ')}`);
    return null;
  }

  // Use default priority if not specified or invalid
  let priority: TaskPriority = 'medium';
  if (isValidTaskPriority(obj.priority)) {
    priority = obj.priority;
  } else if (obj.priority !== undefined) {
    console.warn(`[OrchestratorParser] Task at index ${index} has invalid priority '${obj.priority}', defaulting to 'medium'`);
  }

  const task: OrchestratorTaskDefinition = {
    name: obj.name.trim(),
    description: obj.description.trim(),
    agent: obj.agent,
    priority,
  };

  // Optional fields
  if (typeof obj.id === 'string' && obj.id.trim()) {
    task.id = obj.id.trim();
  }

  // Extract dependencies from multiple possible locations:
  // - obj.dependencies (root level)
  // - obj.inputs.dependencies (nested under inputs)
  // - obj.depends_on (snake_case variant)
  // - obj.inputs.depends_on (nested snake_case variant)
  const inputs = obj.inputs as Record<string, unknown> | undefined;
  const rawDependencies =
    obj.dependencies ??
    inputs?.dependencies ??
    obj.depends_on ??
    inputs?.depends_on;

  if (Array.isArray(rawDependencies)) {
    task.dependencies = rawDependencies
      .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      .map(d => d.trim());

    if (task.dependencies.length > 0) {
      console.log(`[OrchestratorParser] Task "${task.name}" has dependencies: [${task.dependencies.join(', ')}]`);
    }
  }

  if (Array.isArray(obj.file_locks) || Array.isArray(obj.fileLocks)) {
    const locks = obj.file_locks ?? obj.fileLocks;
    task.fileLocks = (locks as unknown[])
      .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
      .map(l => l.trim());
  }

  return task;
}

/**
 * Parse a question from raw YAML object.
 */
function parseQuestion(raw: unknown, index: number): OrchestratorQuestion | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[OrchestratorParser] Question at index ${index} is not an object`);
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.question !== 'string' || !obj.question.trim()) {
    console.warn(`[OrchestratorParser] Question at index ${index} missing required 'question' field`);
    return null;
  }

  // Use default category if not specified or invalid
  let category: QuestionCategory = 'technical';
  if (isValidQuestionCategory(obj.category)) {
    category = obj.category;
  } else if (obj.category !== undefined) {
    console.warn(`[OrchestratorParser] Question at index ${index} has invalid category '${obj.category}', defaulting to 'technical'`);
  }

  // Use default priority if not specified or invalid
  let priority: QuestionPriority = 'high';
  if (isValidQuestionPriority(obj.priority)) {
    priority = obj.priority;
  } else if (obj.priority !== undefined) {
    console.warn(`[OrchestratorParser] Question at index ${index} has invalid priority '${obj.priority}', defaulting to 'high'`);
  }

  const question: OrchestratorQuestion = {
    question: obj.question.trim(),
    category,
    priority,
  };

  if (typeof obj.context === 'string' && obj.context.trim()) {
    question.context = obj.context.trim();
  }

  return question;
}

/**
 * Parse a status update from raw YAML object.
 * Handles multiple property name formats:
 * - new_status / newStatus / status for the target status
 * - old_status / oldStatus for the previous status (optional)
 * - task_id / taskId for the task identifier
 */
function parseStatusUpdate(raw: unknown, index: number): OrchestratorStatusUpdate | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[OrchestratorParser] Status update at index ${index} is not an object`);
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Debug: log raw data to help diagnose parsing issues
  console.log(`[OrchestratorParser] Raw status update ${index}:`, JSON.stringify(obj));

  // Validate required fields - check multiple property name formats
  const taskId = obj.task_id ?? obj.taskId;
  if (typeof taskId !== 'string' || !taskId.trim()) {
    console.warn(`[OrchestratorParser] Status update at index ${index} missing required 'task_id' field`);
    console.warn(`[OrchestratorParser] Available fields: ${Object.keys(obj).join(', ')}`);
    return null;
  }

  // Check multiple property names for new status (orchestrator outputs new_status)
  const newStatus = obj.new_status ?? obj.newStatus ?? obj.status;

  if (!newStatus) {
    console.warn(`[OrchestratorParser] Status update at index ${index} for task ${taskId} missing new_status/newStatus/status field`);
    console.warn(`[OrchestratorParser] Available fields: ${Object.keys(obj).join(', ')}`);
    return null;
  }

  if (!isValidTaskStatus(newStatus)) {
    console.warn(`[OrchestratorParser] Status update at index ${index} has invalid status '${newStatus}', expected one of: ${VALID_TASK_STATUSES.join(', ')}`);
    return null;
  }

  const update: OrchestratorStatusUpdate = {
    taskId: (taskId as string).trim(),
    status: newStatus as TaskStatus,
  };

  // Optional: capture old status for logging/debugging
  const oldStatus = obj.old_status ?? obj.oldStatus;
  if (oldStatus && isValidTaskStatus(oldStatus)) {
    update.oldStatus = oldStatus as TaskStatus;
  }

  // Capture reason from multiple possible fields
  const reason = obj.reason ?? obj.note ?? obj.message;
  if (typeof reason === 'string' && reason.trim()) {
    update.reason = reason.trim();
  }

  return update;
}

/**
 * Parse a file lock operation from raw YAML object.
 */
function parseFileLock(raw: unknown, index: number): OrchestratorFileLock | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[OrchestratorParser] File lock at index ${index} is not an object`);
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields
  if (!isValidFileLockAction(obj.action)) {
    console.warn(`[OrchestratorParser] File lock at index ${index} has invalid action '${obj.action}', expected one of: ${VALID_FILE_LOCK_ACTIONS.join(', ')}`);
    return null;
  }

  if (typeof obj.path !== 'string' || !obj.path.trim()) {
    console.warn(`[OrchestratorParser] File lock at index ${index} missing required 'path' field`);
    return null;
  }

  const taskId = obj.task_id ?? obj.taskId;
  if (typeof taskId !== 'string' || !taskId.trim()) {
    console.warn(`[OrchestratorParser] File lock at index ${index} missing required 'task_id' field`);
    return null;
  }

  return {
    action: obj.action,
    path: obj.path.trim(),
    taskId: taskId.trim(),
  };
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse orchestrator output from response text.
 */
export function parseOrchestratorOutput(responseText: string): OrchestratorParseResult {
  // Initialize empty result
  const result: OrchestratorParseResult = {
    success: false,
    tasks: [],
    questions: [],
    statusUpdates: [],
    fileLocks: [],
  };

  if (!responseText || typeof responseText !== 'string') {
    result.error = 'Empty or invalid response text';
    return result;
  }

  // Extract YAML content
  const yamlContent = extractYamlContent(responseText);

  if (!yamlContent) {
    result.error = 'No YAML content found in response';
    result.rawYaml = responseText.substring(0, 500); // Include truncated raw for debugging
    return result;
  }

  result.rawYaml = yamlContent;

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    result.error = `YAML parse error: ${err instanceof Error ? err.message : 'Unknown error'}`;
    return result;
  }

  if (!parsed || typeof parsed !== 'object') {
    result.error = 'Parsed YAML is not an object';
    return result;
  }

  const data = parsed as Record<string, unknown>;

  // Parse action - be lenient, accept any string action but warn on unknown
  if (typeof data.action === 'string' && data.action.trim()) {
    if (isValidAction(data.action)) {
      result.action = data.action;
    } else {
      // Accept unknown actions but log warning - don't block parsing
      console.warn(`[OrchestratorParser] Unrecognized action '${data.action}', proceeding anyway (known actions: ${VALID_ACTIONS.join(', ')})`);
      result.action = data.action as OrchestratorActionType;
    }
  }

  // Parse tasks
  if (Array.isArray(data.tasks)) {
    for (let i = 0; i < data.tasks.length; i++) {
      const task = parseTaskDefinition(data.tasks[i], i);
      if (task) {
        result.tasks.push(task);
      }
    }
  }

  // Parse questions
  if (Array.isArray(data.questions)) {
    for (let i = 0; i < data.questions.length; i++) {
      const question = parseQuestion(data.questions[i], i);
      if (question) {
        result.questions.push(question);
      }
    }
  }

  // Parse status updates (handle both snake_case and camelCase)
  const statusUpdates = data.status_updates ?? data.statusUpdates;
  if (Array.isArray(statusUpdates)) {
    for (let i = 0; i < statusUpdates.length; i++) {
      const update = parseStatusUpdate(statusUpdates[i], i);
      if (update) {
        result.statusUpdates.push(update);
      }
    }
  }

  // Parse file locks (handle both snake_case and camelCase)
  const fileLocks = data.file_locks ?? data.fileLocks;
  if (Array.isArray(fileLocks)) {
    for (let i = 0; i < fileLocks.length; i++) {
      const lock = parseFileLock(fileLocks[i], i);
      if (lock) {
        result.fileLocks.push(lock);
      }
    }
  }

  // Mark as successful if we parsed at least something meaningful
  const hasContent =
    result.action !== undefined ||
    result.tasks.length > 0 ||
    result.questions.length > 0 ||
    result.statusUpdates.length > 0 ||
    result.fileLocks.length > 0;

  if (hasContent) {
    result.success = true;
  } else {
    result.error = 'YAML parsed but contained no recognizable orchestrator commands';
  }

  console.log(`[OrchestratorParser] Parsed: action=${result.action ?? 'none'}, tasks=${result.tasks.length}, questions=${result.questions.length}, statusUpdates=${result.statusUpdates.length}, fileLocks=${result.fileLocks.length}`);

  return result;
}

/**
 * Get an empty parse result for error cases.
 */
export function getEmptyParseResult(): OrchestratorParseResult {
  return {
    success: false,
    tasks: [],
    questions: [],
    statusUpdates: [],
    fileLocks: [],
  };
}
