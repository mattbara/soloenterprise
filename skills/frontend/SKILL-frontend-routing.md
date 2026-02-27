# Frontend Engineer - Routing

<!-- Token Target: 600-800 tokens -->
<!-- Load When: route, page, layout, navigation, middleware, loading, error, not-found, redirect -->

## Route Groups

Organize layouts without affecting URLs:

```
app/
├── (marketing)/         # Public pages — shared marketing layout
│   ├── layout.tsx
│   ├── page.tsx         # /
│   └── about/page.tsx   # /about
├── (dashboard)/         # Auth-required — shared dashboard layout
│   ├── layout.tsx
│   └── projects/page.tsx # /projects
└── (auth)/              # Auth pages — minimal layout
    ├── layout.tsx
    ├── login/page.tsx   # /login
    └── signup/page.tsx  # /signup
```

## Loading & Error Boundaries

Every route segment MUST have:

```tsx
// loading.tsx — Suspense boundary for the segment
export default function Loading() {
  return <PageSkeleton />;  // Use skeleton, not spinner
}

// error.tsx — error recovery boundary
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// not-found.tsx — 404 for this segment
export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>The requested resource does not exist.</p>
      <a href="/">Go home</a>
    </div>
  );
}
```

## Middleware (Auth Guards)

```tsx
// middleware.ts — root level
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('session');

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
};
```

## Parallel Routes

Use when you need independent loading states in the same layout:

```
app/dashboard/
├── layout.tsx          # Renders @stats and @activity side-by-side
├── @stats/
│   ├── page.tsx
│   └── loading.tsx     # Independent loading state
└── @activity/
    ├── page.tsx
    └── loading.tsx     # Independent loading state
```

```tsx
// layout.tsx
export default function DashboardLayout({
  children, stats, activity,
}: { children: React.ReactNode; stats: React.ReactNode; activity: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {stats}
      {activity}
      {children}
    </div>
  );
}
```

## URL Design

- kebab-case: `/user-settings` not `/userSettings`
- No database IDs in public URLs: `/products/blue-widget` not `/products/550e8400-e29b-...`
- Use slugs for public resources, IDs only in admin/dashboard URLs
- Clean hierarchy: `/blog/2024/my-post` not `/blog?year=2024&slug=my-post`
