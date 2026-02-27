import { describe, it, expect } from 'vitest';
import { extractRelatedTableNames } from '../scaffold-orchestrator';
import type { DrizzleSchemaInfo } from '../drizzle-schema-parser';

/**
 * Minimal schema fixture with milestones, projects, and tasks tables.
 * Only table names matter for extractRelatedTableNames — columns are minimal.
 */
const SCHEMA: DrizzleSchemaInfo = {
  tables: [
    { name: 'milestones', dbName: 'milestones', columns: [{ name: 'id', dbName: 'id', type: 'uuid', isNotNull: true, hasDefault: true, isPrimaryKey: true, isArray: false }] },
    { name: 'projects', dbName: 'projects', columns: [{ name: 'id', dbName: 'id', type: 'uuid', isNotNull: true, hasDefault: true, isPrimaryKey: true, isArray: false }] },
    { name: 'tasks', dbName: 'tasks', columns: [{ name: 'id', dbName: 'id', type: 'uuid', isNotNull: true, hasDefault: true, isPrimaryKey: true, isArray: false }] },
    { name: 'artifacts', dbName: 'artifacts', columns: [{ name: 'id', dbName: 'id', type: 'uuid', isNotNull: true, hasDefault: true, isPrimaryKey: true, isArray: false }] },
    { name: 'deployments', dbName: 'deployments', columns: [{ name: 'id', dbName: 'id', type: 'uuid', isNotNull: true, hasDefault: true, isPrimaryKey: true, isArray: false }] },
  ],
  enums: [],
};

describe('extractRelatedTableNames', () => {
  it('detects projects and tasks from milestones task description', () => {
    const description = 'Build a REST API endpoint for managing project milestones. GET /api/projects/:projectId/milestones should list all milestones for a project with pagination, joining the milestones table with the projects table. GET /api/milestones/:id should return a single milestone with a count of tasks linked to that milestone.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones');

    expect(related).toContain('projects');
    expect(related).toContain('tasks');
    expect(related).not.toContain('milestones'); // primary resource excluded
    expect(related).not.toContain('artifacts'); // not mentioned
    expect(related).not.toContain('deployments'); // not mentioned
  });

  it('detects singular references (projectId → projects)', () => {
    const description = 'Validate that the projectId exists in the projects table before inserting a milestone.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones');

    expect(related).toContain('projects');
  });

  it('detects tables mentioned in tech spec', () => {
    const description = 'Create milestones API';
    const techSpec = 'Join with the projects table to include project name. Count tasks per milestone.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones', techSpec);

    expect(related).toContain('projects');
    expect(related).toContain('tasks');
  });

  it('returns empty array when no related tables are mentioned', () => {
    const description = 'Create a simple CRUD endpoint for milestones.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones');

    expect(related).toEqual([]);
  });

  it('excludes the primary resource from results', () => {
    const description = 'List all milestones for a project with project details.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones');

    expect(related).not.toContain('milestones');
    expect(related).toContain('projects');
  });

  it('handles case-insensitive matching', () => {
    const description = 'Join with the Projects table and count Tasks per milestone.';

    const related = extractRelatedTableNames(description, SCHEMA, 'milestones');

    expect(related).toContain('projects');
    expect(related).toContain('tasks');
  });
});
