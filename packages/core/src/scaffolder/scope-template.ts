/**
 * Scope Template Scaffolder
 *
 * Generates YAML scope skeleton from brief content.
 * Used by Project Scoper agent to scaffold scope structure.
 */

// ============================================================================
// Types
// ============================================================================

export interface ScopeTemplateInput {
  projectName: string;
  briefContent: string;
  clientName?: string;
  /** Extracted features from brief (if available) */
  features?: string[];
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Scope Template Scaffolder
// ============================================================================

export function scaffoldScopeTemplate(input: ScopeTemplateInput): ScaffoldedFile {
  const { projectName, briefContent, clientName, features } = input;
  const parts: string[] = [];

  parts.push(`# Project Scope: ${projectName}`);
  parts.push('');
  parts.push(`project_name: "${projectName}"`);
  if (clientName) parts.push(`client: "${clientName}"`);
  parts.push(`status: draft`);
  parts.push(`created_at: "${new Date().toISOString().split('T')[0]}"`);
  parts.push('');

  // Brief summary
  parts.push('## Brief Summary');
  parts.push('');
  const briefLines = briefContent.split('\n').slice(0, 5);
  for (const line of briefLines) {
    if (line.trim()) parts.push(`> ${line.trim()}`);
  }
  parts.push('');

  // Features
  parts.push('## Features');
  parts.push('');
  if (features && features.length > 0) {
    for (const feature of features) {
      parts.push(`- name: "${feature}"`);
      parts.push(`  priority: medium`);
      parts.push(`  estimated_tasks: 0  # TODO: Estimate`);
      parts.push(`  complexity: medium  # TODO: Assess`);
      parts.push('');
    }
  } else {
    parts.push('# TODO: Extract features from brief');
    parts.push('- name: "Feature 1"');
    parts.push('  priority: high');
    parts.push('  estimated_tasks: 0');
    parts.push('  complexity: medium');
    parts.push('');
  }

  // Technical Requirements
  parts.push('## Technical Requirements');
  parts.push('');
  parts.push('tech_stack:');
  parts.push('  # TODO: Define based on brief');
  parts.push('  - framework: "Next.js"');
  parts.push('  - database: "PostgreSQL"');
  parts.push('  - auth: "TBD"');
  parts.push('');

  // Timeline
  parts.push('## Timeline');
  parts.push('');
  parts.push('milestones:');
  parts.push('  - name: "MVP"');
  parts.push('    target: "TBD"');
  parts.push('    deliverables:');
  parts.push('      # TODO: Define milestone deliverables');
  parts.push('      - "Core features"');
  parts.push('');

  // Risks
  parts.push('## Risks');
  parts.push('');
  parts.push('# TODO: Identify risks from brief');
  parts.push('- risk: "TBD"');
  parts.push('  impact: medium');
  parts.push('  mitigation: "TBD"');

  return {
    path: `scope-${slugify(projectName)}.yaml`,
    content: parts.join('\n'),
  };
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
