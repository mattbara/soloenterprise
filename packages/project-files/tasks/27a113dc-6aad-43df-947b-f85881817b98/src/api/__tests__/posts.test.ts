import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  postsFindFirst: vi.fn(),
  postsFindMany: vi.fn(),
  postsInsert: vi.fn(),
  postsUpdate: vi.fn(),
  postsDelete: vi.fn(),
}));

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      posts: {
        findFirst: mocks.postsFindFirst,
        findMany: mocks.postsFindMany,
      },
    },
    insert: () => ({
      values: () => ({
        returning: mocks.postsInsert,
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mocks.postsUpdate,
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: mocks.postsDelete,
      }),
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  posts: {
    id: 'id',
    title: 'title',
    content: 'content',
    authorId: 'authorId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  isNull: vi.fn((field: any) => ['isNull', field]),
  desc: vi.fn((field: any) => ['desc', field]),
}));

// Import the API handler (will fail until implemented)
// This import will throw until the file exists
let postsApi: any;
try {
  postsApi = await import('../posts');
} catch {
  // Expected to fail in TDD — tests define the contract
  postsApi = null;
}

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createMockPost(overrides: Partial<{
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}> = {}) {
  return {
    id: 'post-1',
    title: 'Test Post',
    content: 'This is test content',
    authorId: 'author-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function createMockRequest(options: {
  method: string;
  url: string;
  body?: any;
  query?: Record<string, string>;
}) {
  const url = new URL(options.url, 'http://localhost:3000');
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return new Request(url.toString(), {
    method: options.method,
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pagination', () => {
    it('returns paginated posts with default limit 10 and offset 0', async () => {
      if (!postsApi) {
        expect(true).toBe(false); // Fail until implementation exists
        return;
      }

      const mockPosts = Array.from({ length: 10 }, (_, i) =>
        createMockPost({ id: `post-${i}`, title: `Post ${i}` })
      );
      mocks.postsFindMany.mockResolvedValue(mockPosts);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
      });

      const response = await postsApi.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(10);
      expect(body.pagination).toEqual({
        limit: 10,
        offset: 0,
        total: 10,
      });
      expect(mocks.postsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
        })
      );
    });

    it('accepts custom limit parameter', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const mockPosts = Array.from({ length: 5 }, (_, i) =>
        createMockPost({ id: `post-${i}` })
      );
      mocks.postsFindMany.mockResolvedValue(mockPosts);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
        query: { limit: '5' },
      });

      const response = await postsApi.GET(request);
      const body = await response.json();

      expect(body.data).toHaveLength(5);
      expect(body.pagination.limit).toBe(5);
      expect(mocks.postsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });

    it('accepts custom offset parameter', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const mockPosts = Array.from({ length: 10 }, (_, i) =>
        createMockPost({ id: `post-${i + 20}` })
      );
      mocks.postsFindMany.mockResolvedValue(mockPosts);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
        query: { offset: '20' },
      });

      const response = await postsApi.GET(request);
      const body = await response.json();

      expect(body.pagination.offset).toBe(20);
      expect(mocks.postsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 })
      );
    });

    it('returns empty array when no posts exist', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      mocks.postsFindMany.mockResolvedValue([]);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
      });

      const response = await postsApi.GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('filtering', () => {
    it('excludes soft-deleted posts by default', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const activePosts = [
        createMockPost({ id: 'post-1', deletedAt: null }),
        createMockPost({ id: 'post-2', deletedAt: null }),
      ];
      mocks.postsFindMany.mockResolvedValue(activePosts);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
      });

      await postsApi.GET(request);

      // Verify query includes deletedAt IS NULL filter
      expect(mocks.postsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(), // Should include isNull(deletedAt)
        })
      );
    });
  });

  describe('sorting', () => {
    it('returns posts sorted by createdAt descending', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const mockPosts = [
        createMockPost({ id: 'post-2', createdAt: new Date('2024-01-02') }),
        createMockPost({ id: 'post-1', createdAt: new Date('2024-01-01') }),
      ];
      mocks.postsFindMany.mockResolvedValue(mockPosts);

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
      });

      const response = await postsApi.GET(request);
      const body = await response.json();

      expect(body.data[0].id).toBe('post-2');
      expect(body.data[1].id).toBe('post-1');
    });
  });

  describe('error handling', () => {
    it('returns 400 for invalid limit parameter', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
        query: { limit: 'invalid' },
      });

      const response = await postsApi.GET(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('limit');
    });

    it('returns 400 for negative limit', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
        query: { limit: '-5' },
      });

      const response = await postsApi.GET(request);

      expect(response.status).toBe(400);
    });

    it('returns 400 for negative offset', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
        query: { offset: '-10' },
      });

      const response = await postsApi.GET(request);

      expect(response.status).toBe(400);
    });

    it('returns 500 when database query fails', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      mocks.postsFindMany.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest({
        method: 'GET',
        url: '/api/posts',
      });

      const response = await postsApi.GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });
});

