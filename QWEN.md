# Blawby Backend - Project Context

## Project Overview

**Blawby** is a legal practice management SaaS backend built with TypeScript and Hono. It provides comprehensive practice management for law firms including matters (cases), clients, billing, invoices, subscriptions, and practice administration.

### Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js >=18.17.0 |
| **Framework** | Hono v4 with OpenAPI (`@hono/zod-openapi`) |
| **Language** | TypeScript 5.9 |
| **Database** | PostgreSQL 14+ via Drizzle ORM 0.45.x |
| **Auth** | Better Auth 1.4.x |
| **Authorization** | CASL (`@casl/ability`) |
| **Validation** | Zod v4 (via `@hono/zod-openapi`) |
| **Logging** | LogTape (`@logtape/logtape`) |
| **Queue** | Graphile Worker (PostgreSQL-backed) |
| **Package Manager** | pnpm 10.x |
| **Linting/Formatting** | oxlint + oxfmt |

## Critical Development Rules

1. **NEVER use relative imports** — Always use `@/` path aliases (`@/shared/...`, `@/modules/...`, `@/schema`)
2. **NEVER use `console.log`** — Use LogTape: `getLogger(['module', 'context'])`
3. **NEVER import `z` from `zod`** — Import from `@hono/zod-openapi`
4. **NEVER use `z.string().uuid()`** — Use `z.uuid()` (Zod v4 syntax)
5. **NEVER throw for expected failures** — Use the `Result<T>` pattern from `@/shared/utils/result`
6. **NEVER use `any` type** — ESLint enforces `typescript/no-explicit-any: error`
7. **API uses `snake_case`** — Database columns, request/response fields
8. **Internal code uses `camelCase`** — Variables, functions, local logic
9. **Use `practice_id` in API paths** — Even though DB column is `organization_id`

## Key Commands

```bash
# Development
pnpm run dev            # Start dev server (tsx watch)
pnpm run dev:full       # Start API + event worker + email worker

# Code Quality
pnpm run typecheck      # TypeScript type checking
pnpm run format         # Format code with oxfmt
pnpm run format:check   # Check formatting
pnpm run lint           # Lint with oxlint
pnpm run lint:fix       # Fix lint issues

# Database
pnpm run db:generate    # Generate Drizzle migrations
pnpm run db:migrate     # Run migrations
pnpm run db:studio      # Open Drizzle Studio

# Testing & Build
pnpm run test           # Run tests (tap)
pnpm run build          # Production build
```

## Project Structure

```
src/
├── hono-app.ts              # Main Hono application
├── hono-server.ts           # HTTP server entry point
├── boot/                    # Application bootstrap
│   ├── index.ts             # Boot sequence
│   ├── env.ts               # Environment setup
│   ├── services.ts          # Service initialization
│   ├── event-handlers.ts    # Event handlers
│   └── workers.ts           # Worker initialization
├── schema/                  # Central DB schema index
├── workers/                 # Background workers
│   ├── event.worker.ts
│   └── email.worker.ts
├── scripts/                 # One-off scripts
├── modules/                 # Feature modules (domain-driven)
│   ├── auth/                # Authentication
│   ├── clients/             # Client management (profiles, memos)
│   ├── dev/                 # Development utilities
│   ├── invoices/            # Invoice management
│   ├── matters/             # Legal matter management
│   ├── onboarding/          # Stripe Connect onboarding
│   ├── practice/            # Practice/organization management
│   ├── practice-client-intakes/  # Client intake forms
│   ├── preferences/         # User preferences
│   ├── public/              # Public routes
│   ├── stripe/              # Stripe integration
│   ├── subscriptions/       # Subscription management
│   ├── trust/               # Trust accounting
│   ├── uploads/             # File uploads
│   └── webhooks/            # Webhook handlers
└── shared/
    ├── auth/                # CASL abilities, Better Auth
    ├── database/            # DB connection, migrations
    ├── events/              # Event system
    ├── logging/             # LogTape configuration
    ├── middleware/          # Auth, validation, error handling
    ├── queue/               # Graphile Worker config
    ├── router/              # Hono app factory, route builder
    ├── types/               # Global TypeScript types
    └── utils/               # Utilities (Result<T>, env, etc.)
```

## Module Architecture

Each feature module follows a consistent structure:

```
modules/{feature}/
├── index.ts                 # Entry point
├── http.ts                  # Route registration
├── handlers.ts              # Request handlers
├── routes/                  # OpenAPI route definitions
│   ├── index.ts
│   └── core.routes.ts
├── services/                # Business logic (Result<T> pattern)
│   └── {name}.service.ts
├── database/
│   ├── schema/              # Drizzle tables + relations
│   │   └── {name}.schema.ts
│   └── queries/             # Repository functions
│       └── {name}.queries.ts
├── types/                   # Zod schemas + types
│   └── {name}.types.ts
├── validations/             # Validation schemas
├── listeners.ts             # Event listeners
└── routes.config.ts         # Route configuration
```

## Request Flow

