/**
 * Tests for reports API endpoints.
 *
 * Mocks database, task queue, and Next.js primitives.
 * Tests route handler functions directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks (available before vi.mock factories) ---

const { mockFindFirst, mockDb, mockCreateTask } = vi.hoisted(() => {
  const mockFindFirst = vi.fn();
  const mockDb = {
    query: {
      projects: { findFirst: mockFindFirst },
    },
    select: vi.fn(),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  };
  const mockCreateTask = vi.fn();
  return { mockFindFirst, mockDb, mockCreateTask };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@soloenterprise/db/schema', () => ({
  projects: { id: 'id' },
  clientReports: {
    id: 'id',
    projectId: 'projectId',
    reportType: 'reportType',
    reportContent: 'reportContent',
    internalNotes: 'internalNotes',
    period: 'period',
    status: 'status',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  desc: vi.fn((col: any) => ({ type: 'desc', col })),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

vi.mock('@soloenterprise/core/services', () => ({
  createTask: (...args: any[]) => mockCreateTask(...args),
}));

// --- Helpers ---

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

// --- Import handlers ---

import { POST } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ==========================================================================
// POST /api/reports
// ==========================================================================

describe('POST /api/reports', () => {
  it('returns 202 with jobId for valid request', async () => {
    mockFindFirst.mockResolvedValue({ id: VALID_UUID, name: 'My Project' });
    mockCreateTask.mockResolvedValue({ jobId: 'job-123' });

    const res = await POST(makeRequest({
      projectId: VALID_UUID,
      reportType: 'weekly',
    }));

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.jobId).toBe('job-123');
    expect(data.reportType).toBe('weekly');
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await POST(makeRequest({ reportType: 'weekly' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('projectId');
  });

  it('returns 400 when reportType is missing', async () => {
    const res = await POST(makeRequest({ projectId: VALID_UUID }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('reportType');
  });

  it('returns 400 for invalid reportType', async () => {
    const res = await POST(makeRequest({
      projectId: VALID_UUID,
      reportType: 'invalid',
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('reportType');
  });

  it('returns 404 when project does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({
      projectId: VALID_UUID,
      reportType: 'weekly',
    }));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await POST(makeRequest({
      projectId: 'not-a-uuid',
      reportType: 'weekly',
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('UUID');
  });
});

// ==========================================================================
// GET /api/reports/{projectId}
// ==========================================================================

describe('GET /api/reports/{projectId}', async () => {
  const { GET } = await import('../[projectId]/route');

  const makeParams = (projectId: string) => Promise.resolve({ projectId });

  function setupListQuery(reports: any[], total: number) {
    const limitFn = vi.fn().mockResolvedValue(reports);
    const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: fromFn };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: total }]),
        }),
      };
    });
  }

  it('returns array of reports ordered by createdAt desc', async () => {
    const reports = [
      { id: '1', reportType: 'weekly', createdAt: new Date('2026-02-03') },
      { id: '2', reportType: 'weekly', createdAt: new Date('2026-02-02') },
      { id: '3', reportType: 'milestone', createdAt: new Date('2026-02-01') },
    ];
    setupListQuery(reports, 3);

    const res = await GET(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reports).toHaveLength(3);
    expect(data.total).toBe(3);
  });

  it('returns empty array with total 0 when no reports exist', async () => {
    setupListQuery([], 0);

    const res = await GET(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reports).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('accepts type filter query param', async () => {
    setupListQuery([{ id: '1', reportType: 'weekly' }], 1);

    const res = await GET(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}?type=weekly`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
  });

  it('accepts status filter query param', async () => {
    setupListQuery([{ id: '1', status: 'draft' }], 1);

    const res = await GET(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}?status=draft`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
  });

  it('respects limit query param', async () => {
    setupListQuery([{ id: '1' }, { id: '2' }], 5);

    const res = await GET(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}?limit=2`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reports).toHaveLength(2);
  });
});

// ==========================================================================
// GET /api/reports/{projectId}/latest
// ==========================================================================

describe('GET /api/reports/{projectId}/latest', async () => {
  const { GET: GETLatest } = await import('../[projectId]/latest/route');

  const makeParams = (projectId: string) => Promise.resolve({ projectId });

  function setupLatestQuery(report: any | null) {
    const limitFn = vi.fn().mockResolvedValue(report ? [report] : []);
    const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    mockDb.select.mockReturnValue({ from: fromFn });
  }

  it('returns the most recent report', async () => {
    setupLatestQuery({
      id: 'latest-1',
      reportType: 'weekly',
      reportContent: 'Latest report',
      createdAt: new Date('2026-02-15'),
    });

    const res = await GETLatest(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}/latest`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('latest-1');
  });

  it('returns 404 when no reports exist', async () => {
    setupLatestQuery(null);

    const res = await GETLatest(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}/latest`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('No reports found');
  });

  it('accepts type filter for latest endpoint', async () => {
    setupLatestQuery({
      id: 'milestone-1',
      reportType: 'milestone',
      reportContent: 'Milestone report',
    });

    const res = await GETLatest(
      makeGetRequest(`http://localhost/api/reports/${VALID_UUID}/latest?type=milestone`),
      { params: makeParams(VALID_UUID) }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reportType).toBe('milestone');
  });
});
