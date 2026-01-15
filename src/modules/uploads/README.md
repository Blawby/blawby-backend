# Uploads Module

## Purpose

Provides **ABA/IOLTA-oriented** file upload workflows with:
- **Direct frontend uploads** to Cloudflare **R2** (documents) and Cloudflare **Images** (profile pictures).
- **Matter-based segregation** for legal files.
- **Audit logging** (who did what, when).
- **Retention metadata** and **soft delete** with reason.

This module follows the pattern used by other modules (`http.ts` + `routes.ts` OpenAPI + handlers + services + repositories).

## Storage Model

### Providers
- **R2**: legal documents, intakes, trust-accounting files, firm assets.
- **Cloudflare Images**: profile images (optimized delivery).

### R2 Key Structure (ABA/IOLTA)

Keys are generated server-side and embedded in the presigned URL. The frontend cannot change the destination key without invalidating the signature.

```
orgs/{org_id}/matters/{matter_id}/{documents|correspondence|evidence}/{upload_id}_{filename}
orgs/{org_id}/intakes/{intake_id}/{upload_id}_{filename}
orgs/{org_id}/trust-accounting/{yyyy}/{mm}/{upload_id}_{filename}
orgs/{org_id}/firm-assets/{upload_id}_{filename}
users/{user_id}/profile/{upload_id}_{filename}
```

Implementation: `src/modules/uploads/services/uploads.service.ts` (`generateStorageKey`).

## Data Model

### Tables
- `uploads`: main upload record with metadata + compliance fields.
- `upload_audit_logs`: immutable audit trail of actions.

Files:
- `src/modules/uploads/database/schema/uploads.schema.ts`
- `src/modules/uploads/database/schema/upload-audit-logs.schema.ts`

### Compliance Fields (high level)
- `matter_id`, `upload_context`: ensure segregation and allow filtering.
- `is_privileged`: mark attorney-client privileged content.
- `retention_until`: retention metadata (enforcement can be added via worker/job).
- `deleted_at`, `deleted_by`, `deletion_reason`: soft delete with justification.

## API

All routes are mounted under `/api/uploads` (module name `uploads`).

### Endpoints
- `POST /api/uploads/presign`
  - Returns a presigned upload URL (R2 `PUT`) or Images direct upload URL (Images `POST`).
- `POST /api/uploads/:id/confirm`
  - Verifies the object exists (R2) and marks upload as `verified`.
- `GET /api/uploads/:id`
  - Returns upload metadata and updates `last_accessed_*`.
- `GET /api/uploads/:id/download`
  - Returns a short-lived download URL (R2 presigned URL) and logs `downloaded`.
- `GET /api/uploads`
  - Lists uploads for the active organization with optional filters.
- `DELETE /api/uploads/:id`
  - Soft delete with reason; logs `deleted`.
- `POST /api/uploads/:id/restore`
  - Restores soft-deleted record; logs `restored`.
- `GET /api/uploads/:id/audit-log`
  - Returns audit log entries for the upload.

OpenAPI routes: `src/modules/uploads/routes.ts`
HTTP wiring: `src/modules/uploads/http.ts`

## Frontend Flow (Direct Upload)

1. **Presign**
   - Frontend calls `POST /api/uploads/presign` with file metadata + context (e.g. `upload_context: "matter"`, `matter_id`, `sub_context`).
2. **Upload**
   - Frontend uploads directly to the returned URL.
   - R2 flow uses `PUT` with `Content-Type` set to the provided `mime_type`.
3. **Confirm**
   - Frontend calls `POST /api/uploads/:id/confirm`.
   - Backend verifies existence and marks the record `verified`.
4. **Download**
   - Frontend calls `GET /api/uploads/:id/download` to obtain a short-lived URL and produce an audit trail.

## Environment Variables

### R2
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_R2_PUBLIC_URL` (optional; used to build a public URL for R2 objects)

### Images
- `CLOUDFLARE_IMAGES_API_TOKEN`
- `CLOUDFLARE_IMAGES_ACCOUNT_HASH`

## Notes / Follow-ups

- **Retention enforcement**: currently stored as metadata; enforcing deletion/review can be implemented as a scheduled job/worker.
- **User names in audit logs**: current handler returns `user_name: null`; joining users can be added if/when needed.

