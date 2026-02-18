/**
 * Tests for TaskLogger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs operations
const mockMkdirSync = vi.fn();
const mockAppendFileSync = vi.fn();

vi.mock('fs', () => ({
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  appendFileSync: (...args: any[]) => mockAppendFileSync(...args),
}));

import { TaskLogger } from '../../../utils/task-logger';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TaskLogger', () => {
  it('creates directory on first flush', () => {
    const logger = new TaskLogger('task-123');
    logger.log('TestSource', 'Hello');
    logger.flush();

    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    );
    logger.close();
  });

  it('only creates directory once (lazy init)', () => {
    const logger = new TaskLogger('task-456');
    logger.log('Source', 'First');
    logger.flush();
    logger.log('Source', 'Second');
    logger.warn('Source', 'Third');
    logger.flush();

    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
    logger.close();
  });

  it('buffers writes and flushes to disk', () => {
    const logger = new TaskLogger('task-789');
    logger.log('MyAgent', 'Processing task');

    // Not written yet — still buffered
    expect(mockAppendFileSync).toHaveBeenCalledTimes(0);

    // Flush writes buffered content
    logger.flush();
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[INFO]');
    expect(written).toContain('[MyAgent]');
    expect(written).toContain('Processing task');
    logger.close();
  });

  it('writes ERROR level for error()', () => {
    const logger = new TaskLogger('task-err');
    logger.error('Agent', 'Something broke');
    logger.flush();

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[ERROR]');
    expect(written).toContain('Something broke');
    logger.close();
  });

  it('writes WARN level for warn()', () => {
    const logger = new TaskLogger('task-warn');
    logger.warn('Agent', 'Heads up');
    logger.flush();

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[WARN]');
    expect(written).toContain('Heads up');
    logger.close();
  });

  it('includes ISO timestamp in log line', () => {
    const logger = new TaskLogger('task-ts');
    logger.log('Agent', 'Check time');
    logger.flush();

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    // ISO date pattern: YYYY-MM-DDTHH:mm:ss
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    logger.close();
  });

  it('also writes to console immediately (not buffered)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new TaskLogger('task-console');
    logger.log('Source', 'Hello console');

    // Console is immediate, no flush needed
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Source] Hello console')
    );
    logger.close();
  });

  it('does not crash when appendFileSync throws', () => {
    mockAppendFileSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const logger = new TaskLogger('task-err');
    logger.log('Agent', 'message');
    // Flush triggers the write — should not throw
    expect(() => logger.flush()).not.toThrow();
    logger.close();
  });

  it('close() flushes remaining buffer and stops timer', () => {
    const logger = new TaskLogger('task-close');
    logger.log('Agent', 'line 1');
    logger.log('Agent', 'line 2');

    expect(mockAppendFileSync).toHaveBeenCalledTimes(0);
    logger.close();

    // close() should have flushed
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('line 1');
    expect(written).toContain('line 2');

    // Second close is a no-op
    logger.close();
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
  });

  it('getLogFilePath returns path containing task ID', () => {
    const path = TaskLogger.getLogFilePath('my-task-id');
    expect(path).toContain('my-task-id');
    expect(path).toContain('task.log');
  });
});
