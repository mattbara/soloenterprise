/**
 * Project Context Loader
 *
 * Builds context for business agents (Client Reporter, etc.).
 *
 * Unlike engineering agents, business agents need:
 * - Project metadata (name, status, dates)
 * - Client info (name, contact)
 * - Task summary by status and agent type
 * - Milestone progress
 * - Scope document
 * - Blocking questions
 * - Cost summary
 *
 * They do NOT need:
 * - Code files, schema, routes
 * - File locks, dependency artifacts
 * - SKILL files (loaded separately by skill-loader)
 */

import { db } from '@soloenterprise/db';
import {
  projects,
  clients,
  tasks,
  milestones,
  projectScopes,
  questions,
  costTracking,
} from '@soloenterprise/db/schema';
import { eq, and, sql, desc, count } from 'drizzle-orm';

// ============================================================================
// Project Complexity Assessment
// ============================================================================

export type ProjectComplexity = 'simple' | 'moderate' | 'complex';

const TASK_THRESHOLD = parseInt(process.env.COMPLEXITY_TASK_THRESHOLD || '15', 10);
const DEP_THRESHOLD = parseInt(process.env.COMPLEXITY_DEP_THRESHOLD || '40', 10);
const FAILURE_THRESHOLD = parseFloat(process.env.COMPLEXITY_FAILURE_THRESHOLD || '0.2');

/**
 * Assess project complexity based on task count, dependencies, blocking questions, and failure rate.
 * Used by model-selector to decide Opus vs Sonnet for the orchestrator.
 */
export async function assessProjectComplexity(projectId: string): Promise<ProjectComplexity> {
  try {
    // Count total tasks
    const [taskCountResult] = await db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    const taskCount = taskCountResult?.value ?? 0;

    // Count tasks with dependencies (proxy for dependency complexity)
    const allTasks = await db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      columns: { id: true, dependsOn: true, status: true },
    });

    let depCount = 0;
    let failedCount = 0;
    for (const task of allTasks) {
      if (task.dependsOn?.length) {
        depCount += task.dependsOn.length;
      }
      if (task.status === 'failed') {
        failedCount++;
      }
    }

    // Count blocking questions
    const [blockingResult] = await db
      .select({ value: count() })
      .from(questions)
      .where(and(
        eq(questions.projectId, projectId),
        eq(questions.status, 'pending'),
        eq(questions.isBlocking, true),
      ));
    const blockingQuestions = blockingResult?.value ?? 0;

    // Failure rate
    const failureRate = taskCount > 0 ? failedCount / taskCount : 0;

    // Complex if ANY threshold is exceeded
    if (taskCount > TASK_THRESHOLD || depCount > DEP_THRESHOLD || failureRate > FAILURE_THRESHOLD) {
      return 'complex';
    }

    // Simple if very small project with no blockers
    if (taskCount <= 5 && depCount <= 5 && blockingQuestions === 0 && failureRate === 0) {
      return 'simple';
    }

    return 'moderate';
  } catch (err) {
    console.warn(`[ProjectContextLoader] Failed to assess complexity for ${projectId}, defaulting to moderate:`, err);
    return 'moderate';
  }
}

/**
 * Build a structured context string for business agents.
 *
 * Each section handles missing data gracefully — a brand new project
 * with zero tasks/milestones/costs will not crash, just show "No data".
 */
