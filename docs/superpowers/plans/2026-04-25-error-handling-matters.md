# Error Handling Migration — `matters` Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the entire `matters` module from the `Result<T>` / `sendResult` pattern to throw-based error handling (`HTTPException` for expected failures, raw `Error` for 500s), and absorb the DELETE→204 handler changes for this module.

**Architecture:** Services return data directly and throw on failure. Handlers call services and return `c.json(data, status)` directly. `verifyMatterAccess` becomes `Promise<void>` — it throws instead of returning `Result<void>`. `logMatterActivity` becomes fire-and-forget (`Promise<void>`) — it swallows its own errors internally so callers never need to check its result. No `sendResult` calls remain in handlers after this plan.

**Tech Stack:** Hono + `@hono/zod-openapi`, TypeScript 5.9, `hono/http-exception`, `@casl/ability`

---

## File Map

| File | Change |
|------|--------|
| `src/modules/matters/services/matter-activity.service.ts` | `logMatterActivity` → `Promise<void>` (swallows errors); `getMatterActivity` → returns data directly |
| `src/modules/matters/services/matters.service.ts` | Remove `getForbiddenResult`; use `ForbiddenError.from().throwUnlessCan()`; all functions return data directly; `verifyMatterAccess` → `Promise<void>`; `deleteMatter` → `Promise<void>` |
| `src/modules/matters/services/matter-notes.service.ts` | Remove `if (!matterResult.success)` wrappers (now just `await verifyMatterAccess`); remove `activityResult` checks |
| `src/modules/matters/services/matter-time-entries.service.ts` | `getValidatedDuration` throws instead of returning `Result`; all functions return data directly |
| `src/modules/matters/services/matter-expenses.service.ts` | All functions return data directly; remove `Result<T>` returns |
| `src/modules/matters/services/matter-milestones.service.ts` | All functions return data directly; remove `Result<T>` returns |
| `src/modules/matters/services/matter-tasks.service.ts` | All functions return data directly; remove `Result<T>` returns |
| `src/modules/matters/handlers.ts` | Remove `sendResult` import; replace all `sendResult(c, result)` with direct `c.json(data, status)`; delete handlers → `c.body(null, 204)` |

---

## Task 1: Migrate `matter-activity.service.ts`

This is the shared dependency. Migrate it first so all subsequent tasks can drop `activityResult` checks.

**Files:**
- Modify: `src/modules/matters/services/matter-activity.service.ts`

- [ ] **Step 1: Replace `logMatterActivity` — make it fire-and-forget**

Replace the entire `logMatterActivity` function with:

```typescript
const logMatterActivity = async (
  params: {
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
    matterId?: string;
  },
  ctx: ServiceContext,
  tx?: NodePgDatabase<typeof schema>
): Promise<void> => {
  const matterId = params.matterId ?? ctx.matterId;

  if (!matterId) {
    logger.error('Failed to log activity: matterId is missing', {
      action: params.action,
      userId: ctx.userId,
    });
    return;
  }

  try {
    const client = tx ?? db;
    await client
      .insert(matterActivityLog)
      .values({
        matter_id: matterId,
        user_id: ctx.userId || null,
        action: params.action,
        description: params.description,
        metadata: params.metadata ?? null,
      });
  } catch (error) {
    logger.error('Failed to insert activity log for matter {matterId}: {error}', {
      matterId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
```

- [ ] **Step 2: Replace `getMatterActivity` — return data directly**

Replace the entire `getMatterActivity` function with:

```typescript
const getMatterActivity = async (
  options: MatterActivityListFilters | undefined,
  ctx: ServiceContext
): Promise<SelectMatterActivityLog[]> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  const { mattersService } = await import('@/modules/matters/services/matters.service');
  await mattersService.getMatterById(matterId, ctx);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  if (options?.activityId) {
    const [activity] = await db
      .select()
      .from(matterActivityLog)
      .where(and(eq(matterActivityLog.matter_id, matterId), eq(matterActivityLog.id, options.activityId)))
      .limit(1);
    return activity ? [activity] : [];
  }

  return db
    .select()
    .from(matterActivityLog)
    .where(eq(matterActivityLog.matter_id, matterId))
    .orderBy(desc(matterActivityLog.created_at))
    .limit(limit)
    .offset(offset);
};
```

- [ ] **Step 3: Remove unused imports**

Remove `import type { Result } from '@/shared/types/result'` and `import { ok, internalError } from '@/shared/utils/result'` from the top of the file.

- [ ] **Step 4: Commit**

```bash
git add src/modules/matters/services/matter-activity.service.ts
git commit -m "refactor(matters): migrate matter-activity service to throw-based error handling"
```

---

## Task 2: Migrate `matters.service.ts`

**Files:**
- Modify: `src/modules/matters/services/matters.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import type { PaginatedResult, Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
```

Add:
```typescript
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
```

(Note: `ForbiddenError` is already imported at line 7 — only add `HTTPException`.)

- [ ] **Step 2: Remove `getForbiddenResult` helper**

Delete the entire `getForbiddenResult` function (lines 37–47). It will be replaced by direct `ForbiddenError.from(ctx.ability).throwUnlessCan()` calls at each call site.

- [ ] **Step 3: Replace `createMatter`**

Change signature and body. Replace `return forbiddenResult` / `return result.badRequest(...)` / `return result.ok(...)` with throws:

