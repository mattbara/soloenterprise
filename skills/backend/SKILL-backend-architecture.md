# Backend Engineer - Architecture

<!-- Token Target: 600-800 tokens -->
<!-- Load When: service, repository, feature, module, refactor, layer, structure, crud, domain -->

## Layered Architecture

```
Route Handler → Service → Repository → Database
     ↓              ↓           ↓
  Validates     Business    Data access
  input/output  logic       (Drizzle queries)
```

**Route handlers** parse input and format output. No business logic. No DB queries.
**Services** contain business logic. Accept typed inputs, return typed outputs.
**Repositories** wrap Drizzle queries. Only place that imports `db` and `schema`.

## Route Handler (Thin)

```typescript
// src/routes/users.ts
app.post('/users', async (c) => {
  const parsed = createUserSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, 400);

  const result = await userService.createUser(parsed.data);
  if (result.error) return c.json({ error: result.error }, result.status);
  return c.json(result.data, 201);
});
```

## Service (Business Logic)

```typescript
// src/services/user-service.ts
export class UserService {
  constructor(private userRepo: UserRepository) {}

  async createUser(input: CreateUserInput): Promise<ServiceResult<User>> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) return { error: 'Email already registered', status: 409 };

    const passwordHash = await hash(input.password);
    const user = await this.userRepo.create({ ...input, passwordHash });
    return { data: user };
  }
}
```

## Repository (Data Access)

```typescript
// src/repositories/user-repository.ts
import { db } from '@soloenterprise/db';
import { users } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';

export class UserRepository {
  async findByEmail(email: string) {
    return db.query.users.findFirst({ where: eq(users.email, email) });
  }

  async create(data: InsertUser) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async findById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  }
}
```

## Dependency Injection

```typescript
// src/di/container.ts — wire up once
const userRepo = new UserRepository();
const userService = new UserService(userRepo);
export { userService };

// In routes — import from container, not concrete classes
import { userService } from '../di/container';
```

## Service Result Pattern

```typescript
type ServiceResult<T> =
  | { data: T; error?: never; status?: never }
  | { data?: never; error: string; status: number };

// Usage in service
async getUser(id: string): Promise<ServiceResult<User>> {
  const user = await this.userRepo.findById(id);
  if (!user) return { error: 'User not found', status: 404 };
  return { data: user };
}
```

## Rules

- One service per domain (UserService, OrderService — not UserOrderService)
- Services call other services, never other repositories directly
- Repositories never call services (no circular deps)
- Shared logic → utility functions, not base classes
- No god-services — if a service file exceeds 300 lines, split by subdomain
