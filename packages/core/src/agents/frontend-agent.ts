/**
 * Frontend Agent
 *
 * A BullMQ worker that processes frontend engineering tasks using Claude API.
 * Loads the SKILL file as system context and generates production-ready React components.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@soloenterprise/db';
import { artifacts, questions, tasks } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { updateTaskStatus, getTask, claimTaskForProcessing, type TaskJobData } from '../services/task-service';
import { parseAgentOutput, validateParsedFiles } from './utils/output-parser';
import { writeGeneratedFiles } from './utils/file-writer';
import { validateGeneratedFiles } from './utils/file-validator';
import { loadSkillsForTask, type TaskComplexity } from './utils/skill-loader';
import { processWithSyntaxRecovery, type SyntaxError, type RecoveryAttempts, type CostTrackingCallback } from './utils/syntax-recovery';
import { buildFrontendContextWithProfile, getEmptyFrontendContextResult, type FrontendProfiledContextResult } from './utils/frontend-context-loader';
import type { FrontendContextProfileName } from './utils/frontend-context-profiles';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { TaskLogger } from '../utils/task-logger';
import { recordAgentCost } from '../services/cost-tracking-service';
import { generateScaffold, type ScaffoldResult } from '../scaffolder/index';
import { executeTestsInSandbox } from '../test-runner/index';
import { buildTestRetryPrompt, findTestFiles } from '../test-runner/test-retry-prompt';

const QUEUE_NAME = 'frontend-tasks';

// ============================================================================
// Token Baseline Logging - Measurement only, no logic changes
// ============================================================================

interface FrontendTokenMetrics {
  taskId: string;
  timestamp: string;
  agentType: 'frontend';
  inputTokens: number;
  outputTokens: number;
  skillTokens: number;
  contextTokens: number;
  codebaseContextTokens: number;
  questionsAsked: number;
  filesGenerated: number;
  layersLoaded: number;
  complexity: TaskComplexity;
  // Frontend context profile metrics
  contextProfile: FrontendContextProfileName;
  componentExamplesLoaded: number;
  hookExamplesLoaded: number;
  // Architect spec metrics
  techSpecTokens: number;
  hasTechSpec: boolean;
}

async function logTokenBaseline(metrics: FrontendTokenMetrics): Promise<void> {
  // Save metrics to database for dashboard
  const { taskId, timestamp, ...tokenMetrics } = metrics;
  try {
    await db.update(tasks)
      .set({ tokenMetrics })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[FrontendAgent] Failed to save token metrics:', err);
  }

  // Keep console log for debugging
  console.log('TOKEN_BASELINE', JSON.stringify(metrics));
}

// ============================================================================

// Claude API configuration - configurable via environment variables
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '16384', 10);
const TEMPERATURE = 0;

// Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Builds the prompt for Claude.
 */
function buildPrompt(
  taskName: string,
  taskDescription: string,
  context: Record<string, unknown>
): string {
  const parts: string[] = [];

  parts.push('# Task Requirements\n');
  parts.push(`**Task:** ${taskName}\n`);
  parts.push(`**Description:** ${taskDescription}\n`);

  if (context.requirements) {
    parts.push(`\n**Requirements:**\n${context.requirements}\n`);
  }

  if (context.acceptanceCriteria && Array.isArray(context.acceptanceCriteria)) {
    parts.push('\n**Acceptance Criteria:**');
    for (const criterion of context.acceptanceCriteria) {
      parts.push(`- ${criterion}`);
    }
    parts.push('');
  }

  if (context.relatedFiles && Array.isArray(context.relatedFiles)) {
    parts.push('\n**Related Files:**');
    for (const file of context.relatedFiles) {
      parts.push(`- ${file}`);
    }
    parts.push('');
  }

  if (context.previousAttempts && Array.isArray(context.previousAttempts)) {
    parts.push('\n**Previous Attempts (learn from these failures):**');
    for (const attempt of context.previousAttempts) {
      const typedAttempt = attempt as { attemptNumber: number; error: string; timestamp: string };
      parts.push(`- Attempt ${typedAttempt.attemptNumber}: ${typedAttempt.error}`);
    }
    parts.push('');
  }

  // Include answered questions from previous human interaction
  if (context.answeredQuestions && Array.isArray(context.answeredQuestions)) {
    parts.push('\n**Previously Asked Questions (Human has answered these):**');
    for (const qa of context.answeredQuestions) {
      const typedQA = qa as { question: string; answer: string };
      parts.push(`\nQ: ${typedQA.question}`);
      parts.push(`A: ${typedQA.answer}`);
    }
    parts.push('\n');
    parts.push('**IMPORTANT:** Use the answers above to guide your implementation. Do NOT ask these questions again.');
    parts.push('');
  }

  parts.push('\n---\n');
  parts.push('Please analyze this task and provide your implementation following the output format specified in your skill definition.');
  parts.push('Remember to output all code files using the <file path="...">content</file> XML format.');

  return parts.join('\n');
}

