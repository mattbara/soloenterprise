# Backend Engineer - Examples

<!-- Token Target: 1,200-1,500 tokens -->
<!-- Load When: new patterns only (auth, queues, websockets, first task on project) -->

## Example: User Registration with Email Verification

**Task:** Create user registration endpoint with email verification

### Analysis (for complex tasks only)

```markdown
## Understanding
- Users register with email/password
- Email verification required before activation
- Integrate with existing auth system

## Approach
- POST /api/auth/register endpoint
- Store user as "pending" until verified
- Queue verification email (async)

## Questions
- What email service? (SendGrid, Postmark, SES?)
- Verification expiry? (suggesting 24 hours)
```

### Implementation

```xml
<file path="src/routes/auth/register.ts">
import { z } from 'zod';
import { Hono } from 'hono';
import { db } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { sendVerificationEmail } from '@/queues/email';
import { createVerificationToken } from '@/lib/tokens';
import { rateLimit } from '@/middleware/rate-limit';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const registerRoute = new Hono()
  .use(rateLimit({ limit: 5, window: '1m' }))
  .post('/', async (c) => {
    const body = await c.req.json();

    // Validate input
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: result.error.flatten()
      }, 400);
    }

    const { email, password, name } = result.data;

    // Check for existing user
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existing) {
      // Don't reveal if email exists (security)
      return c.json({
        message: 'If this email is not registered, you will receive a verification email.'
      }, 200);
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      name,
      status: 'pending_verification',
    }).returning({ id: users.id });

    // Queue verification email
    const token = await createVerificationToken(user.id);
    await sendVerificationEmail.add('send', {
      userId: user.id,
      email,
      token,
    });

    return c.json({
      message: 'If this email is not registered, you will receive a verification email.'
    }, 200);
  });
</file>
```

### Test Structure

```xml
<file path="tests/routes/auth/register.test.ts">
import { describe, it, expect, beforeEach } from 'vitest';
import { testClient } from '@/test/client';
import { db } from '@/db';
import { users } from '@/db/schema';

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('creates a pending user with valid input', async () => {
    const res = await testClient.post('/api/auth/register', {
      json: { email: 'test@example.com', password: 'securePassword123', name: 'Test User' },
    });
    expect(res.status).toBe(200);

    const user = await db.query.users.findFirst({ where: eq(users.email, 'test@example.com') });
    expect(user?.status).toBe('pending_verification');
  });

  it('returns 400 for invalid email', async () => {
    const res = await testClient.post('/api/auth/register', {
      json: { email: 'not-an-email', password: 'securePassword123', name: 'Test User' },
    });
    expect(res.status).toBe(400);
  });

  it('returns same response for existing email (prevents enumeration)', async () => {
    await db.insert(users).values({ email: 'existing@example.com', passwordHash: 'hash', name: 'Existing', status: 'active' });

    const res = await testClient.post('/api/auth/register', {
      json: { email: 'existing@example.com', password: 'securePassword123', name: 'Test User' },
    });
    expect(res.status).toBe(200); // Same response to prevent enumeration
  });
});
</file>
```

---

## Key Patterns Demonstrated

1. **Input validation** with Zod at endpoint boundary
2. **Security** — no email enumeration, rate limiting
3. **Async operations** — email queued, not blocking
4. **Consistent responses** — same message whether user exists or not
5. **Test structure** — setup, act, assert pattern