```typescript
const createMatter = async (data: CreateMatterRequest, ctx: ServiceContext): Promise<MatterRecord> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Matter');

  const { assignee_ids, milestones, ...matterData } = data;

  if (data.client_id) {
    const client = await clientsRepository.findById(data.client_id);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid client_id or client does not belong to this organization' });
    }
  }

  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid practice_service_id or service does not belong to this organization' });
    }
  }

  return db.transaction(async (tx) => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const [newMatter] = await tx
      .insert(matters)
      .values({ organization_id: ctx.organizationId, ...dbData })
      .returning();

    if (assignee_ids && assignee_ids.length > 0) {
      await mattersQueries.addMatterAssignees(newMatter.id, assignee_ids, tx);
    }

    if (milestones && milestones.length > 0) {
      await matterMilestonesQueries.createMatterMilestones(
        milestones.map((milestone) => ({
          matter_id: newMatter.id,
          description: milestone.description,
          amount: milestone.amount,
          due_date: milestone.due_date,
          order: milestone.order,
          status: 'pending' as const,
        })),
        tx
      );
    }

    await matterActivityService.logMatterActivity(
      {
        matterId: newMatter.id,
        action: matterActivityService.ActivityAction.MATTER_CREATED,
        description: `Matter "${newMatter.title}" was created`,
        metadata: { billing_type: newMatter.billing_type, status: newMatter.status },
      },
      ctx,
      tx
    );

    await ctx.emit(
      MatterCreated,
      {
        matter_id: newMatter.id,
        organization_id: ctx.organizationId,
        title: newMatter.title,
        billing_type: newMatter.billing_type,
      },
      tx
    );

    return newMatter;
  });
};
```

- [ ] **Step 4: Replace `verifyMatterAccess`**

```typescript
const verifyMatterAccess = async (matterId: string, ctx: ServiceContext): Promise<void> => {
  const matter = await mattersQueries.findMatterById(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));
};
```

- [ ] **Step 5: Replace `getMatterById`**

```typescript
const getMatterById = async (matterId: string, ctx: ServiceContext): Promise<MatterRecord> => {
  const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!matter || matter.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Matter', matter));

  return {
    ...matter,
    assignees: matter.assignees.map((assignee) => ({
      ...assignee.user,
      name: assignee.user.name ?? '',
    })),
    client: matter.client
      ? { id: matter.client.id, name: matter.client.name ?? '', email: matter.client.email ?? '' }
      : null,
  };
};
```

- [ ] **Step 6: Replace `listMatters`**

```typescript
const listMatters = async (
  filters: ListMattersQuery,
  ctx: ServiceContext
): Promise<{ matters: MatterRecord[]; total: number }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  return mattersQueries.listMattersByOrganization(ctx.organizationId, {
    status: filters.status,
    practiceServiceId: filters.practice_service_id,
    clientId: filters.client_id,
    assigneeId: filters.assignee_id,
    search: filters.search,
    page: filters.page,
    limit: filters.limit,
  });
};
```

- [ ] **Step 7: Replace `updateMatter`**

```typescript
const updateMatter = async (
  matterId: string,
  data: UpdateMatterRequest,
  ctx: ServiceContext
): Promise<MatterRecord> => {
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', toSubject('Matter', existing));

  const { assignee_ids, ...matterData } = data;
  const existingRecord: Record<string, unknown> = { ...existing };
  const changedFields = Object.entries(matterData).reduce<string[]>((acc, [key, value]) => {
    if (value === undefined) return acc;
    const existingValue = existingRecord[key];
    const normalizedExisting = existingValue instanceof Date ? existingValue.toISOString() : existingValue;
    if (!isEqual(normalizedExisting, value)) acc.push(key);
    return acc;
  }, []);

  if (assignee_ids !== undefined) {
    const existingAssignees = Array.isArray(existing.assignees)
      ? existing.assignees.map((assignee) => assignee.user.id).filter(Boolean)
      : [];
    const normalizedExisting = [...existingAssignees].sort().join(',');
    const normalizedNext = [...assignee_ids].sort().join(',');
    if (normalizedExisting !== normalizedNext) changedFields.push('assignees');
  }

  if (data.client_id) {
    const client = await clientsRepository.findById(data.client_id);
    if (!client || client.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid client_id or client does not belong to this organization' });
    }
  }

  if (data.practice_service_id) {
    const service = await practiceServicesRepository.findById(data.practice_service_id);
    if (!service || service.organization_id !== ctx.organizationId) {
      throw new HTTPException(400, { message: 'Invalid practice_service_id or service does not belong to this organization' });
    }
  }

  const updated = await db.transaction(async (tx) => {
    const dbData = {
      ...matterData,
      open_date: matterData.open_date ? new Date(matterData.open_date) : undefined,
      close_date: matterData.close_date ? new Date(matterData.close_date) : undefined,
    };

    const result = await mattersQueries.updateMatter(matterId, dbData, tx);
    if (!result) {
      throw new HTTPException(500, { message: 'Failed to update matter' });
    }

    if (assignee_ids !== undefined) {
      await mattersQueries.clearMatterAssignees(matterId, tx);
      if (assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(matterId, assignee_ids, tx);
      }
    }

    const activityDescription = changedFields.length > 0
      ? `Matter "${result.title}" was updated (${changedFields.join(', ')})`
      : `Matter "${result.title}" update attempted (no changes)`;

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_UPDATED,
        description: activityDescription,
        metadata: { changes: matterData, changed_fields: changedFields },
      },
      ctx,
      tx
    );

    if (data.status && data.status !== existing.status) {
      await matterActivityService.logMatterActivity(
        {
          action: matterActivityService.ActivityAction.MATTER_STATUS_CHANGED,
          description: `Matter status changed from "${existing.status}" to "${data.status}"`,
          metadata: { oldStatus: existing.status, newStatus: data.status, changed_fields: ['status'] },
        },
        ctx,
        tx
      );

      let organizationName = 'Your Legal Team';
      try {
        const organization = await organizationRepository.findById(ctx.organizationId);
        if (organization) organizationName = organization.name;
      } catch (orgError) {
        logger.warn('Failed to fetch organization for matter status event enrichment: {error}', {
          organizationId: ctx.organizationId,
          error: orgError instanceof Error ? orgError.message : String(orgError),
        });
      }

      await ctx.emit(
        MatterStatusChanged,
        {
          matter_id: matterId,
          organization_id: ctx.organizationId,
          old_status: existing.status,
          new_status: data.status,
          matter_title: existing.title,
          organization_name: organizationName,
          client_email: existing.client?.email ?? existing.client?.user?.email ?? null,
          client_name: existing.client?.name ?? existing.client?.user?.name ?? null,
        },
        tx
      );
    }

    await ctx.emit(
      MatterUpdated,
      { matter_id: matterId, organization_id: ctx.organizationId, changes: { ...matterData } },
      tx
    );

    return result;
  });

  return updated;
};
```

