import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';

import {
  KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS,
  krabiclawExternalIdSchema,
  krabiclawIpAddressSchema,
  krabiclawLocalResourceIdSchema,
  krabiclawRequestReferenceSchema,
  krabiclawStrictSchema,
} from '@/modules/krabiclaw-integration/validations/facade-schema.helpers';

describe('krabiclawExternalIdSchema', () => {
  it('accepts a bounded canonical-text ID', () => {
    expect(krabiclawExternalIdSchema.safeParse('org_2p8qsF1s0LKzAxYzR9WvQ').success).toBe(true);
  });

  it('accepts a UUID-shaped value like any other 36-char string over the pattern — canonical text is not UUID-restricted', () => {
    // Canonical-text IDs deliberately are NOT the UUID validator — a UUID happens to match the canonical pattern too.
    expect(krabiclawExternalIdSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(krabiclawExternalIdSchema.safeParse('').success).toBe(false);
  });

  it('rejects a value over 64 characters', () => {
    expect(krabiclawExternalIdSchema.safeParse('x'.repeat(65)).success).toBe(false);
  });

  it('rejects control characters and disallowed punctuation', () => {
    expect(krabiclawExternalIdSchema.safeParse('org 1').success).toBe(false);
    expect(krabiclawExternalIdSchema.safeParse('org!1').success).toBe(false);
  });
});

describe('krabiclawRequestReferenceSchema', () => {
  it('accepts a UUID v4', () => {
    expect(krabiclawRequestReferenceSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });

  it('rejects a bounded canonical-text ID (not a UUID)', () => {
    expect(krabiclawRequestReferenceSchema.safeParse('org_2p8qsF1s0LKzAxYzR9WvQ').success).toBe(false);
  });
});

describe('krabiclawLocalResourceIdSchema', () => {
  it('accepts a UUID', () => {
    expect(krabiclawLocalResourceIdSchema.safeParse('11111111-1111-1111-8111-111111111111').success).toBe(true);
  });

  it('rejects a bounded canonical-text KrabiClaw external ID (not a UUID)', () => {
    expect(krabiclawLocalResourceIdSchema.safeParse('org_2p8qsF1s0LKzAxYzR9WvQ').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(krabiclawLocalResourceIdSchema.safeParse('').success).toBe(false);
  });
});

describe('krabiclawIpAddressSchema', () => {
  it('accepts a canonical IPv4 address', () => {
    expect(krabiclawIpAddressSchema.safeParse('203.0.113.7').success).toBe(true);
  });

  it('accepts a canonical IPv6 address', () => {
    expect(krabiclawIpAddressSchema.safeParse('2001:db8::1').success).toBe(true);
  });

  it('rejects a forwarded-for style comma-separated list', () => {
    expect(krabiclawIpAddressSchema.safeParse('203.0.113.7, 10.0.0.1').success).toBe(false);
  });
});

describe('krabiclawStrictSchema', () => {
  it('accepts a contact email field — legal payload, not an identity-email field (R14)', () => {
    const schema = krabiclawStrictSchema({ contactEmail: z.email() });
    expect(schema.safeParse({ contactEmail: 'client@example.test' }).success).toBe(true);
  });

  it('rejects an unknown field the shape does not declare (.strict())', () => {
    const schema = krabiclawStrictSchema({ contactEmail: z.email() });
    expect(schema.safeParse({ contactEmail: 'client@example.test', extra: 'nope' }).success).toBe(false);
  });

  it.each(KRABICLAW_FORBIDDEN_IDENTITY_FIELD_KEYS)(
    'throws at definition time if the shape declares the forbidden identity field "%s"',
    (forbiddenKey) => {
      expect(() => krabiclawStrictSchema({ [forbiddenKey]: z.string() })).toThrow(
        /must not declare forbidden identity field/
      );
    }
  );

  it('throws at definition time listing every forbidden field declared, not just the first', () => {
    expect(() =>
      krabiclawStrictSchema({
        organizationId: z.string(),
        slug: z.string(),
        contactEmail: z.email(),
      })
    ).toThrow(/organizationId.*slug|slug.*organizationId/);
  });
});
