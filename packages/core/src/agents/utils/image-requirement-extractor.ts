/**
 * Image Requirement Extractor
 *
 * Uses Claude's vision capabilities to scan attached images and produce
 * structured, implementable UI requirements as markdown.
 *
 * Runs BEFORE the Orchestrator decomposes a project. The enriched description
 * flows into Opus, which decomposes with full visual context.
 * Subtasks and tech specs inherit requirements through text — agents never see raw images.
 *
 * Gating: Only runs if task.imageAttachments has entries. No images = skip, zero cost.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';
import type { ImageAttachment } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TaskLogger } from '../../utils/task-logger';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Anthropic Client (own singleton — cannot share with other agents)
// ============================================================================

const MODEL = process.env.IMAGE_EXTRACTOR_MODEL || 'claude-sonnet-4-5-20250929';

let extractorClient: Anthropic | null = null;

function getExtractorClient(): Anthropic {
  if (!extractorClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    extractorClient = new Anthropic({
      apiKey,
      timeout: 5 * 60 * 1000, // 5 minutes
      maxRetries: 2,
    });
  }
  return extractorClient;
}

// ============================================================================
// System Prompt
// ============================================================================

const IMAGE_ANALYSIS_SYSTEM_PROMPT = `You are a Visual Requirements Analyst for a software development team.

Your job is to analyze UI mockups, wireframes, screenshots, and design references, then produce structured, implementable requirements that developers can follow without seeing the original images.

## Output Format

Write requirements in markdown with these sections:

### Layout Structure
- Page/screen layout (grid, flex, sidebar, etc.)
- Content hierarchy and sections
- Navigation placement
- Responsive breakpoints if visible

### Components
- List every UI component visible (buttons, forms, cards, tables, modals, etc.)
- For each: type, position, state variations if visible
- Component hierarchy (what contains what)

### Styling & Visual Design
- Color palette (use hex codes when possible, describe otherwise)
- Typography (headings, body text sizes, weights)
- Spacing patterns (padding, margins, gaps)
- Border styles, shadows, rounded corners
- Background treatments

### Data Display
- What data is shown (tables, lists, stats, charts)
- Data format and structure
- Empty states if visible
- Loading states if visible

### Interactive Elements
- Buttons: label, style (primary/secondary/ghost), placement
- Forms: field types, labels, validation indicators
- Navigation: links, tabs, breadcrumbs
- Modals/dialogs if present

### Responsive Notes
- If multiple screen sizes are shown, note differences
- If only one size: note what would likely need adaptation

## Rules
- Be specific and implementable — "blue button" is bad, "#3B82F6 rounded-lg px-4 py-2 font-medium text-white" is good
- Describe spatial relationships precisely: "below the header", "right-aligned in the card footer"
- If something is ambiguous in the image, state what you see and flag the ambiguity
- Do NOT invent features not visible in the images
- Do NOT include implementation code — only requirements
- Keep under 2000 words total`;

// ============================================================================
// Helpers
// ============================================================================

// Claude vision supports many images per request — the real limit is the context window.
// Each ~1568px image costs ~1600 tokens. We cap at 20 to stay safely within limits.
const MAX_IMAGES = 20;

function loadImageAsBase64(relativePath: string): { data: string; mediaType: string } | null {
  try {
    // relativePath is like "generated/uploads/{taskId}/{filename}"
    // Resolve from packages/core/ since that's where generated/ lives
    const fullPath = resolve(__dirname, '../../..', relativePath);
    const buffer = readFileSync(fullPath);
    const data = buffer.toString('base64');

    // Detect media type from extension
    const ext = relativePath.split('.').pop()?.toLowerCase();
    const mediaTypeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mediaType = mediaTypeMap[ext ?? ''] ?? 'image/png';

    return { data, mediaType };
  } catch {
    return null;
  }
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Extract visual requirements from task's attached images.
 *
 * Returns null if:
 * - Task has no images
 * - Task already has extracted requirements (idempotent)
 * - API call fails (graceful degradation)
 *
 * Returns { requirements, tokens } on success.
 */
export async function extractImageRequirements(
  taskId: string
): Promise<{ requirements: string; tokens: number } | null> {
  // 1. Load task
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    console.warn(`[ImageExtractor] Task ${taskId} not found`);
    return null;
  }

  const logger = new TaskLogger(taskId);

  // 2. Check if images exist
  const attachments = (task.imageAttachments as ImageAttachment[] | null) ?? [];
  if (attachments.length === 0) {
    logger.close();
    return null; // No images, zero cost
  }

  // 3. Skip if already extracted (idempotent)
  if (task.imageRequirements) {
    logger.log('ImageExtractor', `Task ${taskId} already has image requirements, skipping`);
    logger.close();
    return null;
  }

  logger.log('ImageExtractor', `Extracting requirements from ${attachments.length} image(s) for task ${taskId}`);

  // 4. Load images (cap at MAX_IMAGES)
  const imagesToProcess = attachments.slice(0, MAX_IMAGES);
  if (attachments.length > MAX_IMAGES) {
    logger.warn('ImageExtractor', `Task ${taskId} has ${attachments.length} images, processing first ${MAX_IMAGES}`);
  }

  const imageBlocks: Anthropic.Messages.ImageBlockParam[] = [];

  for (const attachment of imagesToProcess) {
    const imageData = loadImageAsBase64(attachment.url);
    if (!imageData) {
      logger.warn('ImageExtractor', `Failed to load image: ${attachment.url}`);
      continue;
    }

    imageBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageData.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        data: imageData.data,
      },
    });
  }

  if (imageBlocks.length === 0) {
    logger.warn('ImageExtractor', `No images could be loaded for task ${taskId}`);
    logger.close();
    return null;
  }

  // 5. Build Claude vision API call
  const userContent: Anthropic.Messages.ContentBlockParam[] = [
    ...imageBlocks,
    {
      type: 'text',
      text: `Analyze the ${imageBlocks.length} image(s) above and extract structured UI requirements that a developer can implement without seeing the original images. Follow the output format specified in your instructions.`,
    },
  ];

  // 6. Call API
  try {
    const client = getExtractorClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: IMAGE_ANALYSIS_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const requirements = textBlock?.type === 'text' ? textBlock.text : '';

    if (!requirements) {
      logger.warn('ImageExtractor', `Empty response for task ${taskId}`);
      logger.close();
      return null;
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // 7. Save to DB
    await db
      .update(tasks)
      .set({
        imageRequirements: requirements,
        imageRequirementsGeneratedAt: new Date(),
        imageRequirementsTokens: totalTokens,
      })
      .where(eq(tasks.id, taskId));

    logger.log('ImageExtractor', `Extracted requirements for task ${taskId}: ~${totalTokens} tokens from ${imageBlocks.length} image(s)`);

    // 8. Log TOKEN_BASELINE
    console.log(
      'TOKEN_BASELINE',
      JSON.stringify({
        type: 'image-requirements',
        taskId,
        timestamp: new Date().toISOString(),
        inputTokens,
        outputTokens,
        totalTokens,
        imageCount: imageBlocks.length,
      })
    );

    logger.close();
    return { requirements, tokens: totalTokens };
  } catch (err) {
    logger.error('ImageExtractor', `API call failed for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    logger.close();
    return null; // Graceful degradation
  }
}
