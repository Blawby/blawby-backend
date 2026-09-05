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
const krabiclawExternalIdSchema = z
  .string()
  .min(1)
  .max(MAX_CANONICAL_ID_LENGTH)
  .regex(CANONICAL_ID_PATTERN, 'must be a bounded canonical KrabiClaw identifier');

/** The trusted request-reference header value — a UUID v4 (R5, R23, KTD6). */
const krabiclawRequestReferenceSchema = z.uuidv4();

/** A local Blawby legal resource ID referenced in a facade path or body — a UUID (R23). */
const krabiclawLocalResourceIdSchema = z.uuid();

/** The trusted originating-client-IP header value — a canonical IPv4 or IPv6 address, never a forwarding header (R27). */
const krabiclawIpAddressSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * Facade request/response DTOs must never declare any of these fields —
 * KrabiClaw does not control local identity directly; the facade derives it
 * from the trusted header contract and D1 (R14). A route schema that needs
 * a *contact* email (e.g. a prospective client's email on an intake) is
 * fine — it is legal payload, not an identity-email field, so it is not on
 * this list.
 */
const KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS = [
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
const krabiclawStrictSchema = <Fields extends z.ZodRawShape>(fields: Fields) => {
  const forbidden = KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS.filter((key) => key in fields);
  if (forbidden.length > 0) {
    throw new Error(
      `krabiclawStrictSchema: fields must not declare forbidden identity field(s): ${forbidden.join(', ')}`
    );
  }
  return z.object(fields).strict();
};

/**
 * Documents the trusted header contract every facade route requires (KTD2's route-scoped
 * middleware, not this schema, is what actually enforces it at request time — see
 * `parseFacadeHeaders`/`verifyFacadeToken`). `@hono/zod-openapi` installs this as a genuine
 * `zValidator("header", ...)` alongside the route's other validators, but per that library's own
 * composition order (`this.on(method, path, ...middleware, ...validators, handler)`),
 * `createKrabiClawFacadeRouteMiddleware` — which includes the imperative header check — always
 * runs first; this schema can only re-confirm what that check already accepted, never reject a
 * request the imperative check would have allowed, since it reuses the exact same schema objects.
 */
const krabiclawFacadeHeaderFields = {
  authorization: z
    .string()
    .regex(/^[Bb]earer\s+\S+$/)
    .openapi({ description: 'Bearer token: Authorization: Bearer <facade-scoped access token>' }),
  'x-krabiclaw-organization-id': krabiclawExternalIdSchema.openapi({
    description: "The caller-verified KrabiClaw organization's external ID",
  }),
  'x-krabiclaw-actor-id': krabiclawExternalIdSchema.openapi({
    description: "The caller-verified acting user's external ID",
  }),
  'x-krabiclaw-actor-kind': z.enum(['human', 'anonymous']).openapi({
    description: 'Whether the acting caller is a verified human or a Better Auth anonymous actor',
  }),
};

/** Header contract for a route with `requestReferencePolicy: 'none'` — no request-reference header. */
const krabiclawFacadeHeadersSchema = z.object(krabiclawFacadeHeaderFields);

/**
 * Header contract for `updateEngagementContractStatusRoute` — the sole route with
 * `acceptsOriginatingClientIp: true` (R27). The header is optional here (only the `accepted`
 * status action ever reads it) and rejected on every other route (`assertOriginatingClientIpPolicy`).
 */
const krabiclawFacadeHeadersWithOriginatingIpSchema = z.object({
  ...krabiclawFacadeHeaderFields,
  'x-krabiclaw-originating-client-ip': krabiclawIpAddressSchema.optional().openapi({
    description: "The caller-verified originating client's trusted IP address (accept/decline status action only)",
  }),
});

/**
 * Header contract for a route with `requestReferencePolicy: 'required'` — adds the trusted,
 * caller-supplied idempotency/correlation reference (`assertRequestReferencePolicy` rejects the
 * request at runtime if this header is absent for such a route).
 */
const krabiclawFacadeHeadersWithRequestReferenceSchema = z.object({
  ...krabiclawFacadeHeaderFields,
  'x-krabiclaw-request-reference': krabiclawRequestReferenceSchema.openapi({
    description: 'Caller-supplied idempotency/correlation reference for this request',
  }),
});

export {
  krabiclawExternalIdSchema,
  krabiclawRequestReferenceSchema,
  krabiclawLocalResourceIdSchema,
  krabiclawIpAddressSchema,
  KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS,
  krabiclawStrictSchema,
  krabiclawFacadeHeadersSchema,
  krabiclawFacadeHeadersWithOriginatingIpSchema,
  krabiclawFacadeHeadersWithRequestReferenceSchema,
};