export async function buildProjectContext(projectId: string): Promise<string> {
  const sections: string[] = [];

  // 1. Project details + client info
  try {
    const projectRows = await db
      .select({
        name: projects.name,
        description: projects.description,
        status: projects.status,
        createdAt: projects.createdAt,
        completedAt: projects.completedAt,
        currentMilestone: projects.currentMilestone,
        clientId: projects.clientId,
        scopeId: projects.scopeId,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (projectRows.length === 0) {
      return `## Error\nProject ${projectId} not found.`;
    }

    const project = projectRows[0];
    sections.push('## Project Details');
    sections.push(`Name: ${project.name}`);
    if (project.description) sections.push(`Description: ${project.description}`);
    sections.push(`Status: ${project.status}`);
    sections.push(`Started: ${project.createdAt.toISOString().split('T')[0]}`);
    if (project.completedAt) {
      sections.push(`Completed: ${project.completedAt.toISOString().split('T')[0]}`);
    }
    if (project.currentMilestone) {
      sections.push(`Current Milestone: ${project.currentMilestone}`);
    }

    // Client info
    if (project.clientId) {
      try {
        const clientRows = await db
          .select({
            name: clients.name,
            contactName: clients.contactName,
            contactEmail: clients.contactEmail,
          })
          .from(clients)
          .where(eq(clients.id, project.clientId))
          .limit(1);

        if (clientRows.length > 0) {
          const client = clientRows[0];
          sections.push(`Client: ${client.name}`);
          if (client.contactName) sections.push(`Contact: ${client.contactName}`);
          if (client.contactEmail) sections.push(`Email: ${client.contactEmail}`);
        }
      } catch {
        // Non-fatal — report works without client info
      }
    }

    // Scope document
    if (project.scopeId) {
      try {
        const scopeRows = await db
          .select({
            clientDocument: projectScopes.clientDocument,
            estimatedTasks: projectScopes.estimatedTasks,
            estimatedDuration: projectScopes.estimatedDuration,
          })
          .from(projectScopes)
          .where(eq(projectScopes.id, project.scopeId))
          .limit(1);

        if (scopeRows.length > 0 && scopeRows[0].clientDocument) {
          sections.push('');
          sections.push('## Scope');
          sections.push(scopeRows[0].clientDocument);
          if (scopeRows[0].estimatedTasks) {
            sections.push(`Estimated Tasks: ${scopeRows[0].estimatedTasks}`);
          }
          if (scopeRows[0].estimatedDuration) {
            sections.push(`Estimated Duration: ${scopeRows[0].estimatedDuration}`);
          }
        }
      } catch {
        // Non-fatal
      }
    }
  } catch (error) {
    sections.push('## Project Details');
    sections.push(`Error loading project: ${error instanceof Error ? error.message : String(error)}`);
    return sections.join('\n');
  }

  // 2. Task summary
  try {
    const taskRows = await db
      .select({
        status: tasks.status,
        agentType: tasks.agentType,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.status, tasks.agentType);

    if (taskRows.length > 0) {
      // Aggregate by status
      const byStatus: Record<string, number> = {};
      const byAgentAndStatus: Record<string, Record<string, number>> = {};
      let total = 0;

      for (const row of taskRows) {
        const status = row.status;
        const agent = row.agentType;
        const count = row.count;

        byStatus[status] = (byStatus[status] || 0) + count;
        total += count;

        if (!byAgentAndStatus[agent]) byAgentAndStatus[agent] = {};
        byAgentAndStatus[agent][status] = count;
      }

      sections.push('');
      sections.push('## Task Summary');
      sections.push(`Total: ${total} tasks`);
      for (const [status, count] of Object.entries(byStatus)) {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        sections.push(`- ${status}: ${count} (${pct}%)`);
      }

      sections.push('');
      sections.push('By Agent:');
      for (const [agent, statuses] of Object.entries(byAgentAndStatus)) {
        const parts = Object.entries(statuses)
          .map(([s, c]) => `${c} ${s}`)
          .join(', ');
        sections.push(`- ${agent}: ${parts}`);
      }
    } else {
      sections.push('');
      sections.push('## Task Summary');
      sections.push('No tasks created yet.');
    }
  } catch {
    sections.push('');
    sections.push('## Task Summary');
    sections.push('Unable to load task data.');
  }

  // 3. Milestones
  try {
    const milestoneRows = await db
      .select({
        name: milestones.name,
        description: milestones.description,
        status: milestones.status,
        targetDate: milestones.targetDate,
        completedAt: milestones.completedAt,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.createdAt);

    if (milestoneRows.length > 0) {
      sections.push('');
      sections.push('## Milestones');
      for (let i = 0; i < milestoneRows.length; i++) {
        const m = milestoneRows[i];
        const statusLabel = m.status.toUpperCase();
        const dateInfo = m.completedAt
          ? `completed ${m.completedAt.toISOString().split('T')[0]}`
          : m.targetDate
            ? `target: ${m.targetDate}`
            : '';
        sections.push(`${i + 1}. ${m.name} — ${statusLabel}${dateInfo ? ` (${dateInfo})` : ''}`);
      }
    }
  } catch {
    // No milestones section if query fails
  }

  // 4. Blocking questions
  try {
    const questionRows = await db
      .select({
        question: questions.question,
        createdAt: questions.createdAt,
        priority: questions.priority,
      })
      .from(questions)
      .where(
        and(
          eq(questions.projectId, projectId),
          eq(questions.status, 'pending'),
        )
      )
      .orderBy(desc(questions.createdAt))
      .limit(10);

    if (questionRows.length > 0) {
      sections.push('');
      sections.push('## Blocking Questions (need client input)');
      for (const q of questionRows) {
        const daysAgo = Math.floor(
          (Date.now() - q.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        const ageLabel = daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;
        sections.push(`- "${q.question}" (${q.priority}, asked ${ageLabel})`);
      }
    }
  } catch {
    // No questions section if query fails
  }

  // 5. Cost summary
  try {
    const costRows = await db
      .select({
        agentType: costTracking.agentType,
        totalCost: sql<string>`sum(${costTracking.apiCostUsd})`,
        totalHours: sql<string>`sum(${costTracking.estimatedBillableHours})`,
        totalInputTokens: sql<number>`sum(${costTracking.tokensInput})::int`,
        totalOutputTokens: sql<number>`sum(${costTracking.tokensOutput})::int`,
      })
      .from(costTracking)
      .where(eq(costTracking.projectId, projectId))
      .groupBy(costTracking.agentType);

    if (costRows.length > 0) {
      let totalCost = 0;
      let totalHours = 0;

      sections.push('');
      sections.push('## Cost Summary');

      const agentLines: string[] = [];
      for (const row of costRows) {
        const cost = parseFloat(row.totalCost || '0');
        const hours = parseFloat(row.totalHours || '0');
        totalCost += cost;
        totalHours += hours;
        agentLines.push(`- ${row.agentType}: $${cost.toFixed(2)} (${hours.toFixed(1)}h)`);
      }

      sections.push(`Total API Cost: $${totalCost.toFixed(2)}`);
      sections.push(`Total Estimated Billable Hours: ${totalHours.toFixed(1)}`);
      sections.push('By Agent:');
      sections.push(...agentLines);
    }
  } catch {
    // No cost section if query fails or table empty
  }

  return sections.join('\n');
}
