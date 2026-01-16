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