# Backend Engineer - Security

<!-- Token Target: 600-800 tokens -->
<!-- Load When: auth, login, signup, password, token, session, api, endpoint, route, upload, cors, rate -->

## Input Validation at API Boundary

Every route handler validates with Zod before touching business logic:

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

app.post('/users', async (c) => {
  const parsed = createUserSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  // parsed.data is typed and safe
});
```

## SQL Injection Prevention

```typescript
// NEVER — string interpolation
const result = await db.execute(`SELECT * FROM users WHERE id = '${id}'`);

// CORRECT — Drizzle ORM (parameterized by default)
const user = await db.query.users.findFirst({ where: eq(users.id, id) });

// CORRECT — raw SQL with parameters (rare, when Drizzle can't express the query)
import { sql } from 'drizzle-orm';
const result = await db.execute(sql`SELECT * FROM users WHERE id = ${id}`);
```

## Password Hashing

```typescript
import { hash, verify } from '@node-rs/argon2'; // or bcrypt

// Registration
const passwordHash = await hash(password);
await db.insert(users).values({ email, passwordHash });

// Login
const user = await db.query.users.findFirst({ where: eq(users.email, email) });
if (!user || !(await verify(user.passwordHash, password))) {
  return c.json({ error: 'Invalid credentials' }, 401); // Same message for both
}
```

Never reveal whether the email exists — use identical error messages for "wrong email" and "wrong password."

## Security Headers (Middleware)

```typescript
// middleware.ts or Hono middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});
```

## Rate Limiting

```typescript
// Apply to public endpoints (login, signup, password reset)
import { rateLimiter } from 'hono-rate-limiter';

app.use('/auth/*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per window
  keyGenerator: (c) => c.req.header('x-forwarded-for') || 'unknown',
}));
```

## CORS

```typescript
import { cors } from 'hono/cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// NEVER in production:
// origin: '*'
// credentials: true + origin: '*' (browser blocks this anyway)
```

## Secret Management

```typescript
// CORRECT
const apiKey = process.env.STRIPE_SECRET_KEY;

// NEVER log secrets
console.log('API key:', apiKey); // Ends up in log aggregators

// NEVER return secrets in responses
return c.json({ user, apiKey }); // Leaks to client
```
