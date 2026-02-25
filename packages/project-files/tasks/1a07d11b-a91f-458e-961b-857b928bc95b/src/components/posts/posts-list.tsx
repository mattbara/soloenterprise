'use client';

import { useState } from 'react';
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

export function PostsList({ initialData }: PostsListProps) {
  const [posts, setPosts] = useState<Post[]>(initialData.posts);
  const [offset, setOffset] = useState(initialData.posts.length);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [isLoading, setIsLoading] = useState(false);

  const loadMore = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/posts?limit=10&offset=${offset}`);
      if (!res.ok) {
        throw new Error('Failed to fetch more posts');
      }
      const data: PostsResponse = await res.json();
      setPosts((prev) => [...prev, ...data.posts]);
      setOffset((prev) => prev + data.posts.length);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Error loading more posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No blog posts yet. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}