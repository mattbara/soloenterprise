# Anti-Pattern Reference

Shared decision framework for all agents. Not a list of absolute bans — a priority system of "prefer X over Y because Z" with escape hatches.

**Sources:** All recommendations cite official documentation. Links verified against React 19, Next.js 16, and TanStack Query 5.

---

## Data Fetching

### Decision Tree (in order of preference)

1. **Server Component** — async function, fetch/ORM directly. Zero client JS. Default choice.
2. **`use()` + Suspense** — pass a promise from Server Component to Client Component, unwrap with `use()`. Good for streaming.
3. **TanStack Query** — `useQuery` for client-side data needs (real-time, user-driven refetch, optimistic updates).
4. **`useEffect`** — last resort. Document why alternatives 1-3 don't apply.

### Server Component (Preferred)

```typescript
// app/users/page.tsx — Server Component, no client JS
export default async function UsersPage() {
  const users = await db.query.users.findMany();
  return <UserList users={users} />;
}
```

**Source:** [nextjs.org/docs/app/getting-started/fetching-data](https://nextjs.org/docs/app/getting-started/fetching-data) — Server Components are the primary recommended pattern.

### Parallel Fetching in Server Components

```typescript
// BAD — sequential awaits create waterfalls
const users = await getUsers();
const projects = await getProjects();

// GOOD — parallel fetching
const [users, projects] = await Promise.all([getUsers(), getProjects()]);
```

### TanStack Query (Client-Side Needs)

```typescript
// GOOD — TanStack Query manages cache, loading, error, refetch
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 min — don't refetch unnecessarily
  });
}
```

**queryKey conventions:**
- Entity list: `['users']`, `['projects']`
- Entity by ID: `['users', userId]`
- Filtered: `['users', { status: 'active' }]`
- Nested: `['projects', projectId, 'tasks']`

### useEffect for Data Fetching — When It's Actually OK

React docs call useEffect data fetching "a very manual approach with significant downsides" but explicitly say: *"You can continue fetching data directly in Effects if neither of these approaches suit you."*

**Source:** [react.dev/reference/react/useEffect](https://react.dev/reference/react/useEffect)

**Legitimate uses:**
- WebSocket subscriptions (not request/response)
- Browser-only APIs (geolocation, media queries, intersection observer)
- Non-framework apps (plain React without Next.js)
- Third-party SDK initialization that requires DOM

**When you use it, document why:**
```typescript
// useEffect is appropriate here — WebSocket is a persistent connection,
// not a request/response pattern that TanStack Query handles.
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => setMessages(prev => [...prev, JSON.parse(e.data)]);
  return () => ws.close();
}, [url]);
```

---

## Mutations

### Decision Tree (in order of preference)

1. **Server Actions** — `'use server'` functions, called from forms or `startTransition`. Preferred for form submissions.
2. **TanStack Query `useMutation`** — for client-side mutations with optimistic updates, cache invalidation.
3. **Direct fetch POST** — only when neither framework is available.

### Server Actions (Preferred for Forms)

```typescript
// actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function createProject(formData: FormData) {
  const name = formData.get('name') as string;
  await db.insert(projects).values({ name });
  revalidatePath('/projects');
}

// component.tsx — no useEffect, no useState for submission state
<form action={createProject}>
  <input name="name" required />
  <button type="submit">Create</button>
</form>
```

### React 19: `useActionState` (Replaces useState Trio)

```typescript
// BAD — manual loading/error/success state
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState(false);

async function handleSubmit() {
  setLoading(true);
  setError(null);
  try {
    await createProject(data);
    setSuccess(true);
  } catch (e) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}

// GOOD — useActionState manages the lifecycle
import { useActionState } from 'react';

const [state, formAction, isPending] = useActionState(createProject, initialState);
// state = return value from action, isPending = loading, errors in state
```

**Source:** [react.dev/blog/2024/12/05/react-19](https://react.dev/blog/2024/12/05/react-19) — `useActionState` is a React 19 primitive for form action lifecycle.

### React 19: `useOptimistic` (Instant UI Feedback)

```typescript
import { useOptimistic } from 'react';

function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (current, newTodo: Todo) => [...current, newTodo]
  );

  async function addTodo(formData: FormData) {
    const newTodo = { id: crypto.randomUUID(), title: formData.get('title') as string };
    addOptimistic(newTodo); // Instant UI update
    await createTodoAction(formData); // Server action
  }

  return (
    <ul>
      {optimisticTodos.map(todo => <li key={todo.id}>{todo.title}</li>)}
    </ul>
  );
}
```

### TanStack Query Mutations (Client-Side with Cache)

```typescript
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) =>
      fetch('/api/projects', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (newProject) => {
      // Update cache directly — no re-fetch needed
      queryClient.setQueryData(['projects'], (old: Project[]) => [...old, newProject]);
    },
  });
}
```

---

## State Management

### Don't Duplicate Server State in Client State

```typescript
// BAD — duplicating TanStack Query's job
const { data: users } = useUsers();
const [userList, setUserList] = useState(users); // Why?

// GOOD — TanStack Query owns server state
const { data: users, isLoading, error } = useUsers();
// Use users directly. No local copy.
```

### Don't Use Multiple useState for Async State

```typescript
// BAD — 3 useState for one async operation
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

// GOOD — TanStack Query
const { data, isLoading, error } = useQuery({ ... });

// GOOD — useActionState (for form submissions)
const [state, action, isPending] = useActionState(serverAction, initialState);
```

---

## Cost Rules (from CLAUDE.md, consolidated)

These are hard requirements for SoloEnterprise projects.

### No Polling

```typescript
// BAD — costs money every interval
setInterval(() => fetch('/api/status'), 5000);

// BAD — TanStack Query with aggressive refetch
useQuery({ queryKey: ['status'], refetchInterval: 1000 });

// GOOD — refetch on user action only
const { refetch } = useQuery({ queryKey: ['status'], staleTime: 5 * 60 * 1000 });
<button onClick={() => refetch()}>Refresh</button>

// GOOD — router.refresh() for server-side revalidation (free)
const router = useRouter();
router.refresh();
```

### Return Data from Mutations

```typescript
// BAD — mutation then re-fetch (2 network requests)
await fetch('/api/projects', { method: 'POST', body });
await fetch('/api/projects'); // Wasted request

// GOOD — mutation returns the new state
const result = await fetch('/api/projects', { method: 'POST', body });
const newProject = await result.json();
// Use newProject directly or update cache
```

### No Client-Side Fetch on Mount

```typescript
// BAD — useEffect fetch on every mount
useEffect(() => { fetch('/api/data').then(r => r.json()).then(setData); }, []);

// GOOD — Server Component passes data as props
export default async function Page() {
  const data = await db.query.table.findMany();
  return <ClientComponent data={data} />;
}
```

---

## Quick Reference

| Pattern | Prefer | Over | Why |
|---------|--------|------|-----|
| Data fetching | Server Component | useEffect | Zero client JS, no waterfalls, SSR |
| Client data | TanStack Query | useEffect + useState | Built-in cache, loading, error, refetch |
| Form mutations | Server Actions | API route + fetch | Less boilerplate, auto revalidation |
| Form state | `useActionState` | useState trio | Single hook, built into React 19 |
| Optimistic UI | `useOptimistic` | Manual rollback | Framework-native, composable with Server Actions |
| Server refresh | `router.refresh()` | `fetch` + `setState` | Free (RSC), no API cost |
| Promise unwrap | `use()` + Suspense | useEffect + useState | Streaming, no waterfall, cleaner code |
