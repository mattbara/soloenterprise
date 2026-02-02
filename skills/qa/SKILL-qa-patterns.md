# QA Engineer - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard tasks (test suites, feature testing) -->

## Test Coverage Requirements

| Layer | Minimum Coverage | Focus |
|-------|------------------|-------|
| Unit Tests | 80% | Business logic, utilities, hooks |
| Integration Tests | 70% | API endpoints, database operations |
| Component Tests | Key components | User interactions, state changes |

---

## Test Quality Principles

1. **Deterministic:** Tests pass or fail consistently. No flaky tests.
2. **Independent:** Tests don't depend on other tests or execution order.
3. **Fast:** Unit tests < 10ms each. Integration tests < 100ms each.
4. **Readable:** Test names describe expected behavior.
5. **Maintainable:** DRY test utilities. No copy-paste test code.

---

## Output Location

Detect and match target project conventions:
- If `__tests__/` folders exist → use `__tests__/`
- If `.test.ts` co-located with source → use co-location
- If `tests/` root folder exists → use `tests/`
- If no pattern visible → ASK "Where should test files go?"

---

## Unit Test Pattern (Vitest)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('functionName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('returns expected result with valid input', () => {
      const result = functionName(validInput);
      expect(result).toBe(expectedOutput);
    });
  });

  describe('error handling', () => {
    it('throws specific error for invalid input', () => {
      expect(() => functionName(invalidInput)).toThrow('Expected error');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = functionName('');
      expect(result).toBe(emptyResult);
    });
  });
});
```

---

## External SDK Mocking (CRITICAL)

When mocking external SDKs (Stripe, Resend, AWS SDK, Anthropic, etc.), follow this exact pattern:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalSDK } from 'external-sdk';
import { functionUnderTest } from '../module-under-test';

// 1. Mock the module at top level
vi.mock('external-sdk');

// 2. Create mock function references OUTSIDE describe blocks
const mockMethod = vi.fn();

describe('functionUnderTest', () => {
  // 3. Setup mock implementation in beforeEach
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ExternalSDK).mockImplementation(() => ({
      methodName: mockMethod,
    }) as unknown as ExternalSDK);
  });

  // 4. Use mock references directly in tests
  it('calls the SDK correctly', async () => {
    mockMethod.mockResolvedValue({ data: 'result' });

    await functionUnderTest();

    expect(mockMethod).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### NEVER Do This:

```typescript
// WRONG: await in non-async beforeEach - SYNTAX ERROR
beforeEach(() => {
  const { SDK } = await import('sdk');  // Cannot use await here!
});

// WRONG: Creating instance in beforeEach to get mock reference
beforeEach(() => {
  const instance = new MockedClass();
  mockFn = instance.method;  // This won't be the same mock the source uses!
});

// WRONG: Inline mock that can't be referenced in tests
vi.mock('sdk', () => ({
  SDK: vi.fn(() => ({ method: vi.fn() }))  // No way to access this vi.fn()
}));
```

---

## Database Mocking (Drizzle)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      tableName: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })),
  },
}));

// Get typed references
const mockFindFirst = vi.mocked(db.query.tableName.findFirst);

describe('service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches data', async () => {
    mockFindFirst.mockResolvedValue({ id: '1', name: 'Test' });
    // ... test
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({...}));
  });
});
```

---

## Undefined Behavior Testing

When source code has undefined behavior for edge cases (e.g., negative inputs, zero divisors), write tests that:

1. Document the actual current behavior
2. Add a comment explaining the expected fix

```typescript
describe('edge cases - undefined behavior', () => {
  it('handles page 0 (currently broken)', () => {
    // BUG: page 0 produces negative startIndex, should throw or clamp to 1
    const result = paginate([1, 2, 3], 0, 2);
    expect(result.data).toEqual([]); // Documents actual broken behavior
  });

  it('handles negative pageSize (currently broken)', () => {
    // BUG: negative pageSize causes Infinity totalPages, should throw or clamp to 1
    const result = paginate([1, 2, 3], 1, -1);
    expect(result.totalPages).toBe(-Infinity); // Documents actual broken behavior
  });
});
```

This approach:
- Makes undefined behavior visible in test output
- Prevents silent regressions if someone "fixes" it differently
- Creates clear documentation for future developers

---

## Component Test Pattern (React Testing Library)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ComponentName', () => {
  it('renders with required props', () => {
    render(<ComponentName title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('calls handler on user interaction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<ComponentName onClick={onClick} />);
    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('displays loading state', () => {
    render(<ComponentName isLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('displays error state', () => {
    render(<ComponentName error="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
```

---

## Integration Test Pattern (API with Vitest)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db';
import { tableName } from '@/db/schema';

describe('POST /api/resource', () => {
  beforeAll(async () => {
    await db.delete(tableName);
  });

  afterAll(async () => {
    await db.delete(tableName);
  });

  it('creates resource with valid data', async () => {
    const response = await app.request('/api/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeDefined();
  });

  it('returns 400 for invalid data', async () => {
    const response = await app.request('/api/resource', {
      method: 'POST',
      body: JSON.stringify({ invalid: true }),
    });

    expect(response.status).toBe(400);
  });
});
```

---

## File Naming Conventions

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit | `[name].test.ts` | `pricing.test.ts` |
| Component | `[name].test.tsx` | `button.test.tsx` |
| Integration | `[name].integration.test.ts` | `users-api.integration.test.ts` |
