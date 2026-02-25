import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@soloenterprise/db';

// Mock the database module
vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      posts: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  posts: {
    id: 'id',
    title: 'title',
    content: 'content',
    authorId: 'authorId',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  isNull: vi.fn((field: any) => ['isNull', field]),
}));

// Mock app instance - will be implemented by backend agent
const mockApp = {
  request: vi.fn(),
};

// Get typed mock references
const mockFindFirst = vi.mocked(db.query.posts.findFirst);
const mockFindMany = vi.mocked(db.query.posts.findMany);
const mockInsert = vi.mocked(db.insert);
const mockUpdate = vi.mocked(db.update);

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful creation', () => {
    it('creates post with valid data and returns 201', async () => {
      const newPost = {
        title: 'Test Post',
        content: 'This is test content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const createdPost = {
        id: '987e6543-e21b-12d3-a456-426614174000',
        ...newPost,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      // Mock database insert
      const mockReturning = vi.fn().mockResolvedValue([createdPost]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues } as any);

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.id).toBeDefined();
      expect(body.title).toBe(newPost.title);
      expect(body.content).toBe(newPost.content);
      expect(body.authorId).toBe(newPost.authorId);
      expect(body.deletedAt).toBeNull();
    });

    it('creates post with title at minimum length (1 char)', async () => {
      const newPost = {
        title: 'A',
        content: 'Content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const createdPost = {
        id: '987e6543-e21b-12d3-a456-426614174000',
        ...newPost,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockReturning = vi.fn().mockResolvedValue([createdPost]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues } as any);

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      });

      expect(response.status).toBe(201);
    });

    it('creates post with title at maximum length (200 chars)', async () => {
      const newPost = {
        title: 'A'.repeat(200),
        content: 'Content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const createdPost = {
        id: '987e6543-e21b-12d3-a456-426614174000',
        ...newPost,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const mockReturning = vi.fn().mockResolvedValue([createdPost]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      mockInsert.mockReturnValue({ values: mockValues } as any);

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      });

      expect(response.status).toBe(201);
    });
  });

  describe('validation errors', () => {
    it('returns 400 when title is missing', async () => {
      const invalidPost = {
        content: 'Content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 when title is empty string', async () => {
      const invalidPost = {
        title: '',
        content: 'Content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      const invalidPost = {
        title: 'A'.repeat(201),
        content: 'Content',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
      const invalidPost = {
        title: 'Title',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when content is empty string', async () => {
      const invalidPost = {
        title: 'Title',
        content: '',
        authorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when authorId is missing', async () => {
      const invalidPost = {
        title: 'Title',
        content: 'Content',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when authorId is not a valid UUID', async () => {
      const invalidPost = {
        title: 'Title',
        content: 'Content',
        authorId: 'not-a-uuid',
      };

      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPost),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when request body is not JSON', async () => {
      const response = await mockApp.request('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);
    });
  });
});

describe('GET /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful retrieval', () => {
    it('returns paginated posts with default limit and offset', async () => {
      const mockPosts = [
        {
          id: '1',
          title: 'Post 1',
          content: 'Content 1',
          authorId: 'author-1',
          createdAt: new Date('2024-01-15T10:00:00Z'),
          updatedAt: new Date('2024-01-15T10:00:00Z'),
          deletedAt: null,
        },
        {
          id: '2',
          title: 'Post 2',
          content: 'Content 2',
          authorId: 'author-2',
          createdAt: new Date('2024-01-15T11:00:00Z'),
          updatedAt: new Date('2024-01-15T11:00:00Z'),
          deletedAt: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockPosts);

      const response = await mockApp.request('/api/posts', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toHaveLength(2);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
        })
      );
    });

    it('returns posts with custom limit', async () => {
      const mockPosts = Array.from({ length: 5 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Post ${i + 1}`,
        content: `Content ${i + 1}`,
        authorId: 'author-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }));

      mockFindMany.mockResolvedValue(mockPosts);

      const response = await mockApp.request('/api/posts?limit=5', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.limit).toBe(5);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        })
      );
    });

    it('returns posts with custom offset', async () => {
      const mockPosts = [
        {
          id: '11',
          title: 'Post 11',
          content: 'Content 11',
          authorId: 'author-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockPosts);

      const response = await mockApp.request('/api/posts?offset=10', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.offset).toBe(10);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 10,
        })
      );
    });

    it('returns posts with both custom limit and offset', async () => {
      const mockPosts = [
        {
          id: '21',
          title: 'Post 21',
          content: 'Content 21',
          authorId: 'author-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockPosts);

      const response = await mockApp.request('/api/posts?limit=20&offset=20', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.limit).toBe(20);
      expect(body.offset).toBe(20);
    });

    it('returns empty array when no posts exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const response = await mockApp.request('/api/posts', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual([]);
    });

    it('excludes soft-deleted posts from results', async () => {
      const mockPosts = [
        {
          id: '1',
          title: 'Active Post',
          content: 'Content',
          authorId: 'author-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockPosts);

      const response = await mockApp.request('/api/posts', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      // Verify that the query filters out deleted posts
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(), // Should include isNull(deletedAt) condition
        })
      );
    });
  });

  describe('validation errors', () => {
    it('returns 400 when limit is not a number', async () => {
      const response = await mockApp.request('/api/posts?limit=abc', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when offset is not a number', async () => {
      const response = await mockApp.request('/api/posts?offset=xyz', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when limit is negative', async () => {
      const response = await mockApp.request('/api/posts?limit=-5', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when offset is negative', async () => {
      const response = await mockApp.request('/api/posts?offset=-10', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });
  });
});

describe('GET /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful retrieval', () => {
    it('returns post when it exists', async () => {
      const mockPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Post',
        content: 'Test Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      mockFindFirst.mockResolvedValue(mockPost);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(mockPost.id);
      expect(body.title).toBe(mockPost.title);
      expect(body.content).toBe(mockPost.content);
      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.anything(),
        })
      );
    });
  });

  describe('error cases', () => {
    it('returns 404 when post does not exist', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'GET',
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 when post is soft-deleted', async () => {
      const deletedPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Deleted Post',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date('2024-01-15T12:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(undefined); // Query filters out deleted posts

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'GET',
      });

      expect(response.status).toBe(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const response = await mockApp.request('/api/posts/invalid-id', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });
  });
});

describe('PUT /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful updates', () => {
    it('updates title only', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Old Title',
        content: 'Original Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const updatedPost = {
        ...existingPost,
        title: 'New Title',
        updatedAt: new Date('2024-01-15T11:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([updatedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.title).toBe('New Title');
      expect(body.content).toBe('Original Content');
    });

    it('updates content only', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Title',
        content: 'Old Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const updatedPost = {
        ...existingPost,
        content: 'New Content',
        updatedAt: new Date('2024-01-15T11:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([updatedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New Content' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.content).toBe('New Content');
      expect(body.title).toBe('Title');
    });

    it('updates both title and content', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Old Title',
        content: 'Old Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const updatedPost = {
        ...existingPost,
        title: 'New Title',
        content: 'New Content',
        updatedAt: new Date('2024-01-15T11:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([updatedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title', content: 'New Content' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.title).toBe('New Title');
      expect(body.content).toBe('New Content');
    });

    it('updates updatedAt timestamp', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Title',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const updatedPost = {
        ...existingPost,
        title: 'New Title',
        updatedAt: new Date('2024-01-15T11:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([updatedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        new Date(existingPost.updatedAt).getTime()
      );
    });
  });

  describe('validation errors', () => {
    it('returns 400 when title exceeds 200 characters', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'A'.repeat(201) }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when title is empty string', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when content is empty string', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when no fields provided', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const response = await mockApp.request('/api/posts/invalid-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when trying to update authorId', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: 'new-author-id' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when trying to update id', async () => {
      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'new-id' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('error cases', () => {
    it('returns 404 when post does not exist', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 when post is soft-deleted', async () => {
      const deletedPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Deleted Post',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date('2024-01-15T12:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(undefined); // Query filters out deleted posts

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      expect(response.status).toBe(404);
    });
  });
});

describe('DELETE /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful deletion', () => {
    it('soft deletes post and returns 204', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Post to Delete',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const deletedPost = {
        ...existingPost,
        deletedAt: new Date('2024-01-15T12:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([deletedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      });

      expect(response.status).toBe(204);
      // Verify that deletedAt was set, not a hard delete
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
        })
      );
    });

    it('sets deletedAt timestamp to current time', async () => {
      const existingPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Post',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        deletedAt: null,
      };

      const now = new Date('2024-01-15T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const deletedPost = {
        ...existingPost,
        deletedAt: now,
      };

      mockFindFirst.mockResolvedValue(existingPost);
      const mockReturning = vi.fn().mockResolvedValue([deletedPost]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockUpdate.mockReturnValue({ set: mockSet } as any);

      await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: now,
        })
      );

      vi.useRealTimers();
    });
  });

  describe('error cases', () => {
    it('returns 404 when post does not exist', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('returns 404 when post is already soft-deleted', async () => {
      const deletedPost = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Already Deleted',
        content: 'Content',
        authorId: 'author-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date('2024-01-15T11:00:00Z'),
      };

      mockFindFirst.mockResolvedValue(undefined); // Query filters out deleted posts

      const response = await mockApp.request('/api/posts/123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const response = await mockApp.request('/api/posts/invalid-id', {
        method: 'DELETE',
      });

      expect(response.status).toBe(400);
    });
  });
});