- [ ] **Step 8: Replace `deleteMatter`**

```typescript
const deleteMatter = async (matterId: string, ctx: ServiceContext): Promise<void> => {
  const existing = await mattersQueries.findMatterByIdWithRelations(matterId);

  if (!existing || existing.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', toSubject('Matter', existing));

  await db.transaction(async (tx) => {
    const deleted = await mattersQueries.softDeleteMatter(matterId, ctx.userId, tx);
    if (!deleted) {
      throw new HTTPException(500, { message: 'Failed to delete matter' });
    }

    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MATTER_DELETED,
        description: `Matter "${deleted.title}" was deleted`,
        metadata: undefined,
      },
      ctx,
      tx
    );

    await ctx.emit(
      MatterDeleted,
      { matter_id: matterId, organization_id: ctx.organizationId },
      tx
    );
  });
};
```

- [ ] **Step 9: Replace `getMatterCounts`**

```typescript
const getMatterCounts = async (ctx: ServiceContext): Promise<Record<string, number>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const counts = await mattersQueries.getMatterCountsByStatus(ctx.organizationId);

  return counts.reduce<Record<string, number>>((acc, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {});
};
```

- [ ] **Step 10: Replace `getMatterUnbilled`**

```typescript
const getMatterUnbilled = async (matterId: string, ctx: ServiceContext): Promise<UnbilledMatterData> => {
  await verifyMatterAccess(matterId, ctx);

  const matter = await mattersQueries.findMatterById(matterId);
  if (!matter) {
    throw new HTTPException(404, { message: 'Matter not found' });
  }

  const [timeEntries, expenses, milestones, connectedAccount] = await Promise.all([
    matterTimeEntriesQueries.getUnbilled(matterId),
    matterExpensesQueries.getUnbilled(matterId),
    matterMilestonesQueries.listMatterMilestones(matterId),
    onboardingRepository.findByOrganizationId(ctx.organizationId),
  ]);

  const hourlyRate = matter.attorney_hourly_rate ?? matter.admin_hourly_rate ?? 0;

  return {
    time_entries: timeEntries.map((entry) => {
      const durationMinutes = Math.round(entry.duration / 60);
      return {
        id: entry.id,
        description: entry.description,
        duration_minutes: durationMinutes,
        hourly_rate: hourlyRate,
        total: Math.round((entry.duration / 3600) * hourlyRate),
        created_at: entry.created_at.toISOString(),
        user_id: entry.user_id ?? null,
      };
    }),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      created_at: expense.created_at.toISOString(),
    })),
    milestones: milestones
      .filter((m) => !m.invoiced_at && m.status !== 'paid')
      .map((milestone) => ({
        id: milestone.id,
        description: milestone.description,
        amount: milestone.amount,
        status: milestone.status,
        due_date: milestone.due_date ?? null,
        order: milestone.order,
      })),
    connected_account_id: connectedAccount?.id ?? null,
  };
};
```

- [ ] **Step 11: Commit**

```bash
git add src/modules/matters/services/matters.service.ts
git commit -m "refactor(matters): migrate matters service to throw-based error handling"
```

---

## Task 3: Migrate `matter-notes.service.ts`

This service is already partially migrated (throws `HTTPException` directly). The remaining work is removing `if (!matterResult.success)` wrappers now that `verifyMatterAccess` throws, and removing `activityResult` checks.

**Files:**
- Modify: `src/modules/matters/services/matter-notes.service.ts`

- [ ] **Step 1: Replace all `verifyMatterAccess` call sites**

In every function that has this pattern:
```typescript
const matterResult = await mattersService.verifyMatterAccess(matterId, ctx);
if (!matterResult.success) {
  throw new HTTPException(matterResult.error.status, { message: matterResult.error.message });
}
```

Replace with:
```typescript
await mattersService.verifyMatterAccess(matterId, ctx);
```

There are 4 such call sites (in `createMatterNote`, `listMatterNotes`, `updateMatterNote`, `deleteMatterNote`).

- [ ] **Step 2: Remove `activityResult` checks**

In every function that has this pattern:
```typescript
const activityResult = await matterActivityService.logMatterActivity(...);
if (!activityResult.success) {
  logger.error('...', { ..., error: activityResult.error.message });
}
```

Replace with:
```typescript
await matterActivityService.logMatterActivity(...);
```

There are 4 such call sites.

- [ ] **Step 3: Change `deleteMatterNote` return type to `Promise<void>`**

The function currently returns `Promise<{ success: true }>`. Change to `Promise<void>`:

```typescript
const deleteMatterNote = async (params: { noteId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) {
    throw new Error('Matter ID not found in context');
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');

  await mattersService.verifyMatterAccess(matterId, ctx);

  const note = await matterNotesQueries.findMatterNoteById(params.noteId);
  if (!note || note.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Note not found' });
  }

  await matterNotesQueries.deleteMatterNote(params.noteId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.NOTE_DELETED,
      description: `${userName} deleted a note`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};
```

- [ ] **Step 4: Replace raw `ctx.ability.cannot()` checks with `ForbiddenError.from()`**

In every function that has:
```typescript
if (ctx.ability.cannot('update', 'Matter')) {
  throw new HTTPException(403, { message: '...' });
}
```

Replace with:
```typescript
ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
```

