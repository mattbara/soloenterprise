export default function PostsLoading() {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-muted rounded w-48" />
        
        {/* Skeleton cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-6 space-y-3">
            <div className="h-6 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}