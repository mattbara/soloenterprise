# Frontend Engineer - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard tasks -->

## Component Template

```typescript
// src/components/feature-name/feature-name.tsx
'use client'; // Only if client-side interactivity needed

import { cn } from '@/lib/utils';

export interface FeatureNameProps {
  /** Primary content */
  title: string;
  /** Optional description */
  description?: string;
  /** Action callback */
  onAction?: () => void;
  className?: string;
}

export function FeatureName({
  title,
  description,
  onAction,
  className,
}: FeatureNameProps) {
  return (
    <div className={cn('base-styles', className)}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {onAction && (
        <button type="button" onClick={onAction}>
          Action
        </button>
      )}
    </div>
  );
}
```

## Next.js Patterns

### Server Component (Default)
```typescript
// app/users/page.tsx
export default async function UsersPage() {
  const users = await db.query.users.findMany();
  return <UserList users={users} />;
}
```

### Client Component
```typescript
'use client';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // ... implementation
}
```

### Server Actions
```typescript
'use server';
import { revalidatePath } from 'next/cache';

export async function createItem(formData: FormData) {
  await db.insert(items).values({ name: formData.get('name') });
  revalidatePath('/items');
}
```

## Data Fetching with TanStack Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => fetch('/api/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

## Data Fetching Decision Tree

**Priority order — use the first option that fits:**

1. **Server Component** (default) — async function, fetch/ORM directly. Zero client JS.
2. **`use()` + Suspense** — pass promise from server to client component.
3. **TanStack Query** — client-side cache, refetch, optimistic updates.
4. **useEffect** — last resort. Document why 1-3 don't apply.

### Mutations

- **Server Actions** (preferred for forms) — `'use server'` + `revalidatePath`
- **TanStack `useMutation`** — client-side with cache invalidation
- **`useActionState`** — form submission lifecycle (replaces useState + useEffect pattern)
- **`useOptimistic`** — instant UI feedback during in-flight mutations

```typescript
// Server Action mutation (preferred)
'use server';
import { revalidatePath } from 'next/cache';

export async function createItem(formData: FormData) {
  await db.insert(items).values({ name: formData.get('name') });
  revalidatePath('/items');
}

// useActionState (React 19 — replaces manual loading/error/success)
import { useActionState } from 'react';
const [state, formAction, isPending] = useActionState(createItem, initialState);

// useOptimistic (React 19 — instant UI)
import { useOptimistic } from 'react';
const [optimistic, addOptimistic] = useOptimistic(items, (curr, newItem) => [...curr, newItem]);
```

See `docs/ANTIPATTERNS.md` for full examples and source citations.

## File Organization

```
src/components/feature-name/
├── feature-name.tsx        # Main component
├── feature-name.test.tsx   # Tests
├── feature-name.stories.tsx # Storybook (if applicable)
└── index.ts                # Re-export
```

## File Locking Protocol

Before modifying any file:
1. Check if file is locked by another agent
2. If locked, STOP and report conflict
3. If unlocked, acquire lock before proceeding
4. Release lock after PR is created

## Coordination Points

- **With Backend:** API contracts, WebSocket events, authentication flow
- **With QA:** Test data requirements, E2E test selectors
- **With DevOps:** Environment variables, CDN configuration, build optimization
