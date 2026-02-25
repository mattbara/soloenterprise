'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { PostCard } from './post-card';
import { PostsEmpty } from './posts-empty';

interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface PostsResponse {
  posts: Post[];
  hasMore: boolean;
  total: number;
}

interface PostsListProps {
  initialData: PostsResponse;
}

async function fetchPosts(offset: number): Promise<PostsResponse> {
  const response = await fetch(`/api/posts?offset=${offset}&limit=10`);

  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }

  return response.json();
}

export function PostsList({ initialData }: PostsListProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam = 0 }) => fetchPosts(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * 10; // offset = page_number * limit
    },
    initialPageParam: 0,
    initialData: {
      pages: [initialData],
      pageParams: [0],
    },
  });

  // Flatten all pages into single array
  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  // Empty state
  if (allPosts.length === 0) {
    return <PostsEmpty />;
  }

  // Error state (for subsequent page loads)
  if (isError) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">
          {error instanceof Error ? error.message : 'Failed to load more posts'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Posts grid */}
      <div className="space-y-6">
        {allPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* End of list indicator */}
      {!hasNextPage && allPosts.length > 0 && (
        <p className="text-center text-muted-foreground text-sm py-4">
          No more posts to load
        </p>
      )}
    </div>
  );
}