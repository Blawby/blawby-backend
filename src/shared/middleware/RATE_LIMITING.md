# Rate Limiting

## Overview

Rate limiting is **enabled by default** on all API routes to prevent abuse and protect against DoS attacks.

## Implementation

### Authentication Routes (`/api/auth/*`)

Uses Better Auth's built-in rate limiting with PostgreSQL storage:

- **Default**: 100 requests / 60 seconds
- **Sign-in**: 5 requests / 60 seconds (stricter to prevent brute force)
- **Sign-up**: 3 requests / 60 seconds
- **Password reset**: 3 requests / 300 seconds

**Configuration**: `src/shared/auth/better-auth.ts`

### General API Routes (`/api/*`)

Uses PostgreSQL-based rate limiting via `rate-limiter-flexible`:

- **Default**: 60 requests / 60 seconds
- **Storage**: PostgreSQL (works across multiple server instances)
- **Identifier**: User ID (if authenticated) or IP address
- **Automatic cleanup**: Database handles TTL

**Middleware**: `src/shared/middleware/rateLimit.ts`

## Default Behavior

Rate limiting is **automatically applied** to all modules:

- **Protected modules** (default): `['requireAuth', 'rateLimit']`
- **Public modules** (default): `['rateLimit']`
- **Modules with configs**: Defaults are merged, so `rateLimit` is always included

You don't need to add `rateLimit` to your module configs - it's included automatically.

## Custom Configuration

### Per-Route Limits

You can customize limits for specific routes:

```typescript
// In your route handler
import { rateLimit } from '@/shared/middleware/rateLimit';

app.post('/api/heavy-operation', 
  rateLimit({ points: 10, duration: 60 }), // 10 requests per minute
  handler
);
```

### Route-Level Namespacing

Use `routeKey` to isolate rate limits per route:

```typescript
app.post('/api/upload',
  rateLimit({ 
    points: 5, 
    duration: 60,
    routeKey: 'upload' // Separate limit for uploads
  }),
  handler
);
```

### Opting Out

To disable rate limiting for a specific route (not recommended):

```typescript
// In routes.config.ts
export const config = {
  middleware: {
    '*': ['requireAuth'], // rateLimit is still added automatically
    '/special-route': ['public'], // This gets only rateLimit (no auth)
  },
};
```

**Note**: Even with `'public'`, rate limiting is still applied for security.

## How It Works

1. **Identifier**: Uses `userId` if authenticated, otherwise IP address
2. **Storage**: PostgreSQL table (`rate_limits`) - automatically created
3. **Tracking**: Route-level namespacing prevents cross-route interference
4. **Response**: Returns `429 Too Many Requests` with `Retry-After` header

## Response Format

When rate limit is exceeded:

```json
{
  "error": "Too Many Requests",
  "retryAfter": 45
}
```

Headers:
```
Retry-After: 45
```

## Database Table

The `rate_limits` table is automatically created and managed by `rate-limiter-flexible`. See `RATE_LIMITS_TABLE.md` for details.

## Benefits

- ✅ **Distributed**: Works across multiple server instances
- ✅ **Persistent**: Survives server restarts
- ✅ **Memory Safe**: No memory leaks (database handles cleanup)
- ✅ **Automatic**: Enabled by default, no configuration needed
- ✅ **Flexible**: Can customize per route if needed
