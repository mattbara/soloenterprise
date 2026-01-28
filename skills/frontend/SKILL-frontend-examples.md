# Frontend Engineer - Examples

<!-- Token Target: 1,200-1,500 tokens -->
<!-- Load When: complex tasks, new patterns -->

## Complete Component Example with Tests

### Component
```typescript
// components/login-form/login-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => void;
  isLoading?: boolean;
}

export function LoginForm({ onSubmit, isLoading }: LoginFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <span id="email-error" role="alert">{errors.email.message}</span>
        )}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <span id="password-error" role="alert">{errors.password.message}</span>
        )}
      </div>

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
```

### Tests
```typescript
// components/login-form/login-form.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { LoginForm } from './login-form';

describe('LoginForm', () => {
  it('submits with valid data', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('shows validation errors', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it('disables button when loading', () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

## Loading State Pattern

```typescript
interface AsyncContentProps<T> {
  isLoading: boolean;
  error: Error | null;
  data: T | undefined;
  children: (data: T) => React.ReactNode;
  loadingFallback?: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
  emptyFallback?: React.ReactNode;
}

export function AsyncContent<T>({
  isLoading,
  error,
  data,
  children,
  loadingFallback = <Spinner />,
  errorFallback = (e) => <ErrorDisplay error={e} />,
  emptyFallback = <EmptyState />,
}: AsyncContentProps<T>) {
  if (isLoading) return loadingFallback;
  if (error) return errorFallback(error);
  if (!data || (Array.isArray(data) && data.length === 0)) return emptyFallback;
  return children(data);
}
```

## Form with Validation Pattern

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
});

type FormData = z.infer<typeof schema>;

export function ContactForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} aria-invalid={!!errors.name} />
      {errors.name && <span role="alert">{errors.name.message}</span>}

      <input type="email" {...register('email')} aria-invalid={!!errors.email} />
      {errors.email && <span role="alert">{errors.email.message}</span>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```
