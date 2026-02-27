# Architecture Quality Checklist

**Purpose:** Top-down quality enforcement for every client project.
**Audience:** Architect (spec), Orchestrator (task planning), Reviewer (PR gates).
**Stack:** Next.js 15+ App Router, Tailwind CSS v4, Hono, Drizzle ORM, PostgreSQL, Zod, shadcn/ui.

---

## How to Use This Document

| Role | Action |
|------|--------|
| **Architect** | Reference "Architect must spec" items when generating tech specs. Every spec must address each domain or explicitly note "N/A — [reason]." |
| **Orchestrator** | Reference when decomposing projects into tasks. If the Architect spec omits a domain, the Orchestrator creates a task for it. |
| **Reviewer** | Reference "Agent must implement" items when reviewing PRs. Fail PRs that violate non-negotiable items. |

---

## 1. Security

**Why:** A single XSS or injection vulnerability destroys client trust and creates legal liability.

### Architect Must Spec

- [ ] Authentication method and token storage strategy (httpOnly cookies, not localStorage)
- [ ] Authorization model (RBAC, per-resource, row-level)
- [ ] Content-Security-Policy header values appropriate for the project
- [ ] CORS origins (explicit list, no wildcards in production)
- [ ] Rate limiting strategy for public-facing endpoints
- [ ] Input validation boundaries (which endpoints, what schemas)
- [ ] File upload constraints if applicable (type whitelist, max size)

### Agent Must Implement

- [ ] Output encoding on all dynamic content (React does this by default — never use `dangerouslySetInnerHTML`)
- [ ] CSRF protection on state-changing requests
- [ ] Parameterized queries only — zero string concatenation in SQL
- [ ] Security headers on all responses: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Zod validation on every API route input (body, params, query)
- [ ] Secrets in environment variables only — never in code, logs, or generated output
- [ ] Password hashing with bcrypt or argon2 (never MD5/SHA for passwords)
- [ ] Auth tokens in httpOnly cookies, not localStorage/sessionStorage

### Common Violations

- Storing JWT in `localStorage` (XSS-accessible)
- `CORS: { origin: '*' }` in production
- String-interpolated SQL: `` `WHERE id = ${id}` ``
- Missing Zod validation on PATCH/PUT endpoints
- Logging sensitive data (passwords, tokens, PII)

---

## 2. SEO

**Why:** Client projects need organic traffic. Zero SEO = invisible to search engines = wasted build.

### Architect Must Spec

- [ ] Which pages need `generateMetadata()` (all public pages minimum)
- [ ] Structured data types per page (JSON-LD: Product, Article, Organization, etc.)
- [ ] Canonical URL strategy (especially for filtered/paginated content)
- [ ] Whether `sitemap.ts` and `robots.ts` are needed (yes for any public-facing site)

### Agent Must Implement

- [ ] `generateMetadata()` on every public page with title, description, Open Graph, Twitter card
- [ ] Canonical URLs via `alternates.canonical` in metadata
- [ ] `robots.ts` at app root
- [ ] `sitemap.ts` at app root (with `generateStaticParams` data where applicable)
- [ ] JSON-LD structured data for relevant page types
- [ ] Semantic heading hierarchy (single `<h1>` per page, sequential levels)
- [ ] Descriptive `alt` text on all `<img>` (mandatory, not `alt=""` unless decorative)
- [ ] 404 page with helpful navigation (not a dead end)

### Common Violations

- Pages with `<title>` set to the component name or left as default
- Missing Open Graph images (social sharing shows blank)
- `alt=""` on content images (not decorative)
- Multiple `<h1>` tags on a single page
- No `sitemap.ts` on a 50-page site

---

## 3. Accessibility (WCAG 2.1 AA)

**Why:** Legal requirement in many jurisdictions. ~15% of users have disabilities. Bad a11y = lawsuits + lost users.

### Architect Must Spec

- [ ] Skip link target (usually `#main-content`)
- [ ] Focus management strategy for modals, drawers, and route transitions
- [ ] `aria-live` region placement for dynamic content (toasts, form errors, loading states)
- [ ] Color contrast requirements (brand colors must meet 4.5:1 for text)

### Agent Must Implement

- [ ] Semantic HTML: `<nav>`, `<main>`, `<aside>`, `<article>`, `<section>`, `<header>`, `<footer>`
- [ ] ARIA landmarks only where semantic elements aren't sufficient
- [ ] Keyboard navigation: all interactive elements reachable via Tab, operable via Enter/Space
- [ ] Focus trap in modals/dialogs, focus restore on close
- [ ] Skip link on every page (`<a href="#main-content" className="sr-only focus:not-sr-only">`)
- [ ] Color contrast: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold)
- [ ] Form labels associated with inputs via `htmlFor` (not floating placeholder-only)
- [ ] Error messages announced to screen readers via `aria-describedby` or `aria-live`
- [ ] No information conveyed by color alone (add icons, text, or patterns)
- [ ] `prefers-reduced-motion` respected for animations
- [ ] Touch targets minimum 44x44px on mobile

### Common Violations

- `<div onClick>` without `role="button"`, `tabIndex={0}`, keyboard handler
- Modal opens without trapping focus (Tab escapes to background)
- Form validation errors not linked to inputs via `aria-describedby`
- Icon-only buttons without `aria-label`
- Contrast ratio < 4.5:1 on body text

---

## 4. Performance

**Why:** Core Web Vitals affect SEO ranking and user experience. Slow = users leave.

### Architect Must Spec