- [ ] **Step 5: Add missing `ForbiddenError` import**

```typescript
import { ForbiddenError } from '@casl/ability';
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/matters/services/matter-notes.service.ts
git commit -m "refactor(matters): finish matter-notes service migration to throw-based error handling"
```

---

## Task 4: Migrate `matter-time-entries.service.ts`

**Files:**
- Modify: `src/modules/matters/services/matter-time-entries.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import type { Result } from '@/shared/types/result';
import { badRequest, ok, forbidden, internalError, notFound } from '@/shared/utils/result';
```

Add:
```typescript
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 2: Replace `getValidatedDuration` helper**

```typescript
const getValidatedDuration = (startTime: Date, endTime: Date): number => {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new HTTPException(400, { message: 'start_time and end_time must be valid dates' });
  }
  if (endTime <= startTime) {
    throw new HTTPException(400, { message: 'end_time must be after start_time' });
  }
  return calculateDuration(startTime, endTime);
};
```

- [ ] **Step 3: Replace `createMatterTimeEntry`**

```typescript
const createMatterTimeEntry = async (
  params: { data: CreateMatterTimeEntryRequest },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const startTime = new Date(params.data.start_time);
  const endTime = new Date(params.data.end_time);
  const duration = getValidatedDuration(startTime, endTime);

  const entry = await matterTimeEntriesQueries.createMatterTimeEntry({
    matter_id: matterId,
    user_id: ctx.userId,
    start_time: startTime,
    end_time: endTime,
    duration,
    description: params.data.description,
    billable: params.data.billable,
  });

  const changedFields = [
    'start_time', 'end_time', 'duration',
    ...(params.data.billable !== undefined ? ['billable'] : []),
    ...(params.data.description !== undefined ? ['description'] : []),
  ];

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_ADDED,
      description: `${userName} logged ${hours}h ${minutes}m${params.data.billable ? ' (billable)' : ''}`,
      metadata: { duration, billable: params.data.billable, changed_fields: changedFields },
    },
    ctx
  );

  return entry;
};
```

- [ ] **Step 4: Replace `listMatterTimeEntries`**

```typescript
const listMatterTimeEntries = async (
  params: { filters?: MatterTimeEntryListFilters },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.entryId) {
    const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.filters.entryId);
    if (!entry || entry.matter_id !== matterId) return [];
    return [entry];
  }

  return matterTimeEntriesQueries.listMatterTimeEntries(matterId, params.filters);
};
```

- [ ] **Step 5: Replace `updateMatterTimeEntry`**

```typescript
const updateMatterTimeEntry = async (
  params: { entryId: string; data: UpdateMatterTimeEntryRequest },
  ctx: ServiceContext
): Promise<SelectMatterTimeEntry> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.entryId);
  if (!entry || entry.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Time entry not found' });
  }

  const startTime = params.data.start_time ? new Date(params.data.start_time) : entry.start_time;
  const endTime = params.data.end_time ? new Date(params.data.end_time) : entry.end_time;
  let nextDuration: number | undefined;
  if (params.data.start_time !== undefined || params.data.end_time !== undefined) {
    nextDuration = getValidatedDuration(startTime, endTime);
  }

  const updateData: Parameters<typeof matterTimeEntriesQueries.updateMatterTimeEntry>[1] = {
    ...(params.data.start_time && { start_time: startTime }),
    ...(params.data.end_time && { end_time: endTime }),
    ...(params.data.description !== undefined && { description: params.data.description }),
    ...(params.data.billable !== undefined && { billable: params.data.billable }),
    ...(nextDuration !== undefined && { duration: nextDuration }),
  };

  const updated = await matterTimeEntriesQueries.updateMatterTimeEntry(params.entryId, updateData);
  if (!updated) throw new HTTPException(404, { message: 'Time entry not found' });

  const changedFields = [];
  if (params.data.start_time && entry.start_time.toISOString() !== startTime.toISOString()) changedFields.push('start_time');
  if (params.data.end_time && entry.end_time.toISOString() !== endTime.toISOString()) changedFields.push('end_time');
  if (params.data.description !== undefined && params.data.description !== entry.description) changedFields.push('description');
  if (params.data.billable !== undefined && params.data.billable !== entry.billable) changedFields.push('billable');
  if (nextDuration !== undefined && entry.duration !== nextDuration) changedFields.push('duration');

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_UPDATED,
      description: `${userName} updated a time entry`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  return updated;
};
```

- [ ] **Step 6: Replace `deleteMatterTimeEntry`**

```typescript
const deleteMatterTimeEntry = async (
  params: { entryId: string },
  ctx: ServiceContext
): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const entry = await matterTimeEntriesQueries.findMatterTimeEntryById(params.entryId);
  if (!entry || entry.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Time entry not found' });
  }

  await matterTimeEntriesQueries.deleteMatterTimeEntry(params.entryId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TIME_ENTRY_DELETED,
      description: `${userName} deleted a time entry`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};
```

- [ ] **Step 7: Replace `getTimeEntryStats`**

```typescript
const getTimeEntryStats = async (
  ctx: ServiceContext
): Promise<{
  totalBillableSeconds: number;
  totalSeconds: number;
  totalBillableHours: number;
  totalHours: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const totalBillable = await matterTimeEntriesQueries.getTotalBillableTime(matterId);
  const totalTime = await matterTimeEntriesQueries.getTotalTime(matterId);

  return {
    totalBillableSeconds: totalBillable,
    totalSeconds: totalTime,
    totalBillableHours: totalBillable / 3600,
    totalHours: totalTime / 3600,
  };
};
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/matters/services/matter-time-entries.service.ts
git commit -m "refactor(matters): migrate matter-time-entries service to throw-based error handling"
```

---

## Task 5: Migrate `matter-expenses.service.ts`

**Files:**
- Modify: `src/modules/matters/services/matter-expenses.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';
```

Add:
```typescript
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 2: Replace `createMatterExpense`**

