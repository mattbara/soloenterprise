# Common Agent Guidelines

These rules apply to ALL agents (Backend, Frontend, QA, DevOps).

---

## Project Mode

Your output depends on the project context provided:

### New Project (no existing codebase context)
Generate complete, portable output:
- Full project scaffolding (package.json, tsconfig.json, etc.)
- All config files needed to run standalone
- Complete test setup
- README with setup instructions

Goal: Output folder can be copied anywhere and work immediately.

### Existing Project (codebase context provided)
Generate minimal files that integrate:
- Follow existing patterns from context
- No config files (already exist)
- Match import styles, folder structure, naming conventions
- Only the files needed for the feature

Goal: Output merges cleanly into existing codebase.

### How to Detect Mode
- Codebase context includes existing routes/services → **Existing project**
- Codebase context is empty or schema-only → **New project**
- When unclear → **New project** (safer to be complete)

---

## Output Format

All agents output files using XML tags:
```xml
<file path="path/to/file.ts">
// file contents
</file>
```

- Paths are relative to project root
- Include ALL imports and type definitions
- No pseudocode or placeholder comments
- Complete, runnable code only

---

## Quality Standards (All Agents)

1. **No `any` types** in TypeScript
2. **Error handling** — never swallow errors
3. **Tests included** — for all new functionality
4. **Self-documenting code** — clear naming, minimal comments

---

## Code Quality Requirements

### Syntax Validity (CRITICAL)

All generated code MUST be syntactically valid and compile without errors.

**Common mistakes to avoid:**

| Mistake | Example | Correct |
|---------|---------|---------|
| Missing template literal bracket | `sql<number\`...\`` | `sql<number>\`...\`` |
| JSX attribute missing braces | `className=\`flex\`` | `className={\`flex\`}` |
| Typos in imports/functions | `sq\`...\`` | `sql\`...\`` |
| Unclosed brackets | `({ foo: bar` | `({ foo: bar })` |
| Missing commas | `{ a: 1 b: 2 }` | `{ a: 1, b: 2 }` |
| Unterminated strings | `"hello` | `"hello"` |

**Before outputting code, mentally verify:**
1. All brackets are balanced: `()`, `{}`, `[]`, `<>`
2. All template literals have matching backticks
3. All strings are terminated
4. All imports match what you're using
5. No typos in function/variable names

### Import Patterns

Always use import paths that match the existing codebase context:
```typescript
// If context shows this pattern:
import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';

// Then use the SAME pattern, not:
import { db } from '@/db';           // Wrong
import { db } from '../../../db';    // Wrong
```

**Rule: Copy import patterns exactly from the codebase context provided.**

### JSX/TSX Syntax — All Agents

When generating JSX/TSX code with dynamic attributes:

**ALWAYS write:**
```tsx
attribute={`template ${variable} literal`}
```

**NEVER write:**
```tsx
attribute=`template ${variable} literal`}
```

The opening curly brace `{` before the backtick is REQUIRED. This is especially important when the template contains apostrophes like `'s`:
```tsx
// ✓ Correct
aria-label={`${name}'s profile`}

// ✗ Wrong - will not compile
aria-label=`${name}'s profile`}
```

## Import Rules

- ONLY import modules you can see in the provided codebase context
- NEVER assume middleware, utilities, or helpers exist
- If you want to add rate limiting, auth, etc. — generate the middleware file too, or note it as a dependency in your response

---

## Missing Context Rules

Before generating code, verify these exist in the provided codebase context:

### 1. Database Tables
If the task references a table (e.g., "fetch from invoices table"):
- Check if that table exists in the provided schema
- If NOT found: ASK "I don't see an invoices table in the schema. Should I create it, or does it exist elsewhere?"
- DO NOT invent schema structures

### 2. Dependencies
If you need a library (e.g., PDF generation, image processing):
- Check if it's in the provided package.json or imported in existing code
- If NOT found: ASK "This task requires PDF generation. What library should I use? (e.g., pdfkit, puppeteer, etc.)"
- DO NOT assume packages are installed

### 3. Authentication & Authorization
If the task mentions permissions, roles, "only X can do Y", ownership checks:
- Check if auth patterns exist in the codebase (middleware, session handling, user context)
- If NOT found: ASK "How should I identify the current user? Is there existing auth middleware?"
- DO NOT silently ignore security requirements
- DO NOT invent your own auth system

### 4. External Services
If the task requires external APIs or services not shown in context:
- ASK what credentials/configuration exist
- DO NOT hardcode or assume environment variables

---

## The Rule

**When required context is missing: ASK. Never invent. Never skip.**

If you're about to:
- Import a table you don't see in schema → STOP and ASK
- Import a package you don't see in dependencies → STOP and ASK
- Implement auth without seeing auth patterns → STOP and ASK
- Skip a stated requirement because you don't know how → STOP and ASK