- [ ] LCP element per page (hero image, main heading — must load in < 2.5s)
- [ ] Above-fold vs below-fold boundary for code splitting decisions
- [ ] Data fetching strategy per route (server component vs client, cache vs dynamic)
- [ ] API response time budgets (< 200ms reads, < 500ms writes)

### Agent Must Implement

- [ ] `next/image` for all images with `sizes` attribute and `priority` on LCP image
- [ ] `next/font` for font loading (no layout shift)
- [ ] `next/script` with `strategy="lazyOnload"` for non-critical third-party scripts
- [ ] `next/dynamic` for heavy components below the fold
- [ ] Server Components for data fetching — Client Components only for interactivity
- [ ] No barrel imports that defeat tree-shaking (`import { X } from './specific-file'`, not `from '.'`)
- [ ] No N+1 database queries — use joins or `with` relations in Drizzle
- [ ] Bundle monitoring: flag any route with > 100KB first-load JS

### Common Violations

- `<img>` tag instead of `next/image`
- Client-side `useEffect(() => fetch(...))` when a Server Component works
- Barrel `index.ts` re-exporting 50 components (entire tree loads)
- N+1 queries in list endpoints (query per item instead of single join)
- Missing `sizes` on `next/image` (downloads wrong resolution)

---

## 5. Caching Strategy

**Why:** Wrong caching = stale data shown to users or unnecessary server load. Right caching = fast + cheap.

### Architect Must Spec

- [ ] Which routes are static vs dynamic (`force-dynamic` only when truly needed)
- [ ] Cache invalidation strategy per data type (`revalidateTag` vs `revalidatePath` vs time-based)
- [ ] Which operations need `React.cache()` for request-level dedup
- [ ] `generateStaticParams()` candidates (known-at-build-time pages)

### Agent Must Implement

- [ ] Default to cached Server Components (opt out explicitly, not opt in)
- [ ] `revalidateTag()` after mutations for granular invalidation
- [ ] `revalidatePath()` for page-level invalidation when tags are overkill
- [ ] Time-based revalidation where appropriate (`export const revalidate = 60`)
- [ ] `React.cache()` for expensive operations called multiple times per request
- [ ] `generateStaticParams()` for known-at-build-time dynamic routes
- [ ] Never cache user-specific data in shared caches

### Common Violations

- `export const dynamic = 'force-dynamic'` on pages that could be static
- Mutating data without calling `revalidateTag()` or `revalidatePath()`
- Caching responses that include user-specific data
- Missing `generateStaticParams()` on blog/product pages with known slugs

---

## 6. Routing & Error Handling

**Why:** Missing error boundaries crash the whole page. Missing loading states make the app feel broken.

### Architect Must Spec

- [ ] Route group strategy (`(auth)`, `(marketing)`, `(dashboard)` — which layouts share)
- [ ] Auth guard placement (middleware vs layout vs per-page)
- [ ] Parallel route needs (`@modal`, `@sidebar` if applicable)
- [ ] URL structure for public-facing pages (kebab-case, no IDs when avoidable)

### Agent Must Implement

- [ ] `loading.tsx` at route segment boundaries (Suspense fallback)
- [ ] `error.tsx` at route segment boundaries (error recovery with retry)
- [ ] `not-found.tsx` for 404 handling
- [ ] Middleware for auth redirects (unauthenticated → login)
- [ ] Route groups for shared layouts
- [ ] Clean URLs: kebab-case, semantic, no leaked database IDs in public URLs

### Common Violations

- No `error.tsx` → unhandled error crashes the whole page tree
- No `loading.tsx` → blank screen during data fetch
- Auth checks in every page instead of middleware
- URLs like `/products/a1b2c3d4-e5f6-...` instead of `/products/blue-widget`

---

## 7. Architecture (SOLID, DI, Separation of Concerns)

**Why:** Tightly coupled code can't be tested, can't be reused, and breaks when anything changes.

### Architect Must Spec

- [ ] Service layer boundaries (which services exist, what each owns)
- [ ] Repository interfaces for database access
- [ ] External API interfaces (payment, email, storage — all behind abstractions)
- [ ] Component hierarchy and data flow direction

### Agent Must Implement

- [ ] **Single Responsibility:** One component/service/handler = one job
- [ ] **Layered backend:** Route handlers → Services → Repositories → Database (no DB queries in handlers)
- [ ] **Layered frontend:** Server Components (data) → Client Components (interaction) → Hooks (logic) → Utils (pure functions)
- [ ] **Dependency Inversion:** Services depend on interfaces, not concrete implementations. Constructor injection for backend services. React Context for frontend DI.
- [ ] **Interface Segregation:** Small, focused interfaces. No god-interfaces.
- [ ] **Composition over modification:** Extend via props/slots/composition, not by editing existing components

### Common Violations

- Database queries directly in API route handlers (no service layer)
- Business logic in React components (should be in hooks or utils)
- Direct imports of concrete implementations in business logic
- 500-line "god components" that fetch, process, and render
- Shared mutable state between services

---

## Domain Applicability Matrix

Not every project needs every domain. Use this to decide what applies:

| Domain | Public Website | Dashboard/Admin | API-Only |
|--------|:---:|:---:|:---:|
| Security | Required | Required | Required |
| SEO | Required | N/A | N/A |
| Accessibility | Required | Required | N/A |
| Performance | Required | Important | Important |
| Caching | Important | Situational | Important |
| Routing | Required | Required | N/A |
| Architecture | Required | Required | Required |

**"Required"** = must be in every tech spec.
**"Important"** = should be addressed unless explicitly deprioritized.
**"Situational"** = depends on project requirements.
**"N/A"** = not applicable to this project type.
