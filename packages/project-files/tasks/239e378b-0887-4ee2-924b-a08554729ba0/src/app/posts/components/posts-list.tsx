'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PostCard } from './post-card';

interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface PostsResponse {
  posts: Post[];
  total: number;
  hasMore: boolean;
}

interface PostsListProps {
  initialData: PostsResponse;
}

const POSTS_PER_PAGE = 10;

async function fetchPosts(offset: number): Promise<PostsResponse> {
  const response = await fetch(
    `/api/posts?limit=${POSTS_PER_PAGE}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }

  return response.json();
}

export function PostsList({ initialData }: PostsListProps) {
  const [offset, setOffset] = useState(POSTS_PER_PAGE);
  const [allPosts, setAllPosts] = useState<Post[]>(initialData.posts);
  const [hasMore, setHasMore] = useState(initialData.hasMore);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['posts', offset],
    queryFn: () => fetchPosts(offset),
    enabled: false, // Manual trigger only
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleLoadMore = async () => {
    const result = await refetch();
    
    if (result.data) {
      setAllPosts((prev) => [...prev, ...result.data.posts]);
      setHasMore(result.data.hasMore);
      setOffset((prev) => prev + POSTS_PER_PAGE);
    }
  };

  // Empty state
  if (allPosts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No posts yet. Check back later!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Posts grid */}
      <div className="space-y-4">
        {allPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Error state for pagination */}
      {error && (
        <div className="text-center py-4">
          <p className="text-destructive text-sm">
            Failed to load more posts. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}