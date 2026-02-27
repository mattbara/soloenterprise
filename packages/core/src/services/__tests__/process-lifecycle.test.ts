/**
 * Tests for process-lifecycle.ts
 *
 * Tests process liveness checks, stale worker killing, and cleanup orchestration.
 * Redis-dependent functions are mocked via worker-registry mock.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock worker-registry before importing process-lifecycle
const mockGetWorkerStatus = vi.fn();
const mockDeregisterWorker = vi.fn();

vi.mock('../worker-registry', () => ({
  getWorkerStatus: (...args: unknown[]) => mockGetWorkerStatus(...args),
  deregisterWorker: (...args: unknown[]) => mockDeregisterWorker(...args),
}));

// Mock process.kill for controlled testing
const originalKill = process.kill;
let killMock: ReturnType<typeof vi.fn>;

import {
  isProcessAlive,
  killStaleWorker,
  killAllStaleWorkers,
  ensureCleanBeforeSpawn,
} from '../process-lifecycle';

describe('isProcessAlive', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetWorkerStatus.mockReset();
    mockDeregisterWorker.mockReset();
  });

  it('returns true for the current process PID', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for a bogus PID', () => {
    // PID 2147483647 is max int32 — extremely unlikely to be running
    expect(isProcessAlive(2147483647)).toBe(false);
  });
});

describe('killStaleWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetWorkerStatus.mockReset();
    mockDeregisterWorker.mockReset();
    // Replace process.kill with mock
    killMock = vi.fn();
    process.kill = killMock as unknown as typeof process.kill;
  });

  afterAll(() => {
    process.kill = originalKill;
  });

  it('returns no-op when no PID in registry', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: null, status: 'stopped' });

    const result = await killStaleWorker('backend');

    expect(result.killed).toBe(false);
    expect(result.pid).toBeUndefined();
    expect(mockDeregisterWorker).not.toHaveBeenCalled();
  });

  it('deregisters without killing when PID is already dead', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: 99999999, status: 'running' });
    // isProcessAlive check: kill(pid, 0) throws for dead process
    killMock.mockImplementation((pid: number, signal: string | number) => {
      if (signal === 0) throw new Error('ESRCH');
      return true;
    });

    const result = await killStaleWorker('backend');

    expect(result.killed).toBe(false);
    expect(result.pid).toBe(99999999);
    expect(mockDeregisterWorker).toHaveBeenCalledWith('backend');
  });

  it('sends SIGTERM to process group and deregisters for alive PID', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: 12345, status: 'running' });
    // First call: isProcessAlive (signal 0) — alive
    // Second call: kill(-pid, SIGTERM)
    // Third call: isProcessAlive after wait — dead
    let callCount = 0;
    killMock.mockImplementation((pid: number, signal: string | number) => {
      callCount++;
      if (signal === 0 && callCount <= 1) return true; // alive on first check
      if (signal === 'SIGTERM') return true; // SIGTERM succeeds
      if (signal === 0) throw new Error('ESRCH'); // dead after SIGTERM
      return true;
    });

    const result = await killStaleWorker('backend');

    expect(result.killed).toBe(true);
    expect(result.pid).toBe(12345);
    // Should have sent SIGTERM to negative PID (process group)
    expect(killMock).toHaveBeenCalledWith(-12345, 'SIGTERM');
    expect(mockDeregisterWorker).toHaveBeenCalledWith('backend');
  }, 10000);

  it('escalates to SIGKILL if process survives SIGTERM', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: 12345, status: 'running' });
    // Process stays alive through SIGTERM
    killMock.mockImplementation((pid: number, signal: string | number) => {
      if (signal === 0) return true; // always alive
      return true;
    });

    const result = await killStaleWorker('backend');

    expect(result.killed).toBe(true);
    expect(killMock).toHaveBeenCalledWith(-12345, 'SIGTERM');
    expect(killMock).toHaveBeenCalledWith(-12345, 'SIGKILL');
    expect(mockDeregisterWorker).toHaveBeenCalledWith('backend');
  }, 10000);
});

describe('killAllStaleWorkers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetWorkerStatus.mockReset();
    mockDeregisterWorker.mockReset();
    killMock = vi.fn();
    process.kill = killMock as unknown as typeof process.kill;
  });

  afterAll(() => {
    process.kill = originalKill;
  });

  it('iterates all worker types and reports which were killed', async () => {
    // backend has a stale PID, everything else has no PID
    mockGetWorkerStatus.mockImplementation(async (type: string) => {
      if (type === 'backend') return { pid: 55555, status: 'running' };
      return { pid: null, status: 'stopped' };
    });

    // PID 55555 is alive
    killMock.mockImplementation((pid: number, signal: string | number) => {
      if (signal === 0 && Math.abs(pid) === 55555) return true;
      if (signal === 0) throw new Error('ESRCH');
      return true;
    });

    const result = await killAllStaleWorkers();

    expect(result.killed).toContain('backend');
    expect(result.killed.length).toBe(1);
    expect(mockDeregisterWorker).toHaveBeenCalledWith('backend');
  }, 10000);
});

describe('ensureCleanBeforeSpawn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetWorkerStatus.mockReset();
    mockDeregisterWorker.mockReset();
    killMock = vi.fn();
    process.kill = killMock as unknown as typeof process.kill;
  });

  afterAll(() => {
    process.kill = originalKill;
  });

  it('delegates to killAllStaleWorkers for type "all"', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: null, status: 'stopped' });

    await ensureCleanBeforeSpawn('all');

    // Should have checked all worker types
    expect(mockGetWorkerStatus).toHaveBeenCalledTimes(9); // 9 worker types
  });

  it('delegates to killStaleWorker for a specific type', async () => {
    mockGetWorkerStatus.mockResolvedValue({ pid: null, status: 'stopped' });

    await ensureCleanBeforeSpawn('backend');

    expect(mockGetWorkerStatus).toHaveBeenCalledTimes(1);
    expect(mockGetWorkerStatus).toHaveBeenCalledWith('backend');
  });
});
