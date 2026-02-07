/**
 * Tests for Bug #4: Question format parser accepts nested format.
 *
 * The orchestrator may output questions in two formats:
 * 1. Simple: { question: "string" }
 * 2. Complex: { summary: "...", details: "...", contradictions: [...] }
 *
 * Both must produce a valid flat question string.
 */

import { describe, it, expect } from 'vitest';
import { parseOrchestratorOutput } from '../orchestrator-output-parser';

describe('Bug #4: Question format parser — nested format', () => {
  it('parses simple question: "string" format', () => {
    const yaml = [
      '```yaml',
      'action: request_clarification',
      'questions:',
      '  - question: "What authentication method should we use?"',
      '    category: technical',
      '    priority: high',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toBe('What authentication method should we use?');
    expect(result.questions[0].category).toBe('technical');
    expect(result.questions[0].priority).toBe('high');
  });

  it('parses nested summary/details/contradictions format into a flat string', () => {
    const yaml = [
      '```yaml',
      'action: escalate_contradictions',
      'questions:',
      '  - summary: "Requirements contain conflicting specifications"',
      '    details: "The client asked for both real-time updates and offline-first architecture"',
      '    contradictions:',
      '      - title: "C1"',
      '        conflict: "Real-time requires persistent connections"',
      '        recommendation: "Use WebSockets with offline fallback"',
      '      - title: "C2"',
      '        conflict: "Offline-first requires local-first data model"',
      '    category: architectural',
      '    priority: critical',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(1);

    const q = result.questions[0];
    // All parts coerced into a single flat string
    expect(q.question).toContain('Requirements contain conflicting specifications');
    expect(q.question).toContain('real-time updates and offline-first');
    expect(q.question).toContain('[C1] Real-time requires persistent connections');
    expect(q.question).toContain('Recommendation: Use WebSockets with offline fallback');
    expect(q.question).toContain('[C2] Offline-first requires local-first data model');
    expect(q.category).toBe('architectural');
    expect(q.priority).toBe('critical');
  });

  it('falls back to summary when question field is missing', () => {
    const yaml = [
      '```yaml',
      'action: request_clarification',
      'questions:',
      '  - summary: "Need clarification on deployment target"',
      '    category: technical',
      '    priority: medium',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toBe('Need clarification on deployment target');
  });

  it('handles mixed format (question + contradictions)', () => {
    const yaml = [
      '```yaml',
      'action: request_clarification',
      'questions:',
      '  - question: "How should we handle these conflicts?"',
      '    category: architecture',
      '    priority: high',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(1);
    // When question field is present, it takes priority
    expect(result.questions[0].question).toBe('How should we handle these conflicts?');
  });

  it('rejects question with no parseable content', () => {
    const yaml = [
      '```yaml',
      'action: request_clarification',
      'questions:',
      '  - category: technical',
      '    priority: high',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    // Parses successfully (action is present) but no valid questions
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(0);
  });

  it('parses multiple questions in mixed formats', () => {
    const yaml = [
      '```yaml',
      'action: request_clarification',
      'questions:',
      '  - question: "What database should we use?"',
      '    category: technical',
      '    priority: high',
      '  - summary: "Auth strategy unclear"',
      '    details: "Brief mentions both JWT and session-based auth"',
      '    contradictions:',
      '      - title: "C1"',
      '        conflict: "JWT is stateless, sessions are stateful"',
      '    category: architectural',
      '    priority: critical',
      '  - summary: "Deployment target not specified"',
      '    category: technical',
      '    priority: medium',
      '```',
    ].join('\n');

    const result = parseOrchestratorOutput(yaml);

    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(3);

    // First: simple format
    expect(result.questions[0].question).toBe('What database should we use?');

    // Second: complex with contradictions
    expect(result.questions[1].question).toContain('Auth strategy unclear');
    expect(result.questions[1].question).toContain('JWT is stateless, sessions are stateful');

    // Third: summary-only
    expect(result.questions[2].question).toBe('Deployment target not specified');
  });
});