```typescript
const createMatterExpense = async (
  params: { data: CreateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<SelectMatterExpense> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const expense = await matterExpensesQueries.createMatterExpense({
    matter_id: matterId,
    user_id: ctx.userId,
    description: params.data.description,
    amount: params.data.amount,
    date: params.data.date,
    billable: params.data.billable,
  });

  const amountFormatted = (params.data.amount / 100).toFixed(2);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_ADDED,
      description: `${userName} added expense: ${params.data.description} ($${amountFormatted})${params.data.billable ? ' (billable)' : ''}`,
      metadata: { amount: params.data.amount, billable: params.data.billable, changed_fields: ['description', 'amount', 'date', 'billable'] },
    },
    ctx
  );

  return expense;
};
```

- [ ] **Step 3: Replace `listMatterExpenses`**

```typescript
const listMatterExpenses = async (
  params: { filters?: MatterExpenseListFilters },
  ctx: ServiceContext
): Promise<SelectMatterExpense[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.expenseId) {
    const expense = await matterExpensesQueries.findMatterExpenseById(params.filters.expenseId);
    if (!expense || expense.matter_id !== matterId) return [];
    return [expense];
  }

  return matterExpensesQueries.listMatterExpenses(matterId, params.filters);
};
```

- [ ] **Step 4: Replace `updateMatterExpense`**

```typescript
const updateMatterExpense = async (
  params: { expenseId: string; data: UpdateMatterExpenseRequest },
  ctx: ServiceContext
): Promise<SelectMatterExpense> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const updated = await matterExpensesQueries.updateMatterExpense(params.expenseId, matterId, params.data);
  if (!updated) throw new HTTPException(404, { message: 'Expense not found' });

  const changedFields: string[] = [
    ...(params.data.description !== undefined ? ['description'] : []),
    ...(params.data.amount !== undefined ? ['amount'] : []),
    ...(params.data.date !== undefined ? ['date'] : []),
    ...(params.data.billable !== undefined ? ['billable'] : []),
  ];

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_UPDATED,
      description: `${userName} updated an expense`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  return updated;
};
```

- [ ] **Step 5: Replace `deleteMatterExpense`**

```typescript
const deleteMatterExpense = async (
  params: { expenseId: string },
  ctx: ServiceContext
): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const deleted = await matterExpensesQueries.deleteMatterExpense(params.expenseId, matterId);
  if (!deleted) throw new HTTPException(404, { message: 'Expense not found' });

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.EXPENSE_DELETED,
      description: `${userName} deleted an expense`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};
```

- [ ] **Step 6: Replace `getExpenseStats`**

```typescript
const getExpenseStats = async (
  ctx: ServiceContext
): Promise<{
  totalBillableCents: number;
  totalCents: number;
  totalBillable: number;
  total: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const totalBillable = await matterExpensesQueries.getTotalBillableExpenses(matterId);
  const totalExpenses = await matterExpensesQueries.getTotalExpenses(matterId);

  return {
    totalBillableCents: totalBillable,
    totalCents: totalExpenses,
    totalBillable: totalBillable / 100,
    total: totalExpenses / 100,
  };
};
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/matters/services/matter-expenses.service.ts
git commit -m "refactor(matters): migrate matter-expenses service to throw-based error handling"
```

---

## Task 6: Migrate `matter-milestones.service.ts`

**Files:**
- Modify: `src/modules/matters/services/matter-milestones.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound, forbidden } from '@/shared/utils/result';
```

Add:
```typescript
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 2: Replace `createMatterMilestone`**

```typescript
const createMatterMilestone = async (
  params: { data: CreateMatterMilestoneRequest },
  ctx: ServiceContext
): Promise<SelectMatterMilestone> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.createMatterMilestone({
    matter_id: matterId,
    description: params.data.description,
    amount: params.data.amount,
    due_date: params.data.due_date,
    status: params.data.status,
    order: params.data.order,
  });

  const amountFormatted = (params.data.amount / 100).toFixed(2);
  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_CREATED,
      description: `${userName} created milestone: ${params.data.description} ($${amountFormatted})`,
      metadata: { amount: params.data.amount, due_date: params.data.due_date, changed_fields: ['description', 'amount', 'due_date', 'status', 'order'] },
    },
    ctx
  );

  return milestone;
};
```

- [ ] **Step 3: Replace `listMatterMilestones`**

```typescript
const listMatterMilestones = async (
  params: { filters?: MatterMilestoneListFilters },
  ctx: ServiceContext
): Promise<SelectMatterMilestone[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  if (params.filters?.milestoneId) {
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.filters.milestoneId);
    if (!milestone || milestone.matter_id !== matterId) return [];
    return [milestone];
  }

  return matterMilestonesQueries.listMatterMilestones(matterId, params.filters);
};
```

- [ ] **Step 4: Replace `updateMatterMilestone`**

```typescript
const updateMatterMilestone = async (
  params: { milestoneId: string; data: UpdateMatterMilestoneRequest },
  ctx: ServiceContext
): Promise<SelectMatterMilestone> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
  if (!milestone || milestone.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Milestone not found' });
  }

  const updated = await matterMilestonesQueries.updateMatterMilestone(params.milestoneId, params.data);
  if (!updated) throw new HTTPException(500, { message: 'Failed to update milestone' });

  const changedFields: string[] = [];
  if (params.data.description !== undefined && params.data.description !== milestone.description) changedFields.push('description');
  if (params.data.amount !== undefined && params.data.amount !== milestone.amount) changedFields.push('amount');
  if (params.data.status !== undefined && params.data.status !== milestone.status) changedFields.push('status');
  if (params.data.order !== undefined && params.data.order !== milestone.order) changedFields.push('order');
  if (params.data.due_date !== undefined) {
    const nextDue = params.data.due_date ? new Date(params.data.due_date) : null;
    const currentDue = milestone.due_date ? new Date(milestone.due_date) : null;
    if (nextDue?.getTime() !== currentDue?.getTime()) changedFields.push('due_date');
  }

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
      description: `${userName} updated milestone: ${updated.description}`,
      metadata: { changed_fields: changedFields },
    },
    ctx
  );

  if (params.data.status === 'completed' && milestone.status !== 'completed') {
    await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.MILESTONE_COMPLETED,
        description: `${userName} completed milestone: ${milestone.description}`,
        metadata: { changed_fields: ['status'] },
      },
      ctx
    );
  }

  return updated;
};
```

- [ ] **Step 5: Replace `deleteMatterMilestone`**

```typescript
const deleteMatterMilestone = async (
  params: { milestoneId: string },
  ctx: ServiceContext
): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const milestone = await matterMilestonesQueries.findMatterMilestoneById(params.milestoneId);
  if (!milestone || milestone.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Milestone not found' });
  }

  await matterMilestonesQueries.deleteMatterMilestone(params.milestoneId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_DELETED,
      description: `${userName} deleted milestone: ${milestone.description}`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};
