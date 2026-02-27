# Claude Code Prompt: Phase 6.9.1 — Architecture Quality Standards

## Context

SoloEnterprise is a monorepo (pnpm workspaces + Turbo) that orchestrates AI agents to build software for clients. Read `CLAUDE.md` and `docs/SOLOENTERPRISE_PHASES_CURRENT.md` before starting.

**Current state:**
- 7 working agents: Backend, Frontend, QA, Orchestrator, Architect, Project Scoper, Client Reporter
- Agents read SKILL files (in `skills/{agent-type}/`) for coding patterns
- The Architect agent generates tech specs per task before agents execute
- The Reviewer agent (Phase 7, not yet built) will review PRs
- Agent SKILL files currently have **critical gaps** in production-quality patterns

**The problem:**
An audit of all SKILL files found that security, SEO, accessibility, caching, performance, routing, SOLID/DI, and separation of concerns are either completely missing or superficially mentioned with no actionable patterns. If agents build a client project today, it ships with XSS vulnerabilities, zero SEO, WCAG violations, no caching strategy, and tightly coupled architecture.

**The root cause:**
There's no top-down enforcement. Even if agent SKILL files had perfect patterns, nobody tells the Architect to spec CSP headers or the Orchestrator to plan accessibility tasks. The gap is architectural, not just implementation.

---

## Phase 6.9.1: Architecture Quality Standards

**Branch:** `phase69/quality-standards`
**Base:** `phase69/scaffolding` (current working branch)
**Effort:** M | **Impact:** Critical
**Duration:** 2-3 days

### What We're Building (Three Tiers)

#### Tier 1: Architecture Quality Checklist (HIGHEST PRIORITY)

**One document** used by three roles:
- **Architect agent** — references when generating tech specs (ensures every project gets security/SEO/a11y requirements)
- **Orchestrator agent** — references when decomposing projects into tasks (ensures nothing is forgotten)
- **Reviewer agent** (Phase 7) — references when reviewing PRs (enforcement gate)

**Location:** `docs/ARCHITECTURE_QUALITY_CHECKLIST.md`

**Must cover these domains with concrete, checkable items (not vague principles):**

1. **Security (Frontend + Backend + Infra)**
   - XSS prevention (output encoding, CSP headers, `dangerouslySetInnerHTML` ban)
   - CSRF protection (token-based for state-changing requests)
   - SQL injection prevention (parameterized queries only, never string concatenation)
   - Content-Security-Policy headers
   - Authentication token storage (httpOnly cookies, not localStorage)
   - Input validation at system boundaries (Zod on API routes)
   - Rate limiting on public endpoints
   - CORS configuration (explicit origins, no wildcards in production)
   - Security headers (X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy)
   - Secret management (env vars only, never in code/logs/generated output)
   - File upload validation (type, size, content sniffing)
   - Password hashing (bcrypt/argon2, never MD5/SHA)

2. **SEO (Critical for client projects)**
   - `generateMetadata()` on every page (title, description, Open Graph, Twitter cards)
   - Canonical URLs on all pages
   - `robots.ts` configuration
   - `sitemap.xml` generation (`sitemap.ts`)
   - Structured data (JSON-LD for relevant page types)
   - Semantic HTML (headings hierarchy, landmarks)
   - Image `alt` text (mandatory, descriptive)
   - Internal linking strategy
   - 404/error page SEO handling

3. **Accessibility (WCAG 2.1 AA — legal requirement in many jurisdictions)**
   - Semantic HTML elements (`nav`, `main`, `aside`, `article`, `section`)
   - ARIA landmarks where semantics aren't enough
   - Keyboard navigation (all interactive elements reachable via Tab)
   - Focus management (trap in modals, restore on close)
   - Skip links on every page
   - Color contrast 4.5:1 for text, 3:1 for large text
   - `aria-live` regions for dynamic content updates
   - Form labels associated with inputs (explicit `htmlFor`)
   - Error messages announced to screen readers
   - No information conveyed by color alone
   - `prefers-reduced-motion` respected
   - Touch targets minimum 44x44px

