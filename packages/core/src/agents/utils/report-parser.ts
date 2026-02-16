/**
 * Report Output Parser
 *
 * Parses the Client Reporter agent's XML response into structured parts.
 * Expects <report type="..."> and <internal_notes> blocks.
 * Handles malformed responses gracefully.
 */

export interface ReportParseResult {
  /** Markdown content from <report> block */
  reportContent: string;
  /** Content from <internal_notes> block */
  internalNotes: string;
  /** Report type extracted from <report type="..."> attribute */
  reportType: string;
}

/**
 * Parse the agent's XML-tagged response into report content and internal notes.
 *
 * If the response doesn't contain proper XML tags, the entire response is
 * treated as report content with empty internal notes.
 */
export function parseReportOutput(response: string): ReportParseResult {
  // Extract <report type="...">...</report>
  const reportMatch = /<report\s+type="([^"]*)">([\s\S]*?)<\/report>/i.exec(response);
  let reportContent = reportMatch?.[2]?.trim() ?? '';
  const reportType = reportMatch?.[1]?.trim() ?? '';

  // Extract <internal_notes>...</internal_notes>
  const notesMatch = /<internal_notes>([\s\S]*?)<\/internal_notes>/i.exec(response);
  const internalNotes = notesMatch?.[1]?.trim() ?? '';

  // Fallback: if no <report> tag found, treat entire response as report content
  if (!reportContent && !internalNotes) {
    reportContent = response.trim();
  }

  return { reportContent, internalNotes, reportType };
}
