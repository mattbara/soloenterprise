/**
 * Echo Agent
 *
 * A simple test agent that echoes input through Claude API.
 * Uses claude-sonnet-4-5-20250929 to make input more professional.
 */

import { Worker, Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { updateTaskStatus, type TaskJobData } from '../services/task-service';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';

const QUEUE_NAME = 'echo-tasks';

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
 * Process an echo task.
 */
async function processEchoTask(job: Job<TaskJobData>): Promise<{
  success: boolean;
  summary?: string;
  output?: string;
  error?: string;
}> {
  const { taskId, context } = job.data;
  const input = (context.input as string) ?? 'No input provided';

  console.log(`[EchoAgent] Processing task ${taskId} with input: "${input}"`);

  // Update status to running
  await updateTaskStatus(taskId, 'running');

  try {
    const client = getAnthropicClient();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Echo this and make it professional: ${input}`,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === 'text');
    const output = textContent?.type === 'text' ? textContent.text : 'No response generated';

    console.log(`[EchoAgent] Task ${taskId} completed. Output: "${output}"`);

    // Update status to completed
    await updateTaskStatus(taskId, 'completed', {
      success: true,
      summary: 'Echo task completed successfully',
      outputs: { output, input },
    });

    return {
      success: true,
      summary: 'Echo task completed successfully',
      output,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[EchoAgent] Task ${taskId} failed:`, errorMessage);

    // Update status to failed
    await updateTaskStatus(taskId, 'failed', {
      success: false,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Create and start the echo agent worker.
 */
export function createEchoWorker(): Worker<TaskJobData> {
  console.log(`[EchoAgent] Starting worker for queue: ${QUEUE_NAME}`);

  const worker = new Worker<TaskJobData>(QUEUE_NAME, processEchoTask, {
    connection: getSharedRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log(`[EchoAgent] Job ${job.id} completed:`, result.success ? 'success' : 'failed');
  });

  worker.on('failed', (job, error) => {
    console.error(`[EchoAgent] Job ${job?.id} failed with error:`, error.message);
  });

  worker.on('active', (job) => {
    console.log(`[EchoAgent] Job ${job.id} started`);
  });

  worker.on('error', (error) => {
    console.error('[EchoAgent] Worker error:', error);
  });

  return worker;
}

/**
 * Shutdown cleanup.
 */
export async function shutdownEchoWorker(worker: Worker): Promise<void> {
  console.log('[EchoAgent] Shutting down...');
  await worker.close();
  await closeSharedRedisConnection();
  console.log('[EchoAgent] Shutdown complete');
}
