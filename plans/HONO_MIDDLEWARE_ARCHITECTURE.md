# Hono Middleware Architecture Documentation

## Overview

This document outlines the middleware architecture implemented for the Hono-based API, including authentication, error handling, and module-level middleware management.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Middleware System](#middleware-system)
3. [Authentication Flow](#authentication-flow)
4. [Error Handling](#error-handling)
5. [Module Router System](#module-router-system)
6. [Middleware Types](#middleware-types)
7. [Configuration](#configuration)
8. [Best Practices](#best-practices)
9. [Recent Simplifications](#recent-simplifications)

## Architecture Overview

The middleware system follows a layered approach with clear separation of concerns:

```
Request → Global Middleware → Module Middleware → Route Handler → Response
```

### Key Components

- **Global Middleware**: Applied to all routes (logging, CORS, auth context)
- **Module Middleware**: Applied to specific module routes (authentication, authorization)
- **Route Middleware**: Applied to individual routes (validation, throttling)
- **Error Handling**: Centralized error processing and response formatting

## Middleware System

### 1. Global Middleware Stack

Applied in `src/hono-app.ts`:

```typescript
// Order matters - applied in sequence
app.use('*', logger());           // 1. Request logging
app.use('*', cors());            // 2. CORS handling
app.use('*', responseMiddleware()); // 3. Response handling & error catching
```

### 2. Module-Level Middleware

Applied via `src/shared/router/module-router.ts`:

```typescript
// Applied to specific module paths
app.use('/api/practice/*', requireAuth());    // Practice module protection
app.use('/api/onboarding/*', requireAuth());  // Onboarding module protection
app.use('/api/public/*', publicMiddleware()); // Public module (no-op)
```

### 3. Route-Level Middleware

Applied directly in route definitions:

```typescript
// Individual route middleware
practiceApp.post('/', validateJson(schema), handler);
```

## Authentication Flow

### 1. Module-Level Auth Middleware (`src/shared/middleware/requireAuth.ts`)

**Purpose**: Blocks unauthenticated requests to protected routes.

**Flow**:
```typescript
export const requireAuth = (): MiddlewareHandler => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({
        error: 'Unauthorized',
        message: 'Authentication required'
      }, 401);
    }

    return next();
  };
};
```

**Key Features**:
- ✅ **Simple & Clean**: Single responsibility
- ✅ **Consistent Response**: Standardized 401 format
- ✅ **Context Aware**: Uses data from Better Auth integration

### 2. Better Auth Integration

**Purpose**: Handles authentication via Better Auth library.

**Flow**:
```typescript
// Better Auth routes are handled directly
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return authInstance.handler(c.req.raw);
});

// Session endpoint for testing auth
app.get('/api/session', (c) => {
  const session = c.get('session');
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({
    session,
    user,
    userId: c.get('userId'),
    activeOrganizationId: c.get('activeOrganizationId'),
  });
});
```

**Key Features**:
- ✅ **Better Auth Integration**: Uses Better Auth for session management
- ✅ **Context Setting**: Provides user data to all routes
- ✅ **Session Management**: Handles authentication state

## Error Handling

### 1. Response Middleware (`src/lib/hono/response-utils.ts`)

**Purpose**: Centralized error handling and response formatting.

**Flow**:
```typescript
export const responseMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    c.set('requestId', requestId);
    c.set('startTime', startTime);

    try {
      await next();

      // Log successful requests
      const responseTime = Date.now() - startTime;
      c.set('responseTime', responseTime);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ ${c.req.method} ${c.req.url} - ${responseTime}ms`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error instanceof HTTPException) {
        // Handle known HTTP exceptions
        logError(error, { /* context */ });
        return error.getResponse();
      }

      // Handle Better Auth errors specifically
      if (error?.status === 'UNAUTHORIZED') {
        return c.json({
          error: 'Unauthorized',
          message: 'Authentication required',
          requestId,
        }, 401);
      }

      // Handle unexpected errors
      logError(error, { /* context */ });
      return c.json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        requestId,
      }, 500);
    }
  };
};
```

**Key Features**:
- ✅ **Request Tracking**: Generates unique request IDs
- ✅ **Performance Monitoring**: Tracks response times
- ✅ **Error Classification**: Handles different error types
- ✅ **Consistent Format**: Standardized error responses

## Module Router System

### 1. Auto-Discovery (`src/shared/router/module-router.ts`)

**Purpose**: Automatically discovers and mounts module routes with middleware.

**Flow**:
```typescript
export async function registerModuleRoutes(app: AppType): Promise<void> {
  // 1. Auto-discover modules
  const moduleConfigs = await getModuleConfigurations();

  for (const config of moduleConfigs) {
    // 2. Import module app
    const moduleApp = await import(`@/modules/${config.name}/http`);

    // 3. Apply middleware to main app (not sub-app)
    if (config.middleware?.length > 0) {
      for (const middlewareConfig of config.middleware) {
        const middleware = await resolveMiddleware(middlewareConfig);
        app.use(`${mountPath}/*`, middleware); // Key: Apply to main app
      }
    }

    // 4. Mount the module
    app.route(mountPath, moduleApp.default);
  }
}
```

**Key Insight**: Middleware must be applied to the main app with path patterns, not to sub-apps.

### 2. Middleware Resolution

**Purpose**: Converts string-based middleware names to actual middleware functions.

**Flow**:
```typescript
async function resolveMiddleware(config: MiddlewareConfig): Promise<MiddlewareHandler> {
  await loadMiddleware(); // Lazy load middleware functions

  switch (config) {
    case 'auth': return requireAuth();
    case 'guest': return requireGuest();
    case 'admin': return requireAdmin();
    case 'throttle': return throttle(60);
    case 'public': return async (c, next) => next();
    default: return config; // Custom middleware function
  }
}
```

### 3. Module Configuration

Each module can define its middleware in `src/modules/{module}/config.ts`:

```typescript
// src/modules/practice/config.ts
export const config = {
  middleware: ['auth'], // Protected by default
};

// src/modules/public/config.ts
export const config = {
  middleware: [], // Public routes
};

// src/modules/admin/config.ts
export const config = {
  middleware: ['auth', 'admin'], // Multiple middleware
  prefix: 'admin', // Custom prefix
};
```

## Middleware Types

### 1. Authentication Middleware

| Middleware | Purpose | Behavior |
|------------|---------|----------|
| `auth` | Global auth context | Sets user data, never blocks |
| `requireAuth` | Route protection | Blocks unauthenticated requests |
| `requireGuest` | Guest-only routes | Blocks authenticated users |
| `requireAdmin` | Admin-only routes | Requires admin role |

### 2. Utility Middleware

| Middleware | Purpose | Behavior |
|------------|---------|----------|
| `throttle` | Rate limiting | Limits requests per minute |
| `public` | Public routes | No-op middleware |
| `logger` | Request logging | Logs requests and responses |
| `cors` | CORS handling | Handles cross-origin requests |

### 3. Custom Middleware

Custom middleware functions can be passed directly:

```typescript
const customMiddleware = async (c, next) => {
  // Custom logic
  return next();
};

// Usage in module config
export const config = {
  middleware: ['auth', customMiddleware],
};
```

## Configuration

### 1. Module-Level Configuration

**File**: `src/modules/{module}/config.ts`

```typescript
export const config = {
  middleware: ['auth'],           // Middleware to apply
  prefix: 'v1',                  // Optional route prefix
};
```

**Default Behavior**:
- No config file → `middleware: ['auth']` (protected)
- `public` module → `middleware: []` (public)
- Other modules → `middleware: ['auth']` (protected)

### 2. Route-Level Configuration

**File**: `src/modules/{module}/http.ts`

```typescript
// Module-level middleware (applied to all routes)
practiceApp.use('*', requireAuth());

// Route-level middleware (applied to specific routes)
practiceApp.post('/', throttle(30), zValidator('json', schema), handler);
```

### 3. Global Configuration

**File**: `src/hono-app.ts`

```typescript
// Global middleware stack
app.use('*', logger());
app.use('*', cors());
app.use('*', auth());
app.use('*', responseMiddleware());
```

## Best Practices

### 1. Middleware Order

**Critical**: Order matters in middleware stacks.

```typescript
// ✅ Correct order
app.use('*', logger());           // 1. Log first
app.use('*', cors());            // 2. Handle CORS
app.use('*', auth());            // 3. Set auth context
app.use('*', responseMiddleware()); // 4. Handle responses/errors

// ❌ Wrong order
app.use('*', auth());            // Auth before CORS can cause issues
app.use('*', logger());          // Logging after auth misses auth errors
```

### 2. Error Handling

**Pattern**: Catch errors at the appropriate level.

```typescript
// ✅ Global error handling
app.use('*', responseMiddleware()); // Catches all unhandled errors

// ✅ Specific error handling
try {
  await someOperation();
} catch (error) {
  throw responseErrors.badRequest('Operation failed');
}
```

### 3. Middleware Application

**Pattern**: Apply middleware to main app, not sub-apps.

```typescript
// ✅ Correct: Apply to main app with path pattern
app.use('/api/practice/*', requireAuth());
app.route('/api/practice', practiceApp);

// ❌ Wrong: Apply to sub-app (doesn't work)
practiceApp.use('*', requireAuth());
app.route('/api/practice', practiceApp);
```

### 4. Context Usage

**Pattern**: Use context for data passing between middleware.

```typescript
// ✅ Set context in middleware
c.set('user', user);
c.set('requestId', requestId);

// ✅ Use context in handlers
const user = c.get('user');
const requestId = c.get('requestId');
```

### 5. Error Responses

**Pattern**: Use consistent error response format.

```typescript
// ✅ Consistent format
return c.json({
  error: 'Unauthorized',
  message: 'Authentication required',
  requestId: c.get('requestId'),
}, 401);

// ❌ Inconsistent format
return c.text('Unauthorized', 401);
```

## Troubleshooting

### Common Issues

1. **Middleware Not Executing**
   - **Cause**: Applied to sub-app instead of main app
   - **Fix**: Use `app.use('/path/*', middleware)` instead of `subApp.use('*', middleware)`

2. **500 Errors Instead of 401**
   - **Cause**: Better Auth errors not handled properly
   - **Fix**: Add specific handling for `error.status === 'UNAUTHORIZED'`

3. **Middleware Order Issues**
   - **Cause**: Wrong middleware order
   - **Fix**: Ensure global middleware runs before module middleware

4. **Context Not Available**
   - **Cause**: Middleware not setting context properly
   - **Fix**: Ensure context is set in global auth middleware

### Debugging Tips

1. **Add Temporary Logging**:
   ```typescript
   console.log('Middleware executed:', { path: c.req.path, user: c.get('user') });
   ```

2. **Check Middleware Order**:
   ```typescript
   console.log('Middleware stack:', app.middleware);
   ```

3. **Verify Context**:
   ```typescript
   console.log('Context variables:', c.get('user'), c.get('requestId'));
   ```

## Recent Simplifications

### 1. Removed OpenAPI/Swagger Complexity

**What was removed**:
- `@hono/zod-openapi` package
- `@hono/swagger-ui` package
- `hono-openapi` package
- Manual OpenAPI route definitions
- Swagger UI endpoints

**Why**: The OpenAPI generation was adding unnecessary complexity for a simple API. Manual documentation is more maintainable.

### 2. Simplified Event System

**What was fixed**:
- Fixed circular dependency in event publishing
- Removed duplicate event publishing
- Simplified event consumer to listen to all event types

**Before**: Events were published twice for the same action
**After**: Single event per business operation

### 3. Streamlined Onboarding Service

**What was simplified**:
- Removed session storage in database
- Eliminated session cleanup/expiration logic
- Removed unnecessary `/sessions` endpoint
- Simplified connected accounts service

**Benefits**:
- ✅ **Stateless sessions**: Created on-demand by Stripe
- ✅ **Simpler database**: No sessions table needed
- ✅ **Less complexity**: No session management logic
- ✅ **Better performance**: No database writes for sessions

### 4. Single Responsibility Functions

**What was refactored**:
- Split `createOrGetAccount()` into focused functions:
  - `findAccountByOrganization()` - Only finds accounts
  - `createStripeAccount()` - Only creates accounts
  - `createOnboardingSessionForAccount()` - Only creates sessions
  - `createOrGetAccount()` - Orchestrates the flow

**Benefits**:
- ✅ **Testable**: Each function can be tested independently
- ✅ **Reusable**: Functions can be used in different combinations
- ✅ **Maintainable**: Changes to one responsibility don't affect others

## Conclusion

The middleware architecture provides:

- ✅ **Clean Separation**: Global, module, and route-level middleware
- ✅ **Flexible Configuration**: String-based middleware names with custom functions
- ✅ **Robust Error Handling**: Centralized error processing
- ✅ **Auto-Discovery**: Automatic module registration
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Performance**: Efficient middleware execution
- ✅ **Simplified Architecture**: Removed unnecessary complexity
- ✅ **Single Responsibility**: Each function has one clear purpose

This architecture scales well and provides a solid foundation for building complex APIs with Hono, while maintaining simplicity and maintainability.
