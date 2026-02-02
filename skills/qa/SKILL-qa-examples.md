# QA Engineer - Examples

<!-- Token Target: 1,200-1,500 tokens -->
<!-- Load When: complex tasks, new patterns -->

## Example: Unit Test with Setup/Teardown

**Task:** Test a discount calculation service

```xml
<file path="src/services/__tests__/pricing.test.ts">
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PricingService } from '../pricing';
import { db } from '@/db';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('calculateDiscount', () => {
    it('applies percentage discount correctly', () => {
      const result = service.calculateDiscount({
        basePrice: 100,
        discountType: 'percentage',
        discountValue: 20,
      });

      expect(result).toEqual({
        originalPrice: 100,
        discount: 20,
        finalPrice: 80,
      });
    });

    it('caps discount at base price (no negative prices)', () => {
      const result = service.calculateDiscount({
        basePrice: 50,
        discountType: 'fixed',
        discountValue: 100,
      });

      expect(result.finalPrice).toBe(0);
    });

    it('throws for negative base price', () => {
      expect(() => service.calculateDiscount({
        basePrice: -10,
        discountType: 'percentage',
        discountValue: 10,
      })).toThrow('Base price cannot be negative');
    });
  });
});
</file>
```

---

## Example: React Component Test

**Task:** Test a form component with validation

```xml
<file path="src/components/__tests__/login-form.test.tsx">
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../login-form';

describe('LoginForm', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
  };

  it('renders email and password fields', () => {
    render(<LoginForm {...defaultProps} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits form with valid credentials', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup();

    render(<LoginForm {...defaultProps} />);

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('disables submit button when loading', () => {
    render(<LoginForm {...defaultProps} isLoading />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });
});
</file>
```

---

## Example: API Integration Test

**Task:** Test user creation endpoint

```xml
<file path="tests/integration/users-api.integration.test.ts">
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '@/app';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

describe('Users API Integration', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  afterEach(async () => {
    await db.delete(users);
  });

  describe('POST /api/users', () => {
    it('creates user and returns 201', async () => {
      const response = await app.request('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          name: 'New User',
        }),
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.user.email).toBe('new@example.com');
      expect(body.user.id).toBeDefined();

      // Verify database state
      const dbUser = await db.query.users.findFirst({
        where: eq(users.email, 'new@example.com'),
      });
      expect(dbUser).toBeDefined();
    });

    it('returns 409 for duplicate email', async () => {
      // Setup: create existing user
      await db.insert(users).values({
        email: 'existing@example.com',
        name: 'Existing',
      });

      const response = await app.request('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          name: 'Duplicate',
        }),
      });

      expect(response.status).toBe(409);
    });
  });
});
</file>
```

---

## Mock Patterns

### Function Mock (vi.fn)

```typescript
const mockFn = vi.fn();
mockFn.mockReturnValue('result');
mockFn.mockResolvedValue('async result');
mockFn.mockImplementation((arg) => arg * 2);

expect(mockFn).toHaveBeenCalledWith('expected arg');
expect(mockFn).toHaveBeenCalledTimes(1);
```

### Module Mock (vi.mock)

```typescript
vi.mock('@/services/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// In test:
import { sendEmail } from '@/services/email';
expect(sendEmail).toHaveBeenCalledWith({
  to: 'user@example.com',
  subject: 'Welcome',
});
```

---

## Test Data Factory Pattern

```typescript
// test/factories/user.ts
import { faker } from '@faker-js/faker';

export function createTestUser(overrides = {}) {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage in test:
const user = createTestUser({ email: 'specific@example.com' });
```

---

## Key Patterns Demonstrated

1. **Setup/Teardown** — `beforeEach`/`afterEach` for isolation
2. **Fake Timers** — `vi.useFakeTimers()` for time-dependent code
3. **User Events** — `userEvent.setup()` for realistic interactions
4. **Async Testing** — `waitFor` for async assertions
5. **Database Cleanup** — Delete test data before and after
6. **Module Mocking** — `vi.mock()` for external dependencies
