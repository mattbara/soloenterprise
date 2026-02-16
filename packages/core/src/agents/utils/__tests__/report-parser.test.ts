/**
 * Tests for report-parser.ts
 *
 * Validates parseReportOutput() XML extraction and fallback behavior.
 */

import { describe, it, expect } from 'vitest';
import { parseReportOutput } from '../report-parser';

describe('parseReportOutput', () => {
  it('extracts report content and internal notes from well-formed response', () => {
    const response = `
<report type="weekly">
## Weekly Summary

All tasks completed on time.
</report>
<internal_notes>
Client seems happy. Upsell opportunity for phase 2.
</internal_notes>`;

    const result = parseReportOutput(response);

    expect(result.reportContent).toBe('## Weekly Summary\n\nAll tasks completed on time.');
    expect(result.internalNotes).toBe('Client seems happy. Upsell opportunity for phase 2.');
    expect(result.reportType).toBe('weekly');
  });

  it('handles missing internal_notes gracefully', () => {
    const response = '<report type="summary">Project is on track.</report>';
    const result = parseReportOutput(response);

    expect(result.reportContent).toBe('Project is on track.');
    expect(result.internalNotes).toBe('');
    expect(result.reportType).toBe('summary');
  });

  it('treats entire response as report content when no XML tags present', () => {
    const response = 'This is a plain text report without any XML tags.';
    const result = parseReportOutput(response);

    expect(result.reportContent).toBe(response);
    expect(result.internalNotes).toBe('');
    expect(result.reportType).toBe('');
  });

  it('extracts report type from attribute', () => {
    const response = '<report type="milestone">Milestone reached.</report>';
    const result = parseReportOutput(response);

    expect(result.reportType).toBe('milestone');
  });

  it('trims whitespace around content', () => {
    const response = `<report type="weekly">

  Content with whitespace

</report>
<internal_notes>

  Notes with whitespace

</internal_notes>`;

    const result = parseReportOutput(response);

    expect(result.reportContent).toBe('Content with whitespace');
    expect(result.internalNotes).toBe('Notes with whitespace');
  });

  it('returns empty fields for empty string input', () => {
    const result = parseReportOutput('');

    expect(result.reportContent).toBe('');
    expect(result.internalNotes).toBe('');
    expect(result.reportType).toBe('');
  });
});