4. **Performance**
   - `next/image` for all images (with `priority` on LCP image, `sizes` attribute)
   - `next/font` for font loading (no layout shift)
   - `next/script` with appropriate `strategy` for third-party scripts
   - Dynamic imports (`next/dynamic`) for heavy components below the fold
   - Route-based code splitting (default in App Router, but verify no barrel imports defeat it)
   - Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1
   - No client-side fetching when server component works
   - Database query optimization (no N+1, use joins/includes)
   - API response budgets (< 200ms for reads, < 500ms for writes)
   - Bundle size monitoring (flag > 100KB first-load JS)

5. **Caching Strategy**
   - Server component default: cached (opt out with `export const dynamic = 'force-dynamic'` only when needed)
   - `revalidateTag()` for granular cache invalidation after mutations
   - `revalidatePath()` for page-level invalidation
   - Time-based revalidation where appropriate (`export const revalidate = 60`)
   - React `cache()` for request-level memoization of expensive operations
   - Static generation (`generateStaticParams()`) for known-at-build-time pages
   - CDN cache headers for static assets
   - No over-caching of user-specific data

6. **Routing & Error Handling**
   - Route groups for layout organization (`(auth)`, `(marketing)`, `(dashboard)`)
   - `loading.tsx` at route segment boundaries (Suspense boundaries)
   - `error.tsx` at route segment boundaries (error recovery)
   - `not-found.tsx` for 404 handling
   - Middleware for auth guards (redirect unauthenticated users)
   - Parallel routes where applicable (`@modal`)
   - Clean URL structure (kebab-case, no IDs in public URLs when avoidable)

7. **Architecture (SOLID, DI, Separation of Concerns)**
   - **Single Responsibility:** One component = one job. One service = one domain. One route handler = one endpoint.
   - **Open/Closed:** Use composition over modification. Extend via props/slots, not by editing existing components.
   - **Liskov Substitution:** Interface contracts honored. If a service implements an interface, all implementations are interchangeable.
   - **Interface Segregation:** Small, focused interfaces. No god-interfaces with 20 methods.
   - **Dependency Inversion:** High-level modules depend on abstractions, not implementations. Database access behind repository interfaces. External APIs behind service interfaces.
   - **Layered architecture (backend):** Route handlers → Services → Repositories → Database. No DB queries in route handlers.
   - **Separation (frontend):** Server Components for data fetching → Client Components for interactivity → Custom hooks for reusable logic → Utility functions for pure computation.
   - **DI pattern:** Constructor injection for services. React Context for frontend DI. No direct imports of concrete implementations in business logic.

**Format:** Each domain should have:
- A brief "Why this matters" (1 sentence)
- Concrete checklist items (checkboxes)
- "Architect must spec" items vs "Agent must implement" items (distinguish planning from execution)
- Common violations to watch for

---

#### Tier 2: Agent Implementation SKILL Files

**New SKILL files** that contain the HOW-TO for each agent. These are loaded when the agent works on a relevant task. Keep within token budgets (600-1000 tokens each).

**Frontend SKILL files to create:**

| File | Token Budget | Load When |
|------|-------------|-----------|
| `skills/frontend/SKILL-frontend-routing.md` | 600-800 | route/page/layout tasks |
| `skills/frontend/SKILL-frontend-performance.md` | 600-800 | any component/page task |
| `skills/frontend/SKILL-frontend-seo.md` | 600-800 | page tasks (not internal dashboard components) |
| `skills/frontend/SKILL-frontend-accessibility.md` | 600-800 | any component/page task |
| `skills/frontend/SKILL-frontend-security.md` | 600-800 | forms, auth, data display tasks |

**Backend SKILL files to create:**

| File | Token Budget | Load When |
|------|-------------|-----------|
| `skills/backend/SKILL-backend-security.md` | 600-800 | API routes, auth, data handling |
| `skills/backend/SKILL-backend-architecture.md` | 600-800 | service/repository/feature tasks |
| `skills/backend/SKILL-backend-performance.md` | 600-800 | API routes, database tasks |

**Common SKILL file to create:**

