/**
 * Tests for TaskLogger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('TaskLogger', () => {
  it('creates directory on first write', () => {
    const logger = new TaskLogger('task-123');
    logger.log('TestSource', 'Hello');

    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      { recursive: true }
    );
  });

  it('only creates directory once (lazy init)', () => {
    const logger = new TaskLogger('task-456');
    logger.log('Source', 'First');
    logger.log('Source', 'Second');
    logger.warn('Source', 'Third');

    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
  });

  it('writes INFO level for log()', () => {
    const logger = new TaskLogger('task-789');
    logger.log('MyAgent', 'Processing task');

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[INFO]');
    expect(written).toContain('[MyAgent]');
    expect(written).toContain('Processing task');
  });

  it('writes ERROR level for error()', () => {
    const logger = new TaskLogger('task-err');
    logger.error('Agent', 'Something broke');

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[ERROR]');
    expect(written).toContain('Something broke');
  });

  it('writes WARN level for warn()', () => {
    const logger = new TaskLogger('task-warn');
    logger.warn('Agent', 'Heads up');

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    expect(written).toContain('[WARN]');
    expect(written).toContain('Heads up');
  });

  it('includes ISO timestamp in log line', () => {
    const logger = new TaskLogger('task-ts');
    logger.log('Agent', 'Check time');

    const written = mockAppendFileSync.mock.calls[0][1] as string;
    // ISO date pattern: YYYY-MM-DDTHH:mm:ss
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('also writes to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new TaskLogger('task-console');
    logger.log('Source', 'Hello console');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Source] Hello console')
    );
  });

  it('does not crash when appendFileSync throws', () => {
    mockAppendFileSync.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const logger = new TaskLogger('task-err');
    // Should not throw
    expect(() => logger.log('Agent', 'message')).not.toThrow();
  });

  it('getLogFilePath returns path containing task ID', () => {
    const path = TaskLogger.getLogFilePath('my-task-id');
    expect(path).toContain('my-task-id');
    expect(path).toContain('task.log');
  });
});
