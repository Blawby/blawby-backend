# Uploads: Shared Infrastructure Layer Design

**Date**: 2026-04-19
**Status**: Approved

> Historical note: references to legacy service response wrappers describe the old state. Current code should follow `AGENTS.md` and `docs/CODING_STANDARDS.md`: services return data directly and throw on failure.

## Problem

The current `src/modules/uploads/` is a full domain module with HTTP routes, services, and DB schema all co-located. This creates:

- Cross-module coupling — domain modules that need file uploads must import from `@/modules/uploads/`, violating the no-cross-module-import rule
- Upload context (`upload_context`, `entity_type`, `entity_id`) is baked into the presign step, coupling storage to domain concerns at the wrong layer
- Services use `Result<T>` pattern — violates the throw-based architecture standard
- No extensible pattern for new modules (intakes, clients) to own their file relationships

## Goal

Move uploads to a **platform layer** (`src/shared/uploads/`) that owns storage infrastructure (R2 operations, audit logging, DB schema) and exposes a thin HTTP surface registered directly in `hono-app.ts`. Domain modules own file-entity relationships independently via join tables and link endpoints.

## Architecture

### File Structure

```
src/
  shared/
    uploads/
      schema/
        uploads.schema.ts             # uploads table
        upload-audit-logs.schema.ts   # immutable audit trail
      queries/
        uploads.repository.ts
        audit-logs.repository.ts
      services/
        upload-core.service.ts        # public interface: presignUpload, confirmUpload, getDownloadUrl
        r2.service.ts                 # internal: raw R2 operations
        key-generator.service.ts      # internal: R2 key generation
        audit.service.ts              # internal: audit log writes
      types/
        uploads.types.ts
      http.ts                         # registers /api/uploads/* in hono-app.ts

  modules/
    matters/
      database/schema/
        matter-files.schema.ts        # matter_files join table
      routes/
        matter-files.routes.ts
      handlers/
        matter-files.handler.ts
      services/
        matter-files.service.ts

    practice-client-intakes/          # same pattern when needed
      database/schema/
        intake-files.schema.ts
      ...
```

`src/modules/uploads/` is **deleted entirely**.

### Registration

```typescript
// src/hono-app.ts
import { uploadsHttp } from '@/shared/uploads/http';
app.route('/api/uploads', uploadsHttp);
```

## API Endpoints

### Upload Infra (`src/shared/uploads/http.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/uploads/presign` | Generate presigned R2 URL, create pending record |
| `POST` | `/api/uploads/:id/confirm` | Verify file in R2, mark verified |
| `GET` | `/api/uploads/:id/download` | Short-lived download URL + audit log |
| `GET` | `/api/uploads/:id` | Upload metadata |
| `DELETE` | `/api/uploads/:id` | Soft delete with reason |
| `POST` | `/api/uploads/:id/restore` | Restore soft-deleted record |
| `GET` | `/api/uploads/:id/audit-log` | Immutable audit trail for upload |
| `GET` | `/api/uploads` | List uploads for org (with filters) |

### Domain Link Endpoints (per module)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/matters/:id/files` | Link confirmed upload to matter |
| `GET` | `/api/matters/:id/files` | List matter files |
| `DELETE` | `/api/matters/:id/files/:uploadId` | Unlink file from matter |

New modules follow the same pattern independently.

## Frontend Flow

```
1. POST /api/uploads/presign  →  { upload_id, presigned_url, method }
2. PUT  <presigned_url>        →  upload directly to R2 (frontend → Cloudflare)
3. POST /api/uploads/:id/confirm  →  { status: 'verified' }
4. POST /api/matters/:id/files { upload_id }  →  link to entity
```

Steps 1–3 are purely infrastructure. Step 4 is the domain concern.

## Presign Request (Simplified)

```typescript
{
  file_name: string       // e.g. "contract.pdf"
  file_size: number       // bytes
  mime_type: string       // e.g. "application/pdf"
  scope_type?: string     // 'matter' | 'intake' — for R2 key scoping only
  scope_id?: uuid         // the matter_id or intake_id
  is_privileged?: boolean // default true
}
```

`scope_type` + `scope_id` are for R2 key generation only — they do not establish a DB entity relationship.

## R2 Key Structure

```
with scope:    orgs/{org_id}/{scope_type}s/{scope_id}/uploads/{upload_id}_{filename}
without scope: orgs/{org_id}/uploads/{upload_id}_{filename}
```

Examples:
```
orgs/abc/matters/xyz/uploads/123_contract.pdf
orgs/abc/intakes/def/uploads/456_intake-form.pdf
orgs/abc/uploads/789_firm-logo.png
```

