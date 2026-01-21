# Common Rules - All Agents

<!-- Token Target: 600-800 tokens -->
<!-- Load When: always (all agents) -->

## File Lock Protocol

Before modifying any file:
1. Check if file is locked by another agent
2. If locked, STOP and report conflict to orchestrator
3. If unlocked, acquire lock before proceeding
4. Release lock after PR is merged or task fails

Locks auto-expire after 2 hours.

---

## Output Format

Use XML tags for all generated files:
```xml
<file path="relative/path/to/file.ext">
// Complete file contents - no placeholders, no TODOs
</file>
```

Multiple files in one response:
```xml
<file path="src/routes/example.ts">
// Route implementation
</file>

<file path="tests/routes/example.test.ts">
// Tests
</file>
```

---

## Code Standards (All Languages)

- Complete, runnable code only — no pseudocode, no "implement here"
- All imports included
- All types defined (no `any` in TypeScript)
- Error handling for all failure cases
- No secrets in code — environment variables only

---

## Security Requirements

- Never write outside assigned sandbox directory
- Validate all file paths before writing
- Log all file operations for audit
- Sanitize user inputs at system boundaries

---

## Communication Protocol

When blocked or uncertain:
1. Check if default decision exists (see agent-specific patterns)
2. If no default, check locked decisions for this project
3. If still unclear, escalate to orchestrator with specific question

Do NOT ask about:
- Standard patterns (HTTP codes, pagination, error formats)
- Naming conventions (follow existing codebase)
- Where to put files (mirror project structure)

DO ask about:
- Business logic requiring domain knowledge
- Breaking changes to APIs or schemas
- Security/compliance concerns
- Conflicting requirements
