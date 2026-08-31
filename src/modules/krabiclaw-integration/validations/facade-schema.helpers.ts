import { z } from '@hono/zod-openapi';

/**
 * Strict facade DTO helpers (KTD5). Route files under this module must build
 * request schemas with these primitives instead of reusing an owning
 * schema, which may silently strip unknown identity fields (leaking a
 * caller-controlled value through) or expose fields KrabiClaw must not
 * control directly (R14).
 */

/**
 * KrabiClaw's D1-backed IDs are Better Auth's default generated IDs, not
 * UUIDs (see `krabiclaw-directory.service.ts`) — bounded canonical text,
 * not a UUID shape. 64 chars comfortably covers Better Auth's longest
 * generated ID formats while still bounding the header (R23).
 */
const MAX_CANONICAL_ID_LENGTH = 64;
const CANONICAL_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Bounded canonical-text KrabiClaw external ID (organization/actor) — never a UUID (R23). */
export const krabiclawExternalIdSchema = z
  .string()
  .min(1)
  .max(MAX_CANONICAL_ID_LENGTH)
  .regex(CANONICAL_ID_PATTERN, 'must be a bounded canonical KrabiClaw identifier');

/** The trusted request-reference header value — a UUID v4 (R5, R23, KTD6). */
export const krabiclawRequestReferenceSchema = z.uuidv4();

/** A local Blawby legal resource ID referenced in a facade path or body — a UUID (R23). */
export const krabiclawLocalResourceIdSchema = z.uuid();

/** The trusted originating-client-IP header value — a canonical IPv4 or IPv6 address, never a forwarding header (R27). */
export const krabiclawIpAddressSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * Facade request/response DTOs must never declare any of these fields —
 * KrabiClaw does not control local identity directly; the facade derives it
 * from the trusted header contract and D1 (R14). A route schema that needs
 * a *contact* email (e.g. a prospective client's email on an intake) is
 * fine — it is legal payload, not an identity-email field, so it is not on
 * this list.
 */
export const KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS = [
  'organizationId',
  'organization_id',
  'practiceId',
  'practice_id',
  'userId',
  'user_id',
  'slug',
  'identityEmail',
  'identity_email',
] as const;

/**
 * Build a strict (`.strict()`) facade DTO object schema and assert at
 * definition time that it never declares one of the forbidden identity
 * fields above. Prefer this over a bare `z.object(fields).strict()` for any
 * facade request/response body so a future field addition is caught in code
 * review or at module load, not by an integration test alone.
 *
 * Known limitation: this checks only the object's own top-level keys. A
 * forbidden field nested one level deep (e.g. inside a sub-object field)
 * passes through undetected — reviewers should still eyeball any nested
 * object shape a future route schema introduces.
 */
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- `ZodRawShape` is Zod's built-in type name, not a renameable local symbol.
export const krabiclawStrictSchema = <Fields extends z.ZodRawShape>(fields: Fields) => {
  const forbidden = KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS.filter((key) => key in fields);
  if (forbidden.length > 0) {
    throw new Error(
      `krabiclawStrictSchema: fields must not declare forbidden identity field(s): ${forbidden.join(', ')}`
    );
  }
  return z.object(fields).strict();
};
