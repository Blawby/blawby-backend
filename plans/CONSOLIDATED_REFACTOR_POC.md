# Refactoring & Authorization Plan (CASL + Clean Architecture)

> **Focus:** Replace ad-hoc logic with structured CASL authorization and reusable utilities.
> **POC Module:** `preferences` (Target: ~50% code reduction)
> **Timeline:** 2-3 Days for POC, then rollout to other modules.

---

## Objectives

1.  **Authorization:** Replace scattered `if (role === 'admin')` checks with centralized **CASL** (Attribute-Based Access Control).
2.  **Clean Code:** Reduce boilerplate by 40-50% using Route Builder, Global Error Handling, and `ctx.emit()`.
3.  **Safety:** Strict ownership checks (e.g., "Clients can only edit *their* intakes") impossible to bypass.

---

## Phase 1: CASL Authorization Foundation

### 1.1 Install Dependencies
```bash
npm install @casl/ability
```

### 1.2 Define Abilities
File: `src/shared/auth/abilities.ts`

### 1.3 Inject Ability Middleware
File: `src/shared/middleware/inject-ability.ts`

---

## Phase 2: Refactoring Utilities

### 2.1 Route Builder (Composable)
File: `src/shared/router/route-builder.ts`

Reduces OpenAPI boilerplate (50 lines -> 10 lines). Auto-injects standard error responses (400, 401, 403, 404, 500).

```typescript
const build = (config: RouteConfig) => {
  const standardResponses = { 400: {...}, 401: {...}, 403: {...}, 404: {...}, 500: {...} };
  return createRoute({ ...config, responses: { ...standardResponses, ...config.responses } });
};

export const routeBuilder = { build };
```

### 2.2 Service Context with `ctx.emit()`
File: `src/shared/types/service-context.ts`

Standardizes arguments passed to services. Includes Segment-style event dispatch.

```typescript
export type ServiceContext = {
  userId: string;
  organizationId: string;
  memberRole: string | null;
  ability: AppAbility;
  emit: <T>(event: EventClass<T>, payload: T, tx?: Transaction) => Promise<string>;
};

export const getServiceContext = (c: Context): ServiceContext => {
  const userId = c.get('userId');
  const organizationId = c.req.param('organization_id') || c.get('activeOrganizationId');

  return {
    userId,
    organizationId,
    memberRole: c.get('memberRole'),
    ability: c.get('ability'),
    emit: (event, payload, tx) =>
      event.dispatch(payload, { actorId: userId, organizationId, tx }),
  };
};
```

### 2.3 Global Error Handler (replaces `withServiceError`)
File: `src/shared/middleware/errorHandler.ts`

**No more `withServiceError` wrappers.** Services just throw. One global handler catches everything.

#### Before (wrapper in every service method):
```typescript
const createMatter = async (data: CreateMatterRequest, ctx: ServiceContext) =>
  withServiceError(async () => {    // extra async nesting, ugly
    ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');
    // ... business logic
    return result.ok(matter);
  }, { logger, operation: 'create matter' });
```

#### After (pure service, no wrapper):
```typescript
const createMatter = async (data: CreateMatterRequest, ctx: ServiceContext) => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');
  // ... business logic
  return result.ok(matter);
};
```

#### Global error handler catches all thrown errors:
```typescript
import { ForbiddenError } from '@casl/ability';

export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();

  // CASL ForbiddenError -> 403
  if (error instanceof ForbiddenError) {
    return c.json({ error: 'FORBIDDEN', message: error.message, request_id: requestId }, 403);
  }

  // Everything else -> 500 (existing logic)
  const appError = error as Partial<AppError>;
  const status = appError.status || 500;
  logger.error('Unexpected error: {message}', { message: error.message, error, requestId });

  return c.json({
    error: appError.code || 'INTERNAL_SERVER_ERROR',
    message: status === 500 ? 'An unexpected error occurred' : error.message,
    request_id: requestId,
  }, status);
};
```

**Impact:** Eliminates `withServiceError` from every service method across the entire codebase. Services become pure business logic with zero error-handling boilerplate.

---

## Phase 3: POC - Refactor `preferences` Module

### 3.1 The Clean Service Layer
File: `src/modules/preferences/services/preferences.service.ts`