```

- [ ] **Step 6: Replace `reorderMilestones`**

```typescript
const reorderMilestones = async (
  params: { data: ReorderMilestonesRequest },
  ctx: ServiceContext
): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  for (const item of params.data.milestones) {
    const milestone = await matterMilestonesQueries.findMatterMilestoneById(item.id);
    if (!milestone || milestone.matter_id !== matterId) {
      throw new HTTPException(404, { message: `Milestone ${item.id} not found or does not belong to this matter` });
    }
  }

  await matterMilestonesQueries.reorderMilestones(params.data.milestones);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.MILESTONE_UPDATED,
      description: `${userName} reordered milestones`,
      metadata: { changed_fields: ['order'] },
    },
    ctx
  );
};
```

- [ ] **Step 7: Replace `getMilestoneStats`**

```typescript
const getMilestoneStats = async (
  ctx: ServiceContext
): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  totalAmount: number;
  completedAmount: number;
  completionPercentage: number;
}> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const stats = await matterMilestonesQueries.getMilestoneStats(matterId);

  return {
    ...stats,
    totalAmount: stats.totalAmount / 100,
    completedAmount: stats.completedAmount / 100,
    completionPercentage: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
  };
};
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/matters/services/matter-milestones.service.ts
git commit -m "refactor(matters): migrate matter-milestones service to throw-based error handling"
```

---

## Task 7: Migrate `matter-tasks.service.ts`

**Files:**
- Modify: `src/modules/matters/services/matter-tasks.service.ts`

- [ ] **Step 1: Replace imports**

Remove:
```typescript
import type { Result } from '@/shared/types/result';
import { ok, notFound, internalError, forbidden } from '@/shared/utils/result';
```

Add:
```typescript
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
```

- [ ] **Step 2: Replace `createMatterTask`**

```typescript
const createMatterTask = async (
  params: { matterId: string; data: CreateMatterTaskRequest },
  ctx: ServiceContext
): Promise<SelectMatterTask> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const createdTasks = await matterTasksQueries.createMatterTasks({
    ...params.data,
    matter_id: params.matterId,
  });

  if (!createdTasks || createdTasks.length === 0) {
    throw new HTTPException(500, { message: 'Failed to create matter task' });
  }

  const [createdTask] = createdTasks;

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  const assigneeInfo = params.data.assignee_id ? ` (assigned to user)` : '';
  const priorityInfo = params.data.priority !== 'normal' ? ` (${params.data.priority} priority)` : '';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TASK_CREATED,
      description: `${userName} created task: ${params.data.name}${assigneeInfo}${priorityInfo}`,
      metadata: {
        task_id: createdTask.id,
        assignee_id: params.data.assignee_id,
        priority: params.data.priority,
        stage: params.data.stage,
        changed_fields: Object.keys(params.data),
      },
    },
    ctx
  );

  return createdTask;
};
```

- [ ] **Step 3: Replace `listMatterTasks`**

```typescript
const listMatterTasks = async (
  params: { matterId: string; filters?: MatterTaskListFilters },
  ctx: ServiceContext
): Promise<SelectMatterTask[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  return matterTasksQueries.listMatterTasks(params.matterId, params.filters);
};
```

- [ ] **Step 4: Replace `updateMatterTask`**

```typescript
const updateMatterTask = async (
  params: { matterId: string; taskId: string; data: UpdateMatterTaskRequest },
  ctx: ServiceContext
): Promise<SelectMatterTask> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
  if (!existingTask || existingTask.matter_id !== params.matterId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const updatedTask = await matterTasksQueries.updateMatterTask(params.taskId, params.data);
  if (!updatedTask) throw new HTTPException(404, { message: 'Task not found' });

  const changedFields: string[] = [];
  if (params.data.name !== undefined && params.data.name !== existingTask.name) changedFields.push('name');
  if (params.data.description !== undefined && params.data.description !== existingTask.description) changedFields.push('description');
  if (params.data.assignee_id !== undefined && params.data.assignee_id !== existingTask.assignee_id) changedFields.push('assignee_id');
  if (params.data.status !== undefined && params.data.status !== existingTask.status) changedFields.push('status');
  if (params.data.priority !== undefined && params.data.priority !== existingTask.priority) changedFields.push('priority');
  if (params.data.stage !== undefined && params.data.stage !== existingTask.stage) changedFields.push('stage');
  if (params.data.due_date !== undefined) {
    const newDue = params.data.due_date ? new Date(params.data.due_date).toISOString().slice(0, 10) : null;
    const existingDue = existingTask.due_date ? new Date(existingTask.due_date).toISOString().slice(0, 10) : null;
    if (newDue !== existingDue) changedFields.push('due_date');
  }

  if (changedFields.length > 0) {
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    let description = `${userName} updated task: ${updatedTask.name}`;
    if (params.data.status && params.data.status !== existingTask.status) {
      description = params.data.status === 'complete'
        ? `${userName} completed task: ${updatedTask.name}`
        : `${userName} changed task status to ${params.data.status}: ${updatedTask.name}`;
    }

    const isCompletion = params.data.status !== undefined
      && existingTask.status !== params.data.status
      && params.data.status === 'complete'
      && updatedTask.status === 'complete';

    await matterActivityService.logMatterActivity(
      {
        action: isCompletion
          ? matterActivityService.ActivityAction.TASK_COMPLETED
          : matterActivityService.ActivityAction.TASK_UPDATED,
        description,
        metadata: { task_id: updatedTask.id, changed_fields: changedFields, old_status: existingTask.status, new_status: updatedTask.status },
      },
      ctx
    );
  }

  return updatedTask;
};
```

- [ ] **Step 5: Replace `deleteMatterTask`**

```typescript
const deleteMatterTask = async (
  params: { matterId: string; taskId: string },
  ctx: ServiceContext
): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
  if (!existingTask || existingTask.matter_id !== params.matterId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  await matterTasksQueries.deleteMatterTask(params.taskId);

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TASK_DELETED,
      description: `${userName} deleted task: ${existingTask.name}`,
      metadata: { task_id: params.taskId, task_name: existingTask.name, changed_fields: ['deleted'] },
    },
    ctx
  );
};
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/matters/services/matter-tasks.service.ts
git commit -m "refactor(matters): migrate matter-tasks service to throw-based error handling"
```

---

## Task 8: Update `handlers.ts`

**Files:**
- Modify: `src/modules/matters/handlers.ts`

- [ ] **Step 1: Remove `sendResult` import**

Remove this line:
```typescript
import { sendResult } from '@/shared/utils/responseUtils';
```

- [ ] **Step 2: Replace `createMatterHandler`**

```typescript
const createMatterHandler: AppRouteHandler<typeof matterRoutes.createMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const validatedBody = c.req.valid('json');
  const matter = await mattersService.createMatter(validatedBody, ctx);
  return c.json(matter, 201);
};
```

- [ ] **Step 3: Replace `listMattersHandler`**

```typescript
const listMattersHandler: AppRouteHandler<typeof matterRoutes.listMattersRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const query = c.req.valid('query');
  const page = parseInt(String(query.page ?? '1'), 10);
  const limit = parseInt(String(query.limit ?? '20'), 10);
  const data = await mattersService.listMatters({ ...query, page, limit }, ctx);
  return c.json(
    {
      matters: data.matters,
      total: data.total,
      page,
      limit,
      totalPages: Math.ceil(data.total / limit),
    },
    200
  );
};
```

- [ ] **Step 4: Replace `getMatterHandler`**

```typescript
const getMatterHandler: AppRouteHandler<typeof matterRoutes.getMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  const matter = await mattersService.getMatterById(id, ctx);
  return c.json({ matter }, 200);
};
```

- [ ] **Step 5: Replace `updateMatterHandler`**

```typescript
const updateMatterHandler: AppRouteHandler<typeof matterRoutes.updateMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const matter = await mattersService.updateMatter(id, validatedBody, ctx);
  return c.json(matter, 200);
};
```

- [ ] **Step 6: Replace `deleteMatterHandler` — 204**

```typescript
const deleteMatterHandler: AppRouteHandler<typeof matterRoutes.deleteMatterRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: id } = c.req.valid('param');
  await mattersService.deleteMatter(id, ctx);
  return c.body(null, 204);
};
```

- [ ] **Step 7: Replace `getMatterActivityHandler`**

```typescript
const getMatterActivityHandler: AppRouteHandler<typeof matterRoutes.getMatterActivityRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const activities = await matterActivityService.getMatterActivity(
    { limit: query.limit, offset: query.offset, activityId: query.activity_id },
    scopedCtx
  );
  return c.json({ activities }, 200);
};
```

- [ ] **Step 8: Replace time entry handlers**

```typescript
const listTimeEntriesHandler: AppRouteHandler<typeof matterRoutes.listTimeEntriesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const entries = await matterTimeEntriesService.listMatterTimeEntries(
    { filters: { billable: query.billable, startDate: query.start_date, endDate: query.end_date, entryId: query.entry_id } },
    scopedCtx
  );
  return c.json(entries, 200);
};

