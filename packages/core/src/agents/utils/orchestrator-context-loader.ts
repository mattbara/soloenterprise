/**
 * Orchestrator Context Loader
 *
 * Loads project state from database for orchestrator agent prompts.
 * Unlike other agents, orchestrator needs project/task state, NOT code context.
 *
 * Provides:
 * - Project info and status
 * - Active and blocked tasks
 * - File locks (to prevent conflicts)
 * - Pending questions (to avoid duplicates)
 * - Recent completions (for context)
 */

import { db } from '@soloenterprise/db';
import { projects, tasks, questions, fileLocks, projectScopes } from '@soloenterprise/db/schema';
import { eq, desc, and, or, inArray, isNull, gt } from 'drizzle-orm';

const CHARS_PER_TOKEN = 4;
const RECENT_COMPLETIONS_LIMIT = 5;

export interface OrchestratorContextResult {
  content: string;
  tokens: number;
  // Metrics for logging
  activeTaskCount: number;
  blockedTaskCount: number;
  pendingQuestionCount: number;
  lockedFileCount: number;
  // Scope data (loaded from projectScopes via projects.scopeId)
  scopeData: Record<string, unknown> | null;
  clientDocument: string | null;
}

/**
 * Build orchestrator context from database.
 */
export async function buildOrchestratorContext(projectId: string): Promise<OrchestratorContextResult> {
  const sections: string[] = [];

  // 1. Load project info
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    console.warn(`[OrchestratorContextLoader] Project not found: ${projectId}`);
    return getEmptyOrchestratorContextResult();
  }

  // Load scope data if project has a scopeId
  let scopeData: Record<string, unknown> | null = null;
  let clientDocument: string | null = null;

  if (project.scopeId) {
    try {
      const scope = await db.query.projectScopes.findFirst({
        where: eq(projectScopes.id, project.scopeId),
      });
      if (scope) {
        scopeData = scope.scopeData as Record<string, unknown>;
        clientDocument = scope.clientDocument;
      }
    } catch (err) {
      console.warn(`[OrchestratorContextLoader] Failed to load scope data: ${err}`);
    }
  }

  sections.push('## Project State\n');
  sections.push(`**Project:** ${project.name}`);
  sections.push(`**Status:** ${project.status}`);
  if (project.description) {
    sections.push(`**Description:** ${project.description}`);
  }
  if (project.config?.techStack?.length) {
    sections.push(`**Tech Stack:** ${project.config.techStack.join(', ')}`);
  }
  sections.push('');

  // 2. Load all non-archived tasks for this project
  const allTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      or(eq(tasks.archived, false), isNull(tasks.archived))
    ),
    orderBy: [desc(tasks.priority), desc(tasks.createdAt)],
  });

  // Categorize tasks
  const activeTasks = allTasks.filter(t =>
    ['pending', 'queued', 'running', 'waiting_human', 'processing_answer'].includes(t.status)
  );
  const blockedTasks = allTasks.filter(t => t.status === 'blocked');
  const recentlyCompleted = allTasks
    .filter(t => t.status === 'completed')
    .slice(0, RECENT_COMPLETIONS_LIMIT);

  // 3. Active Tasks Section
  sections.push(`### Active Tasks (${activeTasks.length})\n`);
  if (activeTasks.length > 0) {
    sections.push('| ID | Name | Agent | Status | Priority | Blocked By |');
    sections.push('|-----|------|-------|--------|----------|------------|');
    for (const task of activeTasks) {
      const shortId = task.id.slice(0, 8);
      const blockedBy = task.dependsOn?.length
        ? task.dependsOn.map(id => id.slice(0, 8)).join(', ')
        : '-';
      sections.push(`| ${shortId} | ${truncateName(task.name, 30)} | ${task.agentType} | ${task.status} | ${task.priority} | ${blockedBy} |`);
    }
  } else {
    sections.push('*No active tasks*');
  }
  sections.push('');

  // 4. Blocked Tasks Section
  sections.push(`### Blocked Tasks (${blockedTasks.length})\n`);
  if (blockedTasks.length > 0) {
    sections.push('| ID | Name | Agent | Waiting For |');
    sections.push('|-----|------|-------|-------------|');
    for (const task of blockedTasks) {
      const shortId = task.id.slice(0, 8);
      const waitingFor = task.dependsOn?.length
        ? task.dependsOn.map(id => id.slice(0, 8)).join(', ')
        : 'unknown';
      sections.push(`| ${shortId} | ${truncateName(task.name, 30)} | ${task.agentType} | ${waitingFor} |`);
    }
  } else {
    sections.push('*No blocked tasks*');
  }
  sections.push('');

  // 5. File Locks Section
  const locks = await db.query.fileLocks.findMany({
    where: gt(fileLocks.expiresAt, new Date()),
  });

  // Filter to locks related to this project's tasks
  const projectTaskIds = allTasks.map(t => t.id);
  const projectLocks = locks.filter(l => projectTaskIds.includes(l.taskId));

  sections.push(`### File Locks (${projectLocks.length})\n`);
  if (projectLocks.length > 0) {
    sections.push('| File | Locked By Task | Agent |');
    sections.push('|------|----------------|-------|');
    for (const lock of projectLocks) {
      const shortTaskId = lock.taskId.slice(0, 8);
      sections.push(`| ${lock.filePath} | ${shortTaskId} | ${lock.agentType} |`);
    }
  } else {
    sections.push('*No active file locks*');
  }
  sections.push('');

  // 6. Pending Questions Section
  const pendingQuestions = await db.query.questions.findMany({
    where: and(
      eq(questions.projectId, projectId),
      eq(questions.status, 'pending')
    ),
    orderBy: [desc(questions.priority), desc(questions.createdAt)],
  });

  sections.push(`### Pending Questions (${pendingQuestions.length})\n`);
  if (pendingQuestions.length > 0) {
    sections.push('| Task | Question | Priority | Blocking |');
    sections.push('|------|----------|----------|----------|');
    for (const q of pendingQuestions) {
      const shortTaskId = q.taskId ? q.taskId.slice(0, 8) : '-';
      const questionPreview = truncateName(q.question, 40);
      sections.push(`| ${shortTaskId} | ${questionPreview} | ${q.priority} | ${q.isBlocking ? 'yes' : 'no'} |`);
    }
    sections.push('');
    sections.push('**IMPORTANT:** Do NOT ask duplicate questions. Check the list above before asking.');
  } else {
    sections.push('*No pending questions*');
  }
  sections.push('');

  // 7. Recently Completed Section
  sections.push(`### Recently Completed (last ${RECENT_COMPLETIONS_LIMIT})\n`);
  if (recentlyCompleted.length > 0) {
    for (const task of recentlyCompleted) {
      const shortId = task.id.slice(0, 8);
      const timeAgo = getTimeAgo(task.completedAt);
      const summary = (task.result as any)?.summary || 'completed';
      sections.push(`- **${shortId}:** ${truncateName(task.name, 40)} (${task.agentType}) - ${timeAgo}`);
      if (summary !== 'completed') {
        sections.push(`  *${truncateName(summary, 60)}*`);
      }
    }
  } else {
    sections.push('*No recently completed tasks*');
  }
  sections.push('');

  // 8. Task Dependencies Summary (if any complex dependencies exist)
  const tasksWithDeps = allTasks.filter(t => t.dependsOn?.length);
  if (tasksWithDeps.length > 0) {
    sections.push('### Task Dependencies\n');
    for (const task of tasksWithDeps.slice(0, 10)) { // Limit to 10 for token savings
      const shortId = task.id.slice(0, 8);
      const deps = task.dependsOn!.map(id => id.slice(0, 8)).join(', ');
      sections.push(`- ${shortId} (${task.name}) depends on: ${deps}`);
    }
    if (tasksWithDeps.length > 10) {
      sections.push(`- ... and ${tasksWithDeps.length - 10} more with dependencies`);
    }
    sections.push('');
  }

  sections.push('---\n');

  const content = sections.join('\n');
  const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  console.log(`[OrchestratorContextLoader] Loaded context for project ${project.name}: ${activeTasks.length} active, ${blockedTasks.length} blocked, ${pendingQuestions.length} questions, ${projectLocks.length} locks, ~${tokens} tokens`);

  return {
    content,
    tokens,
    activeTaskCount: activeTasks.length,
    blockedTaskCount: blockedTasks.length,
    pendingQuestionCount: pendingQuestions.length,
    lockedFileCount: projectLocks.length,
    scopeData,
    clientDocument,
  };
}

/**
 * Get empty context result for error cases.
 */
export function getEmptyOrchestratorContextResult(): OrchestratorContextResult {
  return {
    content: '',
    tokens: 0,
    activeTaskCount: 0,
    blockedTaskCount: 0,
    pendingQuestionCount: 0,
    lockedFileCount: 0,
    scopeData: null,
    clientDocument: null,
  };
}

/**
 * Truncate a name/string for table display.
 */
function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 3) + '...';
}

/**
 * Get human-readable time ago string.
 */
function getTimeAgo(date: Date | null): string {
  if (!date) return 'unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
