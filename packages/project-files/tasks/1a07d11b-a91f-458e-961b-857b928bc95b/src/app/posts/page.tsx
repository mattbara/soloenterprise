import type { Metadata } from 'next';
import { PostsList } from '@/components/posts/posts-list';

export const metadata: Metadata = {
  title: 'Blog Posts',
};

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

async function getInitialPosts(): Promise<PostsResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/posts?limit=10&offset=0`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch posts');
  }

  return res.json();
}

export default async function PostsPage() {
  const initialData = await getInitialPosts();

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Blog Posts</h1>
      <PostsList initialData={initialData} />
    </div>
  );
}