| File | Token Budget | Load When |
|------|-------------|-----------|
| `skills/common/SKILL-common-security.md` | 400-600 | all agents, all tasks (lightweight) |

**Each SKILL file must contain:**
- Concrete code patterns (DO this / DON'T do this)
- The minimum patterns needed — not an encyclopedia
- Framework-specific guidance (Next.js 15 App Router, not generic React)
- References to `@soloenterprise/theme` where relevant (theming SKILL already exists)

**Do NOT duplicate content between the Architecture Quality Checklist and SKILL files.** The checklist says WHAT to check. The SKILL file says HOW to implement it. Different audiences, different purposes.

---

#### Tier 3: Template Repo Updates (LOWEST PRIORITY — can be deferred)

These are config files for the `soloenterprise-templates` repo that make quality standards the default in scaffolded projects. **Only do this if time permits** — Tiers 1 and 2 are the priority.

- `middleware.ts` skeleton with security headers
- `robots.ts` template
- `sitemap.ts` template
- ESLint config with `eslint-plugin-jsx-a11y`
- `next.config.ts` with security headers section

**Template repo location:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise-templates`

---

### Existing Files to Update

After creating new files, update these to reference them:

1. **`docs/DOCUMENTATION_STRUCTURE.md`** — add new SKILL files to the tree
2. **`docs/SOLOENTERPRISE_PHASES_CURRENT.md`** — add Phase 6.9.1 section
3. **`docs/HANDOFF_PHASES/HANDOFF_PHASE6.9_READY.md`** — add quality standards pre-work
4. **`skills/frontend/SKILL-frontend-core.md`** — add note that specialized SKILL files exist for security/a11y/SEO/performance/routing (agents should know they exist)
5. **`skills/backend/SKILL-backend-core.md`** — same, reference new backend SKILL files

### Skill Loader Integration Note

The skill loader (`packages/core/src/agents/utils/skill-loader.ts`) needs to know when to load these new SKILL files. Read the current skill-loader implementation to understand the loading logic, then either:
- Add load conditions to the skill loader, OR
- Document the load conditions in the SKILL file headers (existing pattern: `<!-- Load When: ... -->`)

Do NOT modify the skill-loader if the header-based approach already works.

---

### What NOT To Do

- **Do NOT create an encyclopedia.** Each SKILL file is 600-800 tokens. Be ruthless about what makes the cut.
- **Do NOT duplicate between checklist and SKILL files.** Checklist = WHAT to verify. SKILL = HOW to implement.
- **Do NOT add aspirational items.** Only include patterns that agents can actually implement today with the current stack (Next.js 15, Tailwind v4, Drizzle, shadcn/ui).
- **Do NOT modify existing agent implementations** (no changes to `*-agent.ts` files). This phase is documentation/standards only.
- **Do NOT create test files.** These are markdown documents, not code.
- **Do NOT touch the templates repo** unless Tiers 1 and 2 are fully complete.

---

### Checklist

- [ ] `docs/ARCHITECTURE_QUALITY_CHECKLIST.md` created (Tier 1)
- [ ] All 9 new SKILL files created (Tier 2: 5 frontend + 3 backend + 1 common)
- [ ] Each SKILL file within token budget (600-800 tokens, common 400-600)
- [ ] No duplication between checklist and SKILL files
- [ ] `SKILL-frontend-core.md` updated to reference new specialized files
- [ ] `SKILL-backend-core.md` updated to reference new specialized files
- [ ] `docs/DOCUMENTATION_STRUCTURE.md` updated
- [ ] `docs/SOLOENTERPRISE_PHASES_CURRENT.md` updated with Phase 6.9.1
- [ ] `docs/HANDOFF_PHASES/HANDOFF_PHASE6.9_READY.md` updated
- [ ] Skill loader load conditions documented (header-based or code-based)

### Definition of Done

An Architect agent reading the quality checklist can produce a tech spec that includes security headers, SEO metadata, accessibility requirements, caching strategy, and proper architectural layering — for ANY client project type. Implementation agents reading their specialized SKILL files can then execute those requirements with correct patterns.
