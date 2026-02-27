# Frontend Engineer - Security

<!-- Token Target: 600-800 tokens -->
<!-- Load When: form, auth, login, signup, password, token, session, user input, data display, sanitize -->

## XSS Prevention

React escapes by default. Never bypass it:

```tsx
// NEVER — opens XSS
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// If you absolutely must render HTML (rich text editor output):
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
```

## Auth Token Storage

```tsx
// WRONG — accessible to XSS
localStorage.setItem('token', jwt);

// CORRECT — httpOnly cookie set by backend, frontend never touches the token
// Frontend just calls the API; cookies are sent automatically
const res = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include', // sends cookies
  body: JSON.stringify({ email, password }),
});
```

## Form Input Validation

Always validate on BOTH client (UX) and server (security). Client validation is for UX only — never trust it.

```tsx
// Client-side with Zod (UX feedback, not security boundary)
const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
});

// Server Action or API route MUST re-validate with same or stricter schema
```

## CSRF for State-Changing Requests

When using Server Actions: Next.js handles CSRF automatically.
When using custom API routes with cookies: include a CSRF token.

```tsx
// Server Action — CSRF handled by framework
async function updateProfile(formData: FormData) {
  'use server';
  // Safe — Next.js validates origin
}
```

## Sensitive Data in UI

```tsx
// NEVER render secrets, even temporarily
<input type="hidden" value={apiKey} /> // Visible in DOM

// NEVER log sensitive data
console.log('User token:', token); // Visible in browser console

// Mask partial display
<span>{email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}</span>
```

## Content Security Policy

Set CSP in `next.config.ts` or middleware. Frontend agents must not add inline scripts that violate CSP:

```tsx
// WRONG — inline script, blocked by CSP
<script>alert('hello')</script>

// CORRECT — use next/script with strategy
import Script from 'next/script';
<Script src="/analytics.js" strategy="lazyOnload" />
```