```typescript
// Pure business logic — no wrappers, no try/catch
const getPreferences = async (ctx: ServiceContext): Promise<Result<Preferences>> => {
  const prefs = await db.select().from(preferences).where(eq(preferences.user_id, ctx.userId)).limit(1);
  if (!prefs[0]) throw new Error('Preferences not found');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'OrganizationPreferences');

  return ok({ ...prefs[0], notifications: applyNotificationDefaults(prefs[0].notifications) });
};
```

### 3.2 The Minimal Handler
File: `src/modules/preferences/handlers.ts`

```typescript
const updateCategoryPreferences = async (c: Context) => {
  const ctx = getServiceContext(c);
  const category = c.req.param('category') as PreferenceCategory;
  const validatedBody = c.get('validatedBody');
  const result = await preferencesService.updatePreferencesByCategory(category, validatedBody, ctx);
  return response.fromResult(c, result);
};

export const preferencesHandlers = { getAllPreferences, getCategoryPreferences, updateCategoryPreferences };
```

### 3.3 The Concise Routes
File: `src/modules/preferences/routes.ts`

```typescript
export const updateCategoryPreferencesRoute = routeBuilder.build({
  method: 'put',
  path: '/{category}',
  tags: ['Preferences'],
  summary: 'Update preferences by category',
  security: [{ Bearer: [] }],
  request: { params: categoryParamSchema, body: { content: { 'application/json': { schema: bodySchema } } } },
  responses: { 200: { description: 'Updated', content: { 'application/json': { schema: responseSchema } } } },
});
```

---

## Phase 4: Segment-Style Event Dispatch (`ctx.emit`)

### 4.1 The Problem (59 call sites)

```typescript
// BEFORE: 10 lines, manual context threading
await MatterCreated.dispatch(
  {
    matter_id: newMatter.id,
    organization_id: organizationId,
    title: newMatter.title,
    billing_type: newMatter.billing_type,
  },
  { tx, actorId: user.id, organizationId },
);
```

### 4.2 The Solution

```typescript
// AFTER: 1 line — like analytics.track()
await ctx.emit(MatterCreated, { matter_id: newMatter.id, title: newMatter.title, billing_type: newMatter.billing_type }, tx);
```

- `actorId` -> auto-injected from `ctx.userId`
- `organizationId` -> auto-injected from `ctx.organizationId`
- `tx` -> optional third arg (only inside transactions)
- Payload = **domain data only**, no plumbing

### 4.3 Impact

| Metric | Before | After |
|---|---|---|
| Call sites | 59 | 59 |
| Lines per dispatch | 8-12 | 1 |
| Total lines saved | ~400-500 | -- |
| Manual context threading | Every call | Zero |

---

## Phase 5: Verification & Testing

### 5.1 Unit Testing CASL Rules
File: `test/unit/abilities.test.ts`

```typescript
describe('Abilities', () => {
  it('allows owner to manage everything', () => {
    const ability = defineAbilityFor('owner', { userId: 'u1' });
    expect(ability.can('manage', 'all')).toBe(true);
  });

  it('denies client from reading org preferences', () => {
    const ability = defineAbilityFor('client', { userId: 'u2' });
    expect(ability.can('read', 'OrganizationPreferences')).toBe(false);
  });

  it('allows client to read OWN intake', () => {
    const ability = defineAbilityFor('client', { userId: 'u2' });
    const myIntake = { metadata: { user_id: 'u2' } };
    expect(ability.can('read', subject('PracticeClientIntake', myIntake))).toBe(true);
  });
});
```

---

## Summary: What Each Utility Replaces

| Utility | Replaces | Lines saved per use |
|---|---|---|
| `getServiceContext(c)` | Manual `c.get('user')`, `c.get('userId')`, `c.req.header()` | 3-5 |
| `routeBuilder.build()` | Repeated 400/401/403/404/500 error schemas | 20-30 |
| Global `errorHandler` | `withServiceError` wrapper in every service | 5-8 |
| `ctx.emit()` | Verbose `Event.dispatch()` with manual context | 8-12 |
| CASL `throwUnlessCan()` | Ad-hoc `getFullOrganization()` + role checks | 5-10 |

## Cleanup

- Delete `src/shared/utils/service-wrapper.ts` after all services migrated
- Remove all `withServiceError` imports across codebase