describe('GET /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a single post by id', async () => {
    if (!postsApi) {
      expect(true).toBe(false);
      return;
    }

    const mockPost = createMockPost({ id: 'post-123' });
    mocks.postsFindFirst.mockResolvedValue(mockPost);

    const request = createMockRequest({
      method: 'GET',
      url: '/api/posts/post-123',
    });

    const response = await postsApi.GET(request, { params: { id: 'post-123' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe('post-123');
    expect(body.data.title).toBe('Test Post');
    expect(mocks.postsFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(), // Should include eq(id, 'post-123')
      })
    );
  });

  it('returns 404 when post does not exist', async () => {
    if (!postsApi) {
      expect(true).toBe(false);
      return;
    }

    mocks.postsFindFirst.mockResolvedValue(null);

    const request = createMockRequest({
      method: 'GET',
      url: '/api/posts/nonexistent',
    });

    const response = await postsApi.GET(request, { params: { id: 'nonexistent' } });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('not found');
  });

  it('returns 404 when post is soft-deleted', async () => {
    if (!postsApi) {
      expect(true).toBe(false);
      return;
    }

    const deletedPost = createMockPost({
      id: 'post-123',
      deletedAt: new Date('2024-01-15'),
    });
    mocks.postsFindFirst.mockResolvedValue(deletedPost);

    const request = createMockRequest({
      method: 'GET',
      url: '/api/posts/post-123',
    });

    const response = await postsApi.GET(request, { params: { id: 'post-123' } });

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    if (!postsApi) {
      expect(true).toBe(false);
      return;
    }

    const request = createMockRequest({
      method: 'GET',
      url: '/api/posts/not-a-uuid',
    });

    const response = await postsApi.GET(request, { params: { id: 'not-a-uuid' } });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 500 when database query fails', async () => {
    if (!postsApi) {
      expect(true).toBe(false);
      return;
    }

    mocks.postsFindFirst.mockRejectedValue(new Error('Database error'));

    const request = createMockRequest({
      method: 'GET',
      url: '/api/posts/post-123',
    });

    const response = await postsApi.GET(request, { params: { id: 'post-123' } });

    expect(response.status).toBe(500);
  });
});

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful creation', () => {
    it('creates a new post with valid data', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const newPost = createMockPost({
        id: 'new-post-id',
        title: 'New Post',
        content: 'New content',
        authorId: 'author-123',
      });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'New Post',
          content: 'New content',
          authorId: 'author-123',
        },
      });

      const response = await postsApi.POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data.id).toBe('new-post-id');
      expect(body.data.title).toBe('New Post');
      expect(mocks.postsInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'New Post',
          content: 'New content',
          authorId: 'author-123',
        }),
      ]);
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const now = new Date();
      const newPost = createMockPost({
        createdAt: now,
        updatedAt: now,
      });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Test',
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);
      const body = await response.json();

      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('sets deletedAt to null for new posts', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const newPost = createMockPost({ deletedAt: null });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Test',
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);
      const body = await response.json();

      expect(body.data.deletedAt).toBeNull();
    });
  });

  describe('title validation', () => {
    it('returns 400 when title is missing', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('title');
    });

    it('returns 400 when title is empty string', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: '',
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const longTitle = 'a'.repeat(201);
      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: longTitle,
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('200');
    });

    it('accepts title with exactly 200 characters', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const maxTitle = 'a'.repeat(200);
      const newPost = createMockPost({ title: maxTitle });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: maxTitle,
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(201);
    });

    it('accepts title with 1 character', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const newPost = createMockPost({ title: 'A' });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'A',
          content: 'Content',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('content validation', () => {
    it('returns 400 when content is missing', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('content');
    });

    it('returns 400 when content is empty string', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: '',
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
    });

    it('accepts content with any length greater than 0', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const longContent = 'a'.repeat(10000);
      const newPost = createMockPost({ content: longContent });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: longContent,
          authorId: 'author-1',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('authorId validation', () => {
    it('returns 400 when authorId is missing', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: 'Content',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('authorId');
    });

    it('returns 400 when authorId is not a valid UUID', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: 'Content',
          authorId: 'not-a-uuid',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('UUID');
    });

    it('accepts valid UUID v4 format', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const newPost = createMockPost({ authorId: validUuid });
      mocks.postsInsert.mockResolvedValue([newPost]);

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: 'Content',
          authorId: validUuid,
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('error handling', () => {
    it('returns 400 for invalid JSON body', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = new Request('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(400);
    });

    it('returns 500 when database insert fails', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      mocks.postsInsert.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({
        method: 'POST',
        url: '/api/posts',
        body: {
          title: 'Title',
          content: 'Content',
          authorId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });

      const response = await postsApi.POST(request);

      expect(response.status).toBe(500);
    });
  });
});

describe('PUT /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful updates', () => {
    it('updates post title', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ id: 'post-123' });
      const updatedPost = { ...existingPost, title: 'Updated Title' };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated Title',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.title).toBe('Updated Title');
      expect(mocks.postsUpdate).toHaveBeenCalled();
    });

    it('updates post content', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ id: 'post-123' });
      const updatedPost = { ...existingPost, content: 'Updated content' };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          content: 'Updated content',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.content).toBe('Updated content');
    });

    it('updates both title and content', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ id: 'post-123' });
      const updatedPost = {
        ...existingPost,
        title: 'New Title',
        content: 'New content',
      };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'New Title',
          content: 'New content',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.title).toBe('New Title');
      expect(body.data.content).toBe('New content');
    });

    it('updates updatedAt timestamp', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2024-01-15');
      const existingPost = createMockPost({ updatedAt: oldDate });
      const updatedPost = { ...existingPost, updatedAt: newDate };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(new Date(body.data.updatedAt).getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('does not modify other fields', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({
        id: 'post-123',
        authorId: 'author-1',
        createdAt: new Date('2024-01-01'),
      });
      const updatedPost = { ...existingPost, title: 'Updated' };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(body.data.id).toBe('post-123');
      expect(body.data.authorId).toBe('author-1');
      expect(body.data.createdAt).toBe(existingPost.createdAt.toISOString());
    });
  });

  describe('validation', () => {
    it('returns 400 when no fields provided', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {},
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('at least one field');
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const longTitle = 'a'.repeat(201);
      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: longTitle,
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(400);
    });

    it('returns 400 when content is empty string', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          content: '',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(400);
    });

    it('ignores attempts to update authorId', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ authorId: 'author-1' });
      const updatedPost = { ...existingPost, title: 'Updated' };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
          authorId: 'different-author', // Should be ignored
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(body.data.authorId).toBe('author-1'); // Unchanged
    });

    it('ignores attempts to update id', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ id: 'post-123' });
      const updatedPost = { ...existingPost, title: 'Updated' };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([updatedPost]);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
          id: 'different-id', // Should be ignored
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });
      const body = await response.json();

      expect(body.data.id).toBe('post-123'); // Unchanged
    });
  });

  describe('error handling', () => {
    it('returns 404 when post does not exist', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      mocks.postsFindFirst.mockResolvedValue(null);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/nonexistent',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'nonexistent' } });

      expect(response.status).toBe(404);
    });

    it('returns 404 when post is soft-deleted', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const deletedPost = createMockPost({
        deletedAt: new Date('2024-01-15'),
      });
      mocks.postsFindFirst.mockResolvedValue(deletedPost);

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid UUID format', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/not-a-uuid',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'not-a-uuid' } });

      expect(response.status).toBe(400);
    });

    it('returns 500 when database update fails', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost();
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({
        method: 'PUT',
        url: '/api/posts/post-123',
        body: {
          title: 'Updated',
        },
      });

      const response = await postsApi.PUT(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(500);
    });
  });
});

