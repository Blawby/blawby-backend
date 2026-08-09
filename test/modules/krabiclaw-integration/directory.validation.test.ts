import {
  organizationDirectoryRowSchema,
  userDirectoryRowSchema,
} from '@/modules/krabiclaw-integration/validations/directory.validation';
import { describe, expect, it } from 'vitest';

describe('organizationDirectoryRowSchema', () => {
  it('parses a valid row', () => {
    const result = organizationDirectoryRowSchema.parse({ id: 'org-1', name: 'Acme Legal', slug: 'acme-legal' });
    expect(result).toEqual({ id: 'org-1', name: 'Acme Legal', slug: 'acme-legal' });
  });

  it('rejects a row missing slug', () => {
    expect(() => organizationDirectoryRowSchema.parse({ id: 'org-1', name: 'Acme Legal' })).toThrow();
  });

  it('rejects a row with a non-string id', () => {
    expect(() => organizationDirectoryRowSchema.parse({ id: 1, name: 'Acme Legal', slug: 'acme-legal' })).toThrow();
  });

  it('rejects extra unexpected fields', () => {
    expect(() =>
      organizationDirectoryRowSchema.parse({ id: 'org-1', name: 'Acme Legal', slug: 'acme-legal', metadata: '{}' })
    ).toThrow();
  });
});

describe('userDirectoryRowSchema', () => {
  it('parses a valid row', () => {
    const result = userDirectoryRowSchema.parse({ id: 'user-1', name: 'Jane Roe', email: 'jane@example.com' });
    expect(result).toEqual({ id: 'user-1', name: 'Jane Roe', email: 'jane@example.com' });
  });

  it('rejects a row with a malformed email', () => {
    expect(() =>
      userDirectoryRowSchema.parse({ id: 'user-1', name: 'Jane Roe', email: 'not-an-email' })
    ).toThrow();
  });

  it('rejects a row missing name', () => {
    expect(() => userDirectoryRowSchema.parse({ id: 'user-1', email: 'jane@example.com' })).toThrow();
  });
});