The key is stored in `uploads.storage_key` and never changes after creation.

## DB Schema Changes

### `uploads` table — columns removed

| Column | Reason |
|--------|--------|
| `upload_context` | Domain concern — removed |
| `entity_type` | Domain concern — removed |
| `entity_id` | Domain concern — removed |
| `matter_id` | Replaced by generic `scope_type` + `scope_id` |

### `uploads` table — columns added

```typescript
scope_type: varchar(50)   // 'matter' | 'intake' | null
scope_id:   uuid          // nullable — the scoped entity's ID
```

### `matter_files` join table (new — in matters module)

```typescript
matter_files {
  id:        uuid PK defaultRandom()
  matter_id: uuid FK → matters.id (cascade delete)
  upload_id: uuid FK → uploads.id (cascade delete)
  linked_by: uuid FK → users.id
  linked_at: timestamp withTimezone defaultNow()
  // unique(matter_id, upload_id)
}
```

New modules add their own join table following this exact pattern.

## Service Design (Deep Module)

One public interface hides all internal complexity:

```typescript
// src/shared/uploads/services/upload-core.service.ts
export const uploadCoreService = {
  presignUpload,    // generates R2 URL + creates DB record
  confirmUpload,    // verifies file in R2 + marks verified + builds public_url
  getDownloadUrl,   // generates presigned download URL + logs 'downloaded'
  getUpload,        // fetch metadata + update last_accessed
  listUploads,      // list uploads for org with filters
  softDelete,       // soft delete with reason + audit log
  restoreUpload,    // restore + audit log
  getAuditLogs,     // fetch immutable audit trail for an upload
};
```

`r2.service.ts`, `key-generator.service.ts`, and `audit.service.ts` are **internal only** — never imported outside `src/shared/uploads/`.

## Error Handling

All services throw — no `Result<T>`. Follows [plans/architectural-issues.md](../../../plans/architectural-issues.md) Issue #1.

```typescript
// Bad (current)
if (!bucket) return internalError('Storage config error');

// Good (new)
if (!bucket) throw createAppError('STORAGE_NOT_CONFIGURED', 'Storage configuration error', 500);

// Not found
throw createAppError('UPLOAD_NOT_FOUND', 'Upload not found', 404, { uploadId });

// Business rule violation
throw createValidationError('UPLOAD_NOT_VERIFIED', 'Upload must be confirmed before linking', { uploadId, status: upload.status });
```

## Transaction Ownership

Handlers own transactions. Services receive `ctx.db` and never open their own transactions.

```typescript
// handler
const confirmHandler = async (c) => {
  const ctx = getServiceContext(c);
  const result = await db.transaction(async (tx) => {
    return await uploadCoreService.confirmUpload({ id }, createServiceContext(ctx, tx));
  });
  return c.json(result, 200);
};

// service — no transaction awareness
const confirmUpload = async ({ id }, ctx) => {
  const upload = await uploadsRepository.findById(id, ctx.db);
  if (!upload) throw createAppError('UPLOAD_NOT_FOUND', 'Upload not found', 404, { id });
  // ...
  await uploadsRepository.update(id, { status: 'verified' }, ctx.db);
  await auditService.log({ upload_id: id, action: 'confirmed' }, ctx.db);
  return upload;
};
```

## Extensibility Pattern

Any new module that needs file uploads:

1. Creates `{module}/database/schema/{module}-files.schema.ts` (join table)
2. Creates `{module}/services/{module}-files.service.ts` — imports from `@/shared/uploads/` to validate upload exists and is verified
3. Adds link routes + handlers
4. Zero changes to `src/shared/uploads/`

## Cloudflare Images (Profile Pictures)

The current system routes `upload_context: 'profile'` to Cloudflare Images instead of R2. This behaviour is preserved:

- `scope_type: 'profile'` at presign time → routes to CF Images (`POST` method, no key)
- CF Images returns an `imageId` stored as `storage_key`
- No R2 key generated for profile uploads
- `key-generator.service.ts` returns `null` for profile scope; `r2.service.ts` is skipped
- `upload-core.service.ts` internally branches on `scope_type === 'profile'` to pick the right storage backend

This is the only case where the storage backend is not R2. Everything else (documents, intakes, trust, firm assets) uses R2.

## Migration Notes

- Existing `uploads` table rows: `upload_context`/`entity_type`/`entity_id` data can be migrated to `scope_type`/`scope_id` where applicable, or nulled out
- `matter_id` values migrate to `scope_type: 'matter'`, `scope_id: <matter_id>`
- Existing `src/modules/uploads/` is deleted after migration complete
- `src/shared/router/modules.generated.ts` — uploads entry removed (no longer auto-discovered)
