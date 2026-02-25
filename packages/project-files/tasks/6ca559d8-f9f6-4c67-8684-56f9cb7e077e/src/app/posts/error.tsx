'use client';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PostsError({ error, reset }: Props) {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h2 className="text-xl font-bold text-destructive mb-4">
        Failed to load posts
      </h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}