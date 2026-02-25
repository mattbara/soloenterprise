/**
 * Report Template Scaffolder
 *
 * Generates markdown report pre-fill from project DB data.
 * Used by Client Reporter agent to scaffold report structure.
 */

// ============================================================================
// Types
// ============================================================================

export interface ReportTemplateInput {
  projectName: string;
  reportType: 'progress' | 'milestone' | 'weekly' | 'final';
  period?: string;
  milestones?: Array<{ name: string; status: string }>;
  taskSummary?: { total: number; completed: number; inProgress: number; failed: number };
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Report Template Scaffolder
// ============================================================================

export function scaffoldReportTemplate(input: ReportTemplateInput): ScaffoldedFile {
  const { projectName, reportType, period, milestones, taskSummary } = input;
  const parts: string[] = [];

  // Header
  const title = getReportTitle(reportType, projectName, period);
  parts.push(`# ${title}`);
  parts.push('');
  parts.push(`**Project:** ${projectName}`);
  parts.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  if (period) parts.push(`**Period:** ${period}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // Executive Summary
  parts.push('## Executive Summary');
  parts.push('');
  parts.push('<!-- TODO: Write 2-3 sentence overview of progress -->');
  parts.push('');

  // Task Progress
  if (taskSummary) {
    parts.push('## Task Progress');
    parts.push('');
    parts.push(`| Metric | Count |`);
    parts.push(`|--------|-------|`);
    parts.push(`| Total Tasks | ${taskSummary.total} |`);
    parts.push(`| Completed | ${taskSummary.completed} |`);
    parts.push(`| In Progress | ${taskSummary.inProgress} |`);
    parts.push(`| Failed | ${taskSummary.failed} |`);
    parts.push(`| Completion Rate | ${taskSummary.total > 0 ? Math.round((taskSummary.completed / taskSummary.total) * 100) : 0}% |`);
    parts.push('');
  }

  // Milestones
  if (milestones && milestones.length > 0) {
    parts.push('## Milestones');
    parts.push('');
    for (const m of milestones) {
      const icon = m.status === 'completed' ? '[x]' : '[ ]';
      parts.push(`- ${icon} **${m.name}** — ${m.status}`);
    }
    parts.push('');
  }

  // Report type specific sections
  if (reportType === 'progress' || reportType === 'weekly') {
    parts.push('## Key Accomplishments');
    parts.push('');
    parts.push('<!-- TODO: List major items completed -->');
    parts.push('');
    parts.push('## Blockers & Risks');
    parts.push('');
    parts.push('<!-- TODO: List any blockers or risks -->');
    parts.push('');
    parts.push('## Next Steps');
    parts.push('');
    parts.push('<!-- TODO: Planned work for next period -->');
    parts.push('');
  }

  if (reportType === 'final') {
    parts.push('## Deliverables');
    parts.push('');
    parts.push('<!-- TODO: List all deliverables -->');
    parts.push('');
    parts.push('## Lessons Learned');
    parts.push('');
    parts.push('<!-- TODO: Key takeaways -->');
    parts.push('');
  }

  return {
    path: `report-${reportType}.md`,
    content: parts.join('\n'),
  };
}

function getReportTitle(type: string, project: string, period?: string): string {
  switch (type) {
    case 'progress': return `${project} — Progress Report${period ? ` (${period})` : ''}`;
    case 'milestone': return `${project} — Milestone Report`;
    case 'weekly': return `${project} — Weekly Report${period ? ` (${period})` : ''}`;
    case 'final': return `${project} — Final Report`;
    default: return `${project} — Report`;
  }
}
