import type { Metadata } from 'next';
import { PostsList } from './components/posts-list';

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
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/posts?limit=10&offset=0`,
    {
      cache: 'no-store', // Always fetch fresh data
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }

  return response.json();
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