/**
 * Determines artifact type from file extension (frontend-specific).
 */
function getArtifactType(filePath: string): 'code' | 'test' | 'config' | 'doc' | 'migration' | 'asset' | 'log' {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || lowerPath.includes('/tests/')) {
    return 'test';
  }
  if (lowerPath.includes('.stories.') || lowerPath.includes('/stories/')) {
    return 'doc'; // Storybook stories are documentation
  }
  if (lowerPath.endsWith('.md') || lowerPath.includes('/docs/')) {
    return 'doc';
  }
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.yaml') ||
    lowerPath.endsWith('.yml') ||
    lowerPath.endsWith('.env') ||
    lowerPath.endsWith('.toml')
  ) {
    return 'config';
  }
  if (
    lowerPath.endsWith('.png') ||
    lowerPath.endsWith('.jpg') ||
    lowerPath.endsWith('.svg') ||
    lowerPath.endsWith('.ico') ||
    lowerPath.endsWith('.webp')
  ) {
    return 'asset';
  }

  return 'code';
}

/**
 * Process a frontend task.
 */
async function processFrontendTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  noop?: boolean;
  summary?: string;
  artifactIds?: string[];
  error?: string;
}> {
  const { taskId, projectId, name, description, context } = job.data;
  const logger = new TaskLogger(taskId);

  // Claim guard: atomic queued → running transition
  const claim = await claimTaskForProcessing(taskId);
  if (!claim.claimed) {
    logger.log('FrontendAgent', `Task ${taskId} already claimed (status: ${claim.currentStatus}), skipping`);
    logger.close();
    return { success: false, noop: true, summary: `Task already claimed by another worker (status: ${claim.currentStatus})` };
  }

  logger.log('FrontendAgent', `Processing task ${taskId}: ${name}`);

  try {
    // Load SKILL layers based on task complexity
    const { content: skillContent, complexity, layers, tokens: skillTokens } = await loadSkillsForTask('frontend', description);

    logger.log('FrontendAgent', `Task complexity: simple=${complexity.simple}, database=${complexity.database}, newPattern=${complexity.newPattern}`);
    logger.log('FrontendAgent', `Loaded layers: ${layers.map(l => l.split('/').pop()).join(', ')}`);

    // Load codebase context with frontend-specific profile selection
    let codebaseContext: FrontendProfiledContextResult;
    try {
      codebaseContext = await buildFrontendContextWithProfile(description);
    } catch (err) {
      logger.warn('FrontendAgent', 'Failed to load codebase context, continuing without it: ' + err);
      codebaseContext = getEmptyFrontendContextResult('simple-component');
    }

    logger.log('FrontendAgent', `Context profile: ${codebaseContext.profile}`);
    logger.log('FrontendAgent', `Components loaded: ${codebaseContext.componentExamplesLoaded}, Hooks: ${codebaseContext.hookExamplesLoaded}, API patterns: ${codebaseContext.apiPatternsLoaded}`);
    logger.log('FrontendAgent', `Context tokens: ~${codebaseContext.tokens}`);

    // Load tech spec from architect layer (if generated)
    const taskRecord = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { technicalSpec: true, techSpecTokens: true },
    });

    let techSpecBlock = '';
    if (taskRecord?.technicalSpec) {
      techSpecBlock = `\n\n## TECHNICAL SPECIFICATION (from Architect)\n\nFollow this spec precisely. It was written by a senior architect who reviewed the full project context.\nIf the spec lists existing dependency files, import from them directly. Do NOT create new files that duplicate existing dependency outputs.\n\n${taskRecord.technicalSpec}\n`;
      logger.log('FrontendAgent', `Tech spec available: ~${taskRecord.technicalSpec.length} chars`);
    } else {
      logger.log('FrontendAgent', 'No tech spec for this task');
    }

    // Scaffold pipeline: generate boilerplate locally (free), send to Claude with TODO markers
    let scaffoldResult: ScaffoldResult | null = null;
    if (process.env.DISABLE_SCAFFOLD === 'true') {
      logger.log('FrontendAgent', 'Scaffold DISABLED (comparison mode)');
    } else {
      try {
        scaffoldResult = generateScaffold({
          agentType: 'frontend',
          taskDescription: description,
          taskName: name,
          requirements: buildPrompt(name, description, context),
          techSpec: taskRecord?.technicalSpec ?? undefined,
        });
        if (scaffoldResult.success && scaffoldResult.files.length > 0) {
          logger.log('FrontendAgent', `Scaffold generated: ${scaffoldResult.scaffoldType}, ${scaffoldResult.files.length} files`);
        } else {
          logger.warn('FrontendAgent', `Scaffold skipped: success=${scaffoldResult.success}, files=${scaffoldResult.files.length}, type=${scaffoldResult.scaffoldType ?? 'none'}${scaffoldResult.error ? `, reason=${scaffoldResult.error}` : ''}`);
        }
      } catch (err) {
        logger.warn('FrontendAgent', 'Scaffold generation failed, continuing without it: ' + err);
      }
    }

    // Build prompt with codebase context prepended and tech spec appended
    const basePrompt = (scaffoldResult?.success && scaffoldResult.files.length > 0)
      ? scaffoldResult.prompt + techSpecBlock
      : buildPrompt(name, description, context) + techSpecBlock;
    const userPrompt = codebaseContext.content
      ? `${codebaseContext.content}\n\n${basePrompt}`
      : basePrompt;

    logger.log('FrontendAgent', 'Calling Claude API...');

    // Call Claude API
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: skillContent,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text response
    const textContent = response.content.find((block) => block.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    logger.log('FrontendAgent', 'Parsing response...');
    logger.log('FrontendAgent', 'Response text length: ' + responseText.length);
    logger.log('FrontendAgent', 'First 500 chars: ' + responseText.substring(0, 500));
    logger.log('FrontendAgent', 'Last 500 chars: ' + responseText.substring(Math.max(0, responseText.length - 500)));

    // Parse the response
    const parseResult = parseAgentOutput(responseText);

    logger.log('FrontendAgent', 'Parse result: ' + JSON.stringify({
      filesCount: parseResult.files.length,
      hasQuestions: parseResult.hasQuestions,
      filePaths: parseResult.files.map(f => f.path),
    }));

    // Log token baseline metrics and save to database
    await logTokenBaseline({
      taskId,
      timestamp: new Date().toISOString(),
      agentType: 'frontend',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      skillTokens,
      contextTokens: Math.ceil(basePrompt.length / 4),
      codebaseContextTokens: codebaseContext.tokens,
      questionsAsked: parseResult.hasQuestions ? 1 : 0,
      filesGenerated: parseResult.files.length,
      layersLoaded: layers.length,
      complexity,
      // Frontend context profile metrics
      contextProfile: codebaseContext.profile,
      componentExamplesLoaded: codebaseContext.componentExamplesLoaded,
      hookExamplesLoaded: codebaseContext.hookExamplesLoaded,
      // Architect spec metrics
      techSpecTokens: taskRecord?.techSpecTokens ?? 0,
      hasTechSpec: !!taskRecord?.technicalSpec,
    });

    // Record cost to cost_tracking table
    await recordAgentCost({
      projectId,
      taskId,
      agentType: 'frontend',
      model: MODEL,
      tokensInput: response.usage?.input_tokens ?? 0,
      tokensOutput: response.usage?.output_tokens ?? 0,
      cachedTokens: (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
    });

    // Handle questions — only block pipeline if agent produced NO files
    if (parseResult.hasQuestions && parseResult.questionsContent) {
      if (parseResult.files.length === 0) {
        // No files = real blocker, agent couldn't proceed
        logger.log('FrontendAgent', 'Task has questions and no files - blocking for human input...');

        const task = await getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }

        await db.insert(questions).values({
          projectId: task.projectId,
          taskId,
          question: parseResult.questionsContent,
          context: `Task: ${name}\n\nDescription: ${description}`,
          askedByAgent: 'frontend',
          status: 'pending',
          priority: 'blocking',
          isBlocking: true,
        });

        await updateTaskStatus(taskId, 'waiting_human', {
          success: false,
          summary: 'Task requires human input - questions pending',
        });

        throw new Error('Task requires human input - questions pending');
      } else {
        // Files generated = agent made its decisions. Discard phantom questions.
        const questionSnippets = parseResult.questionsContent
          .split('\n')
          .filter(l => l.trim())
          .map(q => q.substring(0, 80) + (q.length > 80 ? '...' : ''))
          .join('; ');
        logger.log('FrontendAgent',
          `Agent generated ${parseResult.files.length} files alongside question(s). ` +
          `Discarding questions — agent made its decisions by producing output. ` +
          `Questions were: ${questionSnippets}`
        );
        // Do NOT create DB records — continue to file processing below
      }
    }

    // Validate parsed files
    const validation = validateParsedFiles(parseResult.files);
    if (!validation.valid) {
      logger.warn('FrontendAgent', 'File validation warnings: ' + JSON.stringify(validation.errors));
    }

    if (parseResult.files.length === 0) {
      logger.log('FrontendAgent', 'No files generated - requesting clarification from user');

      // Get task to find project ID
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Create clarification question - don't silently complete with no output
      await db.insert(questions).values({
        projectId: task.projectId,
        taskId,
        question: `I wasn't able to generate code for this task. The request may need more details or may not be a frontend engineering task.\n\n**Original request:** ${name}\n\n**What I understood:** ${description}\n\n**Claude's response:**\n${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}\n\n**Please clarify:**\n- What specific React component or UI do you need?\n- What files or components should be created?\n- Or should this task be cancelled?`,
        context: `Task: ${name}\n\nDescription: ${description}`,
        askedByAgent: 'frontend',
        status: 'pending',
        priority: 'blocking',
        isBlocking: true,
      });

      // Update task status to waiting_human - NOT completed
      await updateTaskStatus(taskId, 'waiting_human', {
        success: false,
        summary: 'Clarification needed - no code output generated',
        outputs: { rawResponse: responseText },
      });

      throw new Error('Clarification needed - no code output generated');
    }

    logger.log('FrontendAgent', `Validating ${parseResult.files.length} files with syntax recovery...`);

    // Create validation function for recovery loop
    const validateFiles = async (files: typeof parseResult.files): Promise<SyntaxError[]> => {
      // Write files to temp location for validation
      const tempWriteResult = await writeGeneratedFiles(taskId, files, 'frontend');
      const validationResult = await validateGeneratedFiles(tempWriteResult.taskDir, tempWriteResult.files);

      return validationResult.errors.map(e => ({
        file: e.file,
        line: e.line,
        message: e.message,
      }));
    };

    // Cost tracking callback for syntax recovery
    const onRecoveryCost: CostTrackingCallback = async (usage) => {
      await recordAgentCost({
        projectId,
        taskId,
        agentType: 'frontend',
        model: usage.callSource === 'syntax-fix' ? 'claude-3-5-haiku-latest' : MODEL,
        tokensInput: usage.inputTokens,
        tokensOutput: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        callSource: usage.callSource,
      });
    };

    // Create fresh generation function for full retries
    const generateFresh = async (): Promise<typeof parseResult.files> => {
      logger.log('FrontendAgent', 'Generating fresh response (full retry)...');
      const retryResponse = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: skillContent,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Track full retry cost
      await onRecoveryCost({
        inputTokens: retryResponse.usage?.input_tokens ?? 0,
        outputTokens: retryResponse.usage?.output_tokens ?? 0,
        cachedTokens: (retryResponse.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
        callSource: 'full-retry',
      });

      const retryText = retryResponse.content.find(c => c.type === 'text');
      const retryResponseText = retryText?.type === 'text' ? retryText.text : '';
      const retryParsed = parseAgentOutput(retryResponseText);
      logger.log('FrontendAgent', `Fresh generation produced ${retryParsed.files.length} files`);
      return retryParsed.files;
    };

    // Use recovery loop for syntax errors
    const recoveryResult = await processWithSyntaxRecovery(
      client,
      'FrontendAgent',
      parseResult.files,
      validateFiles,
      generateFresh,
      onRecoveryCost
    );

    // Log recovery stats
    logger.log('FrontendAgent', `Recovery complete: success=${recoveryResult.success}, fixLoops=${recoveryResult.attempts.fixLoops}, fullRetries=${recoveryResult.attempts.fullRetries}, fixTokens=${recoveryResult.attempts.fixTokensUsed}`);

    // 0-file safety check: recovery reported success but produced no files
    if (recoveryResult.success && recoveryResult.files.length === 0) {
      logger.error('FrontendAgent', `Syntax recovery succeeded but produced 0 files from ${parseResult.files.length} input files`);
      throw new Error(`Syntax recovery produced 0 files from ${parseResult.files.length} declared — aborting to prevent silent completion`);
    }

    // Handle recovery failure
    if (!recoveryResult.success) {
      const errorSummary = recoveryResult.errors
        ?.slice(0, 3)
        .map(e => `${e.file}:${e.line ?? '?'} - ${e.message}`)
        .join('; ') ?? 'Unknown syntax errors';

      // Store errors and recovery attempts on task
      const existingContext = (context as Record<string, unknown>) ?? {};
      try {
        await db
          .update(tasks)
          .set({
            warnings: recoveryResult.errors,
            context: {
              ...existingContext,
              syntaxRecoveryAttempts: recoveryResult.attempts,
              finalSyntaxErrors: recoveryResult.errors,
            },
          })
          .where(eq(tasks.id, taskId));
      } catch (err) {
        logger.error('FrontendAgent', 'Failed to save recovery context: ' + err);
      }

      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: `Syntax errors after ${recoveryResult.attempts.fixLoops} fix attempts and ${recoveryResult.attempts.fullRetries} retries: ${errorSummary}`,
        outputs: {
          errors: recoveryResult.errors,
          recoveryAttempts: recoveryResult.attempts,
        },
      });

      throw new Error(`Generated code has syntax errors after recovery attempts: ${errorSummary}`);
    }

    // Write final validated files
    logger.log('FrontendAgent', `Writing ${recoveryResult.files.length} validated files...`);
    let writeResult = await writeGeneratedFiles(taskId, recoveryResult.files, 'frontend');

    // Skip bracket check — files already passed TS compiler validation in recovery loop.
    // The regex bracket counter produces false positives on valid code.
    const finalValidation = await validateGeneratedFiles(writeResult.taskDir, writeResult.files, { skipBracketCheck: true });
    if (!finalValidation.valid) {
      logger.warn('FrontendAgent', 'Post-recovery warnings (typos/non-syntax): ' + JSON.stringify(finalValidation.errors));
      try {
        await db
          .update(tasks)
          .set({ warnings: finalValidation.errors })
          .where(eq(tasks.id, taskId));
      } catch (err) {
        logger.error('FrontendAgent', 'Failed to save warnings: ' + err);
      }
    }

    // === Sandbox Test Execution ===
    if (process.env.DISABLE_SANDBOX_TESTS !== 'true') {
      const testFiles = findTestFiles(writeResult.taskDir);
      if (testFiles.length > 0) {
        logger.log('FrontendAgent', `Found ${testFiles.length} test file(s), executing sandbox tests...`);
        const testStart = Date.now();
        let testResult = await executeTestsInSandbox(writeResult.taskDir, { environment: 'jsdom' });
        logger.log('FrontendAgent', `Sandbox tests completed in ${Date.now() - testStart}ms`);

        if (!testResult.passed) {
          logger.warn('FrontendAgent', `Sandbox tests failed: ${testResult.passedTests}/${testResult.totalTests} passed, retrying...`);

          const testRetryPrompt = buildTestRetryPrompt(recoveryResult.files, testResult);
          const retryResponse = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            system: skillContent,
            messages: [{ role: 'user', content: testRetryPrompt }],
          });

          await recordAgentCost({
            projectId,
            taskId,
            agentType: 'frontend',
            model: MODEL,
            tokensInput: retryResponse.usage?.input_tokens ?? 0,
            tokensOutput: retryResponse.usage?.output_tokens ?? 0,
            cachedTokens: (retryResponse.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0,
            callSource: 'test-retry',
          });

          const retryText = retryResponse.content.find(c => c.type === 'text');
          const retryResponseText = retryText?.type === 'text' ? retryText.text : '';
          const retryParsed = parseAgentOutput(retryResponseText);

          if (retryParsed.files.length > 0) {
            writeResult = await writeGeneratedFiles(taskId, retryParsed.files, 'frontend');
            const retryTestStart = Date.now();
            testResult = await executeTestsInSandbox(writeResult.taskDir, { environment: 'jsdom' });
            logger.log('FrontendAgent', `Retry sandbox tests completed in ${Date.now() - retryTestStart}ms`);
          }

          if (!testResult.passed) {
            const failSummary = testResult.failures
              .slice(0, 3)
              .map(f => `${f.testName}: ${f.error.substring(0, 100)}`)
              .join('; ');

            await updateTaskStatus(taskId, 'failed', {
              success: false,
              error: `Sandbox tests failed after retry: ${failSummary}`,
              outputs: {
                testFailures: testResult.failures,
                testResult: { passed: testResult.passed, total: testResult.totalTests, failed: testResult.failedTests },
              },
            });

            throw new Error(`Sandbox tests failed after retry: ${failSummary}`);
          }
        }

        logger.log('FrontendAgent', `Sandbox tests: ${testResult.passedTests}/${testResult.totalTests} passed`);
      } else {
        logger.log('FrontendAgent', 'Sandbox tests: skipped (no test files)');
      }
    }

    logger.log('FrontendAgent', 'Creating artifact records...');

    // Create artifact records
    const artifactIds: string[] = [];

    for (const filePath of writeResult.files) {
      const [artifact] = await db
        .insert(artifacts)
        .values({
          projectId,
          taskId,
          type: getArtifactType(filePath),
          name: filePath.split('/').pop() || filePath,
          description: `Generated by frontend agent for task: ${name}`,
          filePath: `generated/tasks/${taskId}/${filePath}`,
          createdByAgent: 'frontend',
          metadata: {
            language: getLanguageFromPath(filePath),
          },
        })
        .returning({ id: artifacts.id });

      artifactIds.push(artifact.id);
    }

    logger.log('FrontendAgent', `Task ${taskId} completed successfully`);

    // Update task status
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary: `Generated ${recoveryResult.files.length} file(s)${recoveryResult.attempts.fixLoops > 0 ? ` (${recoveryResult.attempts.fixLoops} syntax fixes applied)` : ''}`,
      outputs: {
        generatedDir: writeResult.taskDir,
        files: writeResult.files,
        artifactIds,
        warnings: finalValidation.valid ? [] : finalValidation.errors,
        recoveryAttempts: recoveryResult.attempts,
      },
    });

    return {
      success: true,
      summary: `Generated ${recoveryResult.files.length} file(s)${recoveryResult.attempts.fixLoops > 0 ? ` (${recoveryResult.attempts.fixLoops} syntax fixes)` : ''}`,
      artifactIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('FrontendAgent', `Task ${taskId} failed: ${errorMessage}`);

    // Only overwrite status if task is still in a processing state.
    // Do NOT overwrite waiting_human (set when agent asks a question) or blocked.
    const currentTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { status: true },
    });
    if (!currentTask || currentTask.status === 'running' || currentTask.status === 'queued') {
      await updateTaskStatus(taskId, 'failed', {
        success: false,
        error: errorMessage,
      });
    }

    throw error; // Re-throw so BullMQ marks job as failed
  } finally {
    logger.close();
  }
}

/**
 * Determines programming language from file path (frontend-specific).
 */
function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript-react',
    js: 'javascript',
    jsx: 'javascript-react',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    html: 'html',
  };

  return ext ? languageMap[ext] : undefined;
}

/**
 * Create and start the frontend agent worker.
 */
export function createFrontendWorker(): Worker<TaskJobData> {
  console.log(`[FrontendAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processFrontendTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[FrontendAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[FrontendAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[FrontendAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[FrontendAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownFrontendWorker(worker: Worker): Promise<void> {
  console.log('[FrontendAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[FrontendAgent] Shutdown complete');
}
