# Common Security Rules - All Agents

<!-- Token Target: 400-600 tokens -->
<!-- Load When: always -->

## Non-Negotiable Security Rules

These apply to EVERY agent on EVERY task. No exceptions.

### Secrets

- Environment variables only. Never in code, config files, comments, logs, or generated output.
- If you see a secret in source code, flag it immediately — do not proceed.

### Input Boundaries

- Validate ALL external input at the system boundary (API routes, form submissions, URL params).
- Use Zod schemas. Never trust unvalidated input in business logic.

### Output Safety

- Never expose internal errors to clients. Log details server-side, return generic messages.
- Never include stack traces, SQL queries, or file paths in API responses.
- Never log passwords, tokens, API keys, or PII.

### Dependency Awareness

- Do not add packages without checking if they're maintained and necessary.
- Prefer built-in/framework features over third-party packages for security-critical functions.
- Never use `eval()`, `Function()`, or any dynamic code execution with user input.

### File Operations

- Validate all file paths before read/write operations.
- Never allow path traversal (`../`) in user-supplied file names.
- Whitelist allowed file extensions for uploads.

### Authentication

- Never roll custom auth crypto. Use established libraries (better-auth, next-auth, lucia).
- Never compare passwords with `===`. Use constant-time comparison (hash verification handles this).
- Session tokens must be cryptographically random, not sequential or predictable.
