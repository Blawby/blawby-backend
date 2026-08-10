import { checkCreateAllowed, checkRotateAllowed } from '../../scripts/provision-krabiclaw-oauth-client';
import { describe, expect, it } from 'vitest';

describe('checkCreateAllowed', () => {
  it('allows create when no client is configured yet', () => {
    expect(checkCreateAllowed(undefined)).toBeNull();
  });

  it('blocks duplicate creation when a client is already configured', () => {
    const message = checkCreateAllowed('existing-client-id');
    expect(message).not.toBeNull();
    expect(message).toContain('existing-client-id');
    expect(message).toContain('rotate');
  });
});

describe('checkRotateAllowed', () => {
  it('allows rotation when the target client-id matches the configured one', () => {
    expect(checkRotateAllowed('client-1', 'client-1')).toBeNull();
  });

  it('blocks rotation when no client is configured at all', () => {
    const message = checkRotateAllowed('client-1', undefined);
    expect(message).not.toBeNull();
    expect(message).toContain('not configured');
  });

  it('blocks rotation of a client-id that does not match the configured one', () => {
    const message = checkRotateAllowed('unrelated-client-id', 'client-1');
    expect(message).not.toBeNull();
    expect(message).toContain('unrelated-client-id');
    expect(message).toContain('client-1');
  });
});
