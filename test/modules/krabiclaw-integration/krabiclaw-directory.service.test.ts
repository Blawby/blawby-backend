// oxlint-disable-next-line no-namespace
import type * as CloudflareModule from 'cloudflare';
import { AuthenticationError, InternalServerError, RateLimitError } from 'cloudflare';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('cloudflare', async () => {
  const actual = await vi.importActual<typeof CloudflareModule>('cloudflare');
  // Must be a plain function expression, not an arrow function — `new MockedCloudflare()`
  // Requires a real [[Construct]], which arrow functions don't have.
  // oxlint-disable-next-line eslint/prefer-arrow-callback
  const MockedCloudflare = vi.fn().mockImplementation(function MockedCloudflare() {
    return { d1: { database: { query: mocks.query } } };
  });
  // Preserve the real static error-class properties (Cloudflare.RateLimitError, etc.)
  // On the mocked constructor so `instanceof` checks in the code under test still work.
  Object.assign(MockedCloudflare, actual.default);
  return {
    ...actual,
    default: MockedCloudflare,
  };
});

vi.mock('@/shared/config', () => ({
  config: {
    krabiclaw: {
      d1AccountId: 'account-1',
      d1DatabaseId: 'db-1',
      d1ApiToken: 'token-1',
    },
  },
}));

const okOrgRow = { id: 'org-1', name: 'Acme Legal', slug: 'acme-legal' };
const okUserRow = { id: 'user-1', name: 'Jane Roe', email: 'jane@example.com' };

const pageWith = (results: unknown[], metaOverrides: Record<string, unknown> = {}) => ({
  result: [{ success: true, results, meta: { rows_written: 0, changed_db: false, ...metaOverrides } }],
});

// Must be a function declaration, not a const arrow — TypeScript's assertion-function
// Narrowing (TS2775) only works reliably through a function declaration's stable,
// Hoisted binding; a const-arrow assertion function fails to narrow at call sites.
// oxlint-disable-next-line eslint/func-style
function assertIsError(value: unknown): asserts value is Error {
  expect(value).toBeInstanceOf(Error);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('krabiclawDirectoryService', () => {
  it('returns the organization directory record for a valid single-row response', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([okOrgRow]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).resolves.toEqual(okOrgRow);
    // Vitest's asymmetric matchers (objectContaining/stringContaining/any) are typed `any`
    // By design — they must be assignable into any expected shape. Safe here; not a real leak.
    expect(mocks.query).toHaveBeenCalledWith(
      'db-1',
      expect.objectContaining({
        account_id: 'account-1',
        // oxlint-disable-next-line typescript/no-unsafe-assignment
        sql: expect.stringContaining('FROM organization'),
        params: ['org-1'],
      }),
      // oxlint-disable-next-line typescript/no-unsafe-assignment
      expect.objectContaining({ maxRetries: 0, signal: expect.any(AbortSignal) })
    );
  });

  it('returns the user directory record for a valid single-row response', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([okUserRow]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getUserDirectoryRecord('user-1')).resolves.toEqual(okUserRow);
    expect(mocks.query).toHaveBeenCalledWith(
      'db-1',
      // oxlint-disable-next-line typescript/no-unsafe-assignment
      expect.objectContaining({ sql: expect.stringContaining('FROM user'), params: ['user-1'] }),
      expect.anything()
    );
  });

  it('rejects when the organization is missing (zero rows)', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('missing-org')).rejects.toThrow();
  });

  it('never includes the raw external id in a thrown error message', async () => {
    const distinctiveOrgId = 'org-should-never-appear-in-logs-or-errors';
    mocks.query.mockResolvedValueOnce(pageWith([]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    let caught: unknown = undefined;
    try {
      await krabiclawDirectoryService.getOrganizationDirectoryRecord(distinctiveOrgId);
    } catch (error) {
      caught = error;
    }
    assertIsError(caught);
    expect(caught.message).not.toContain(distinctiveOrgId);
  });

  it('rejects when D1 unexpectedly returns duplicate rows for one id', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([okOrgRow, { ...okOrgRow, id: 'org-1-dupe' }]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
  });

  it('rejects a malformed row (fails Zod validation)', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([{ id: 'org-1', name: 'Acme Legal' }]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
  });

  it('rejects a response with unexpected-write metadata even if the row is otherwise valid', async () => {
    mocks.query.mockResolvedValueOnce(pageWith([okOrgRow], { rows_written: 1, changed_db: true }));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
  });

  it('wraps a D1 failure in a stable public error, preserving the original SDK error as its cause', async () => {
    const sdkError = new AuthenticationError(401, {}, 'unauthorized', new Headers());
    mocks.query.mockRejectedValueOnce(sdkError);
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    let caught: unknown = undefined;
    try {
      await krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1');
    } catch (error) {
      caught = error;
    }
    assertIsError(caught);
    expect(caught.message).toBe('D1 organization lookup failed');
    expect(caught.cause).toBe(sdkError);
  });

  it('does not retry an unauthorized (401) error', async () => {
    mocks.query.mockRejectedValueOnce(new AuthenticationError(401, {}, 'unauthorized', new Headers()));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once on a 429, then succeeds', async () => {
    mocks.query
      .mockRejectedValueOnce(new RateLimitError(429, {}, 'rate limited', new Headers()))
      .mockResolvedValueOnce(pageWith([okOrgRow]));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).resolves.toEqual(okOrgRow);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('retries at most once on repeated 5xx errors, then rejects', async () => {
    mocks.query.mockRejectedValue(new InternalServerError(500, {}, 'server error', new Headers()));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('rejects when D1 credentials are not configured', async () => {
    vi.doMock('@/shared/config', () => ({ config: { krabiclaw: {} } }));
    vi.resetModules();
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not retry a retryable error once the 3-second budget is already exhausted', async () => {
    vi.doMock('@/shared/config', () => ({
      config: { krabiclaw: { d1AccountId: 'account-1', d1DatabaseId: 'db-1', d1ApiToken: 'token-1' } },
    }));
    vi.resetModules();
    vi.useFakeTimers();
    try {
      mocks.query.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(3001);
        throw new RateLimitError(429, {}, 'rate limited', new Headers());
      });
      const { krabiclawDirectoryService } =
        await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

      await expect(krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1')).rejects.toThrow();
      expect(mocks.query).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never includes the configured D1 API token in a thrown error message across every failure path', async () => {
    const secretToken = 'super-secret-d1-token-value';
    vi.doMock('@/shared/config', () => ({
      config: { krabiclaw: { d1AccountId: 'account-1', d1DatabaseId: 'db-1', d1ApiToken: secretToken } },
    }));
    vi.resetModules();
    mocks.query.mockRejectedValue(new InternalServerError(500, {}, 'server error', new Headers()));
    const { krabiclawDirectoryService } =
      await import('@/modules/krabiclaw-integration/services/krabiclaw-directory.service');

    let caught: unknown = undefined;
    try {
      await krabiclawDirectoryService.getOrganizationDirectoryRecord('org-1');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(String(caught instanceof Error ? caught.message : caught)).not.toContain(secretToken);
  });
});