```
Client Request
    ↓
Global Middleware (requestId, logging, CORS)
    ↓
Auth Middleware (if protected route)
    ↓
Route Handler
    ↓
Service Layer (business logic, Result<T>)
    ↓
Repository Layer (database queries)
    ↓
Database (PostgreSQL via Drizzle)
    ↓
Response Middleware
    ↓
Client Response
```

## Key Patterns

### Result Pattern for Error Handling

```typescript
import { ok, fail, Result } from '@/shared/utils/result';

// Success
return ok(data);

// Failure
return fail('Error message', HttpStatus.BAD_REQUEST, 'ERROR_CODE');

// Shortcuts
return badRequest('Invalid input');
return unauthorized('Not authenticated');
return forbidden('Insufficient permissions');
return notFound('Resource not found');
return internalError('Something went wrong');
```

### Service Context

All services receive a `ServiceContext` with authenticated user info:

```typescript
interface ServiceContext {
  userId: string;
  userEmail: string;
  activeOrganizationId: string | null;
  memberRole: string | null;
  ability: AppAbility;
}
```

### OpenAPI Route Definition

```typescript
import { createRoute, z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const routes = routeBuilder('/api/resource')
  .openapi(
    createRoute({
      method: 'get',
      path: '/',
      request: {},
      responses: {
        200: { description: 'Success', content: { 'application/json': {} } },
      },
    }),
    async (c) => {
      // Handler logic
      return c.json({ data: [] });
    }
  )
  .build();
```

## Database Schema

### Core Tables (Better Auth)

- **user** — User accounts
- **organization** — Organizations/practices
- **member** — Organization membership with roles
- **session** — User sessions with `active_organization_id`
- **invitation** — Organization invitations

### Key Conventions

- All tables use `id` as primary key (uuid or text)
- Timestamps: `created_at`, `updated_at`
- Soft deletes via `deleted_at` where applicable
- Foreign keys with `ON DELETE CASCADE` for related data
- Indexes on frequently queried columns

## Authentication & Authorization

### Authentication Flow

1. User authenticates via Better Auth (`/api/auth/*`)
2. Session created with `active_organization_id`
3. Request includes session token (cookie or bearer)
4. Middleware validates session and decorates `c.req` with user info

### Authorization (CASL)

```typescript
import { defineAbility } from '@casl/ability';

// Define abilities per role
const ability = defineAbility((can) => {
  can('read', 'Practice');
  can('create', 'Practice');
  cannot('delete', 'Practice');
});

// Check in services
if (ctx.ability.cannot('delete', 'Practice')) {
  return forbidden('Cannot delete practices');
}
```

## Background Jobs (Graphile Worker)

```typescript
import { getWorkerUtils } from '@/shared/queue/graphile-worker.client';

// Enqueue a job
const utils = await getWorkerUtils();
await utils.addJob('send-email', { to, subject, body });
```

## Environment Variables

Required environment variables (see `.env.example`):

```env
# Database
DATABASE_URL=postgresql://...

# Auth
BETTER_AUTH_SECRET=...
BETTER_AUTH_BASE_URL=...

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_CONNECT_WEBHOOK_SECRET=...

# Server
PORT=3000
SERVER_HOSTNAME=0.0.0.0
NODE_ENV=development
APP_ENV=development

# Email
RESEND_API_KEY=...

# Security
CLOUDFLARE_TURNSTILE_SECRET_KEY=...
SKIP_CAPTCHA=false
```

## Linting Configuration (`.oxlintrc.json`)

Disabled rules (allowed patterns):

- `no-magic-numbers` — Numeric literals allowed
- `no-ternary` — Ternary expressions allowed
- `id-length` — Short variable names allowed (e.g., generic `T`)
- `sort-keys` — Object key order not enforced
- `sort-imports` — Import order not enforced
- `node/no-import` — Node.js built-ins allowed
- `max-statements` — No function length limit
- `max-params` — No parameter count limit

Enabled strict rules:

- `typescript/no-explicit-any` — Error
- `import/no-cycle` — Error (max depth: 3)
- `typescript/no-unsafe-*` — Warn
- `no-unused-vars` — Error (allows `_` prefix)

## Testing

Uses `@tapjs/test` with TypeScript support:

```bash
pnpm run test              # Run all tests
pnpm run test test/path    # Run specific test file
```

Test files located in `test/` directory with `.test.ts` extension.

## Build & Deployment

```bash
# Production build
pnpm run build

# Output: dist/
# - hono-server.js
# - workers/*.worker.js

# Start production
pnpm run start             # API server
pnpm run start:all         # API + workers
```

## API Documentation

OpenAPI documentation available at:

- **Scalar UI**: `/api/docs` (development)
- **OpenAPI JSON**: `/api/openapi.json`
- **Markdown**: Generated via `@scalar/openapi-to-markdown`

## File Conventions

- **Imports**: `@/` path aliases only (no relative imports)
- **Exports**: Prefer named exports; default for main module entry
- **Naming**: `camelCase` for code, `snake_case` for API/DB
- **Types**: TypeScript interfaces for shapes, Zod for validation
- **Errors**: `Result<T>` pattern, never throw for expected failures