describe('DELETE /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('soft delete behavior', () => {
    it('performs soft delete by setting deletedAt timestamp', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost({ id: 'post-123', deletedAt: null });
      const deletedPost = {
        ...existingPost,
        deletedAt: new Date('2024-01-15'),
      };
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([deletedPost]);

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/post-123',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(204);
      expect(mocks.postsUpdate).toHaveBeenCalled();
      // Verify it's an update, not a hard delete
      expect(mocks.postsDelete).not.toHaveBeenCalled();
    });

    it('does not actually remove post from database', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost();
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([{ ...existingPost, deletedAt: new Date() }]);

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/post-123',
      });

      await postsApi.DELETE(request, { params: { id: 'post-123' } });

      // Verify db.delete() was never called
      expect(mocks.postsDelete).not.toHaveBeenCalled();
    });

    it('returns 204 No Content on successful delete', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost();
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockResolvedValue([{ ...existingPost, deletedAt: new Date() }]);

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/post-123',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(204);
      const text = await response.text();
      expect(text).toBe(''); // No body for 204
    });
  });

  describe('idempotency', () => {
    it('returns 204 when deleting already-deleted post', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const deletedPost = createMockPost({
        deletedAt: new Date('2024-01-10'),
      });
      mocks.postsFindFirst.mockResolvedValue(deletedPost);

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/post-123',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(204);
      // Should not attempt to update again
      expect(mocks.postsUpdate).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 404 when post does not exist', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      mocks.postsFindFirst.mockResolvedValue(null);

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/nonexistent',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'nonexistent' } });

      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid UUID format', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/not-a-uuid',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'not-a-uuid' } });

      expect(response.status).toBe(400);
    });

    it('returns 500 when database update fails', async () => {
      if (!postsApi) {
        expect(true).toBe(false);
        return;
      }

      const existingPost = createMockPost();
      mocks.postsFindFirst.mockResolvedValue(existingPost);
      mocks.postsUpdate.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({
        method: 'DELETE',
        url: '/api/posts/post-123',
      });

      const response = await postsApi.DELETE(request, { params: { id: 'post-123' } });

      expect(response.status).toBe(500);
    });
  });
});