const createTimeEntryHandler: AppRouteHandler<typeof matterRoutes.createTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const entry = await matterTimeEntriesService.createMatterTimeEntry({ data: validatedBody }, scopedCtx);
  return c.json(entry, 201);
};

const updateTimeEntryHandler: AppRouteHandler<typeof matterRoutes.updateTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const entry = await matterTimeEntriesService.updateMatterTimeEntry({ entryId: entry_id, data: validatedBody }, scopedCtx);
  return c.json(entry, 200);
};

const deleteTimeEntryHandler: AppRouteHandler<typeof matterRoutes.deleteTimeEntryRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, entry_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterTimeEntriesService.deleteMatterTimeEntry({ entryId: entry_id }, scopedCtx);
  return c.body(null, 204);
};

const getTimeEntryStatsHandler: AppRouteHandler<typeof matterRoutes.getTimeEntryStatsRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const stats = await matterTimeEntriesService.getTimeEntryStats(scopedCtx);
  return c.json(stats, 200);
};
```

- [ ] **Step 9: Replace expense handlers**

```typescript
const listExpensesHandler: AppRouteHandler<typeof matterRoutes.listExpensesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const expenses = await matterExpensesService.listMatterExpenses(
    { filters: { billable: query.billable, startDate: query.start_date, endDate: query.end_date, expenseId: query.expense_id } },
    scopedCtx
  );
  return c.json(expenses, 200);
};

