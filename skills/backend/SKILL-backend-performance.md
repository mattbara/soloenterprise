# Backend Engineer - Performance

<!-- Token Target: 600-800 tokens -->
<!-- Load When: api, endpoint, route, query, database, list, search, pagination, cache, optimize -->

## Query Optimization

### No N+1 Queries

```typescript
// WRONG — N+1: 1 query for orders + N queries for users
const orders = await db.query.orders.findMany();
for (const order of orders) {
  order.user = await db.query.users.findFirst({ where: eq(users.id, order.userId) });
}

// CORRECT — single query with join
const orders = await db.query.orders.findMany({
  with: { user: true },
});
```

### Select Only What You Need

```typescript
// WRONG — selects all columns including large text fields
const users = await db.query.users.findMany();

// CORRECT — select only needed columns
const users = await db.select({
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
}).from(usersTable);
```

## Pagination

Always paginate list endpoints. Never return unbounded results.

```typescript
const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

app.get('/users', async (c) => {
  const { limit, offset } = paginationSchema.parse(c.req.query());

  const [items, [{ count }]] = await Promise.all([
    db.select().from(usersTable).limit(limit).offset(offset).orderBy(desc(usersTable.createdAt)),
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
  ]);

  return c.json({ items, total: count, limit, offset });
});
```

## Response Time Budgets

| Endpoint Type | Target | Action if Exceeded |
|--------------|--------|-------------------|
| Read (GET) | < 200ms | Add index, reduce payload, cache |
| Write (POST/PUT) | < 500ms | Async heavy work via queue |
| Search | < 500ms | Add GIN/GiST index, limit results |
| Report/Export | < 5s | Move to background job, return job ID |

## Database Indexing

```typescript
// In Drizzle schema — add indexes for frequently filtered/sorted columns
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  status: orderStatusEnum('status').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('orders_user_id_idx').on(table.userId),
  index('orders_status_idx').on(table.status),
  index('orders_created_at_idx').on(table.createdAt),
]);
```

## Async Heavy Work

```typescript
// WRONG — blocking the response for expensive operation
app.post('/reports', async (c) => {
  const report = await generateLargeReport(); // 30 seconds
  return c.json(report);
});

// CORRECT — queue it, return immediately
app.post('/reports', async (c) => {
  const jobId = await reportQueue.add('generate', { userId: c.var.userId });
  return c.json({ jobId, status: 'processing' }, 202);
});
```

## Connection Pooling

Neon uses HTTP-based connections by default. For high-throughput:

```typescript
// Use connection pooling for heavy read workloads
import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```
