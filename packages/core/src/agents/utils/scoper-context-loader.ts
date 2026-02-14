/**
 * Scoper Context Loader
 *
 * Builds context for the Project Scoper agent.
 *
 * Unlike engineering agents, the scoper needs:
 * - The raw brief text (always)
 * - Client info if available (name, contact, history)
 * - Summary of client's existing projects if any (for context, not duplication)
 *
 * It does NOT need:
 * - Code files, schema, routes
 * - File locks, task dependencies
 * - SKILL files (those are loaded separately by skill-loader)
 */

import { db } from '@soloenterprise/db';
import { clients, projects } from '@soloenterprise/db/schema';
import { eq, desc } from 'drizzle-orm';

export interface ScoperContextInput {
  briefId: string;
  briefContent: string;
  briefTitle: string;
  clientId?: string;
}

/**
 * Build context string for the Project Scoper agent.
 *
 * Brief content is passed in directly (not re-fetched from DB)
 * because the worker already has it from the job data.
 *
 * Client info fetch is wrapped in try/catch — if the DB call fails,
 * the scoper still works without client history.
 */
export async function buildScoperContext(input: ScoperContextInput): Promise<string> {
  const parts: string[] = [];

  // 1. Always include the brief
  parts.push(`<brief title="${input.briefTitle}">`);
  parts.push(input.briefContent);
  parts.push('</brief>');

  // 2. If we have a clientId, fetch client info and their project history
  if (input.clientId) {
    try {
      const clientRows = await db
        .select({
          name: clients.name,
          contactName: clients.contactName,
          contactEmail: clients.contactEmail,
          notes: clients.notes,
        })
        .from(clients)
        .where(eq(clients.id, input.clientId))
        .limit(1);

      if (clientRows.length > 0) {
        const client = clientRows[0];
        parts.push('<client_info>');
        parts.push(`Client: ${client.name}`);
        if (client.contactName) parts.push(`Contact: ${client.contactName}`);
        if (client.contactEmail) parts.push(`Email: ${client.contactEmail}`);
        if (client.notes) parts.push(`Notes: ${client.notes}`);
        parts.push('</client_info>');
      }

      // Fetch existing projects for this client (summary only)
      const projectRows = await db
        .select({
          name: projects.name,
          status: projects.status,
          description: projects.description,
        })
        .from(projects)
        .where(eq(projects.clientId, input.clientId))
        .orderBy(desc(projects.createdAt))
        .limit(5);

      if (projectRows.length > 0) {
        parts.push('<client_history>');
        parts.push('Previous projects for this client:');
        for (const proj of projectRows) {
          parts.push(`- ${proj.name} (${proj.status})${proj.description ? ': ' + proj.description : ''}`);
        }
        parts.push('</client_history>');
      }
    } catch (error) {
      // Non-fatal — scoper can work without client history
      console.warn('[Scoper Context] Failed to fetch client info:', error);
    }
  }

  return parts.join('\n');
}
