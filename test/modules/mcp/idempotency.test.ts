import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config', () => ({
  config: { mcp: { idempotencySalt: 'test-salt' } },
}));

import {
  canonicalJsonStringify,
  deriveHighRiskIdempotencyKey,
  deriveIdempotencyKey,
} from '@/modules/mcp/idempotency';

describe('canonicalJsonStringify', () => {
  it('produces identical output regardless of key order', () => {
    const a = canonicalJsonStringify({ a: 1, b: 2 });
    const b = canonicalJsonStringify({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('sorts nested object keys too', () => {
    const a = canonicalJsonStringify({ outer: { z: 1, a: 2 } });
    const b = canonicalJsonStringify({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('preserves array order (arrays are not sorted)', () => {
    expect(canonicalJsonStringify([1, 2, 3])).not.toBe(canonicalJsonStringify([3, 2, 1]));
  });
});

describe('deriveIdempotencyKey', () => {
  const baseInputs = { toolName: 'send_invoice', organizationId: 'org_1', userId: 'user_1', params: { invoice_id: 'inv_1' } };

  it('is deterministic for identical inputs', async () => {
    const a = await deriveIdempotencyKey(baseInputs);
    const b = await deriveIdempotencyKey(baseInputs);
    expect(a).toBe(b);
  });

  it('is unaffected by param key order', async () => {
    const a = await deriveIdempotencyKey({ ...baseInputs, params: { invoice_id: 'inv_1', note: 'x' } });
    const b = await deriveIdempotencyKey({ ...baseInputs, params: { note: 'x', invoice_id: 'inv_1' } });
    expect(a).toBe(b);
  });

  it('changes when the tool name changes', async () => {
    const a = await deriveIdempotencyKey(baseInputs);
    const b = await deriveIdempotencyKey({ ...baseInputs, toolName: 'void_invoice' });
    expect(a).not.toBe(b);
  });

  it('changes when the organization changes', async () => {
    const a = await deriveIdempotencyKey(baseInputs);
    const b = await deriveIdempotencyKey({ ...baseInputs, organizationId: 'org_2' });
    expect(a).not.toBe(b);
  });

  it('changes when params change', async () => {
    const a = await deriveIdempotencyKey(baseInputs);
    const b = await deriveIdempotencyKey({ ...baseInputs, params: { invoice_id: 'inv_2' } });
    expect(a).not.toBe(b);
  });
});

describe('deriveHighRiskIdempotencyKey', () => {
  const baseInputs = { toolName: 'send_invoice', organizationId: 'org_1', userId: 'user_1', params: { invoice_id: 'inv_1' } };

  it('is identical for two calls within the same 60s bucket', async () => {
    const t0 = Date.parse('2026-01-01T00:00:05.000Z');
    const t1 = Date.parse('2026-01-01T00:00:55.000Z');
    const a = await deriveHighRiskIdempotencyKey(baseInputs, t0);
    const b = await deriveHighRiskIdempotencyKey(baseInputs, t1);
    expect(a).toBe(b);
  });

  it('differs once the bucket rolls over', async () => {
    const t0 = Date.parse('2026-01-01T00:00:05.000Z');
    const t1 = Date.parse('2026-01-01T00:01:05.000Z');
    const a = await deriveHighRiskIdempotencyKey(baseInputs, t0);
    const b = await deriveHighRiskIdempotencyKey(baseInputs, t1);
    expect(a).not.toBe(b);
  });
});
