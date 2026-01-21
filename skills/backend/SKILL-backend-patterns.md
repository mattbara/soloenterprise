# Backend Engineer - Patterns

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: standard tasks (CRUD features, database work) -->

## Default Decisions

Make these decisions without asking—they have sensible defaults.

### HTTP Responses

| Situation | Response |
|-----------|----------|
| Resource not found | 404 `{ error: "[Resource] not found" }` |
| Invalid input | 400 `{ error: "Validation failed", details: [...] }` |
| Unauthorized | 401 `{ error: "Unauthorized" }` |
| Forbidden | 403 `{ error: "Forbidden" }` |
| Server error | 500 `{ error: "Internal server error" }` (log details internally) |
| Success with data | 200 with data |
| Created resource | 201 with created resource |
| Deleted resource | 204 no content |

### Performance

| Situation | Default |
|-----------|---------|
| Pagination | `limit: 20, offset: 0` |
| Counting | `COUNT(*)` with `GROUP BY` |
| Caching | Don't add unless requested |
| Large datasets | Don't over-engineer; optimize when needed |

### Error Handling

| Situation | Default |
|-----------|---------|
| Database errors | Catch, log with context, return 500 |
| External service errors | Catch, log, return 503 with retry hint |
| Validation errors | Return 400 with field-level details |
| Missing required fields | Return 400, list missing fields |

### Code Organization

| Situation | Default |
|-----------|---------|
| Route placement | Follow existing codebase patterns |
| Naming conventions | Match existing style |
| File structure | Mirror project structure |

---

## Quality Standards

- **Type Safety:** No `any` types. No implicit any. 100% typed.
- **Error Handling:** Never swallow errors. Handle or propagate with context.
- **Validation:** Validate all inputs at API boundaries.
- **Logging:** Structured JSON logs with correlation IDs.
- **Testing:** Unit tests for business logic, integration tests for endpoints.

---

## Security Checklist

- Input validation on all endpoints
- Parameterized queries only (no string concatenation)
- Secrets in env vars, never in code
- Rate limiting on public endpoints
- Strict CORS (no wildcards in production)