const createExpenseHandler: AppRouteHandler<typeof matterRoutes.createExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const expense = await matterExpensesService.createMatterExpense({ data: validatedBody }, scopedCtx);
  return c.json(expense, 201);
};

const updateExpenseHandler: AppRouteHandler<typeof matterRoutes.updateExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const expense = await matterExpensesService.updateMatterExpense({ expenseId: expense_id, data: validatedBody }, scopedCtx);
  return c.json(expense, 200);
};

const deleteExpenseHandler: AppRouteHandler<typeof matterRoutes.deleteExpenseRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, expense_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterExpensesService.deleteMatterExpense({ expenseId: expense_id }, scopedCtx);
  return c.body(null, 204);
};
```

- [ ] **Step 10: Replace milestone handlers**

```typescript
const listMilestonesHandler: AppRouteHandler<typeof matterRoutes.listMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const milestones = await matterMilestonesService.listMatterMilestones(
    { filters: { milestoneId: query.milestone_id } },
    scopedCtx
  );
  return c.json(milestones, 200);
};

const createMilestoneHandler: AppRouteHandler<typeof matterRoutes.createMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const milestone = await matterMilestonesService.createMatterMilestone(
    { data: { ...validatedBody, order: validatedBody.order ?? 0 } },
    scopedCtx
  );
  return c.json(milestone, 201);
};

const updateMilestoneHandler: AppRouteHandler<typeof matterRoutes.updateMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const milestone = await matterMilestonesService.updateMatterMilestone(
    { milestoneId: milestone_id, data: validatedBody },
    scopedCtx
  );
  return c.json(milestone, 200);
};

const deleteMilestoneHandler: AppRouteHandler<typeof matterRoutes.deleteMilestoneRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, milestone_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterMilestonesService.deleteMatterMilestone({ milestoneId: milestone_id }, scopedCtx);
  return c.body(null, 204);
};

const reorderMilestonesHandler: AppRouteHandler<typeof matterRoutes.reorderMilestonesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  await matterMilestonesService.reorderMilestones({ data: validatedBody }, scopedCtx);
  return c.body(null, 204);
};
```

- [ ] **Step 11: Replace note handlers**

```typescript
const listMatterNotesHandler: AppRouteHandler<typeof matterRoutes.listMatterNotesRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const query = c.req.valid('query');
  const notes = await matterNotesService.listMatterNotes({ filters: { noteId: query.note_id } }, scopedCtx);
  return c.json(notes, 200);
};

const createMatterNoteHandler: AppRouteHandler<typeof matterRoutes.createMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.createMatterNote({ data: validatedBody }, scopedCtx);
  return c.json(note, 201);
};

const updateMatterNoteHandler: AppRouteHandler<typeof matterRoutes.updateMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const validatedBody = c.req.valid('json');
  const note = await matterNotesService.updateMatterNote({ noteId: note_id, data: validatedBody }, scopedCtx);
  return c.json(note, 200);
};

const deleteMatterNoteHandler: AppRouteHandler<typeof matterRoutes.deleteMatterNoteRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, note_id } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  await matterNotesService.deleteMatterNote({ noteId: note_id }, scopedCtx);
  return c.body(null, 204);
};
```

- [ ] **Step 12: Replace task handlers**

```typescript
const listMatterTasksHandler: AppRouteHandler<typeof matterRoutes.listMatterTasksRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const query = c.req.valid('query');
  const filters: MatterTaskListFilters = {
    taskId: query.task_id,
    assigneeId: query.assignee_id,
    status: query.status,
    priority: query.priority,
    stage: query.stage,
  };
  const tasks = await matterTasksService.listMatterTasks({ matterId, filters }, ctx);
  return c.json({ tasks }, 200);
};

const createMatterTaskHandler: AppRouteHandler<typeof matterRoutes.createMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const task = await matterTasksService.createMatterTask({ matterId, data: validatedBody }, ctx);
  return c.json(task, 201);
};

const updateMatterTaskHandler: AppRouteHandler<typeof matterRoutes.updateMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, task_id: taskId } = c.req.valid('param');
  const validatedBody = c.req.valid('json');
  const task = await matterTasksService.updateMatterTask({ matterId, taskId, data: validatedBody }, ctx);
  return c.json(task, 200);
};

const deleteMatterTaskHandler: AppRouteHandler<typeof matterRoutes.deleteMatterTaskRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId, task_id: taskId } = c.req.valid('param');
  await matterTasksService.deleteMatterTask({ matterId, taskId }, ctx);
  return c.body(null, 204);
};
```

- [ ] **Step 13: Replace `getMatterUnbilledHandler`**

```typescript
const getMatterUnbilledHandler: AppRouteHandler<typeof matterRoutes.getMatterUnbilledRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { matter_id: matterId } = c.req.valid('param');
  const scopedCtx = { ...ctx, matterId };
  const unbilled = await mattersService.getMatterUnbilled(matterId, scopedCtx);
  return c.json(unbilled, 200);
};
```

- [ ] **Step 14: Remove `createServiceContext` import if unused**

Check if `createServiceContext` is still used anywhere in the file after previous steps. If not, remove it from the import on line 12.

- [ ] **Step 15: Commit**

```bash
git add src/modules/matters/handlers.ts
git commit -m "refactor(matters): migrate handlers to throw-based pattern, DELETE → 204"
```

---

## Task 9: Typecheck Gate

- [ ] **Step 1: Run typecheck**

```bash
pnpm run typecheck
```

Expected: zero errors. If errors appear, fix them before proceeding — do not skip.

- [ ] **Step 2: Run format check**

```bash
pnpm run format:check
```

If formatting errors appear, run `pnpm run format` then commit the diff.

- [ ] **Step 3: Final commit if format changes needed**

```bash
git add -p
git commit -m "style(matters): apply formatter after error handling migration"
```
