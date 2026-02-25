interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength).trim() + '...';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="border rounded-lg p-6 hover:shadow-md transition-shadow bg-card">
      <h2 className="text-xl font-semibold mb-3 text-card-foreground">
        {post.title}
      </h2>
      <p className="text-muted-foreground mb-4 leading-relaxed">
        {truncateContent(post.content, 150)}
      </p>
      <time className="text-sm text-muted-foreground">
        {formatDate(post.createdAt)}
      </time>
    </article>
  );
}