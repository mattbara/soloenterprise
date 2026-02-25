export default function PostsLoading() {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="h-9 bg-muted rounded w-48 mb-8 animate-pulse" />
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="border rounded-lg p-6 space-y-3 animate-pulse"
          >
            <div className="h-6 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}