# Frontend Engineer - Accessibility

<!-- Token Target: 600-800 tokens -->
<!-- Load When: component, page, form, modal, dialog, button, input, navigation, layout, table, list -->

## Semantic HTML First

```tsx
// WRONG — div soup
<div className="nav"><div onClick={navigate}>Home</div></div>

// CORRECT — semantic elements
<nav aria-label="Main navigation">
  <a href="/home">Home</a>
</nav>
```

Use: `<nav>`, `<main>`, `<aside>`, `<article>`, `<section>`, `<header>`, `<footer>`.
Use ARIA only when no semantic element exists.

## Interactive Elements

Every clickable element must be keyboard-operable:

```tsx
// WRONG — mouse only
<div onClick={handleClick}>Click me</div>

// CORRECT — native button handles keyboard for free
<button onClick={handleClick}>Click me</button>

// If you must use a non-button element:
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
>
  Click me
</div>
```

## Focus Management

```tsx
// Modal: trap focus inside, restore on close
import { useRef, useEffect } from 'react';

function Modal({ isOpen, onClose, children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      closeRef.current?.focus();
    } else {
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  // Use shadcn/ui Dialog — it handles focus trap automatically
}
```

## Forms

```tsx
// Labels MUST be associated with inputs
<label htmlFor="email">Email</label>
<input id="email" type="email" aria-describedby="email-error" />
{error && <p id="email-error" role="alert">{error}</p>}

// Group related fields
<fieldset>
  <legend>Shipping Address</legend>
  {/* inputs */}
</fieldset>
```

## Skip Link

Every page must have a skip link as the first focusable element:

```tsx
// In layout.tsx or page wrapper
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2">
  Skip to content
</a>
<main id="main-content">{children}</main>
```

## Dynamic Content

```tsx
// Announce updates to screen readers
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Toast notifications: use aria-live="assertive" for errors only
// Loading states: use aria-busy="true" on the loading container
<div aria-busy={isLoading}>{isLoading ? <Spinner /> : content}</div>
```

## Color & Motion

- Never convey information by color alone — add icons, text, or patterns
- Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```
