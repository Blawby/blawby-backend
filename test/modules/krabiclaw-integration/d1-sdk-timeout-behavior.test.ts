import Cloudflare from 'cloudflare';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Proves, against the real (unmocked) `cloudflare` SDK, that an AbortSignal we
 * control — not the SDK's own `timeout` option — is what actually protects
 * against a response whose headers arrive promptly but whose body never
 * finishes. This is the exact gap krabiclaw-directory.service.ts's
 * `runFixedQuery` closes by passing `signal: AbortSignal.timeout(remaining)`.
 *
 * The SDK (`cloudflare@7.0.0`'s `fetchWithTimeout`) starts a `setTimeout` before
 * calling `fetch()` and clears it in a `finally` once `fetch()` resolves — and
 * `fetch()`/undici resolves as soon as response headers arrive, before the body
 * is read. So once headers are in, the `timeout` option's timer is already
 * cleared and cannot fire on the body — only a signal that stays armed through
 * body parsing (as `AbortSignal.timeout` does) can catch that failure mode.
 * Both tests below flush headers explicitly (`res.flushHeaders()`) so the
 * server-under-test actually reaches "headers sent, body stalled," rather than
 * a plain connection stall that would let either mechanism catch it for the
 * wrong reason.
 */

let server: Server | undefined = undefined;

afterEach(async () => {
  if (server) {
    // The timeout-only case below intentionally leaves its request hanging
    // past the assertion — force the socket closed rather than waiting on it.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

const startStalledBodyServer = (): Promise<string> =>
  new Promise((resolve) => {
    server = createServer((_req, res) => {
      // Send headers immediately, then never write/end the body.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.flushHeaders(); // force headers onto the wire now, not coalesced with a body write
      // Intentionally no res.end() — the connection stays open with a pending body.
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      if (typeof address !== 'object' || address === null) {
        throw new Error(`Expected server.address() to return AddressInfo, got: ${String(address)}`);
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

describe('cloudflare SDK timeout vs signal on a stalled response body', () => {
  it('an AbortSignal with a short deadline aborts a request whose body never arrives', async () => {
    const baseURL = await startStalledBodyServer();
    const client = new Cloudflare({ apiToken: 'test-token', baseURL, maxRetries: 0 });

    const start = Date.now();
    await expect(
      client.d1.database.query(
        'db-1',
        { account_id: 'account-1', sql: 'SELECT 1' },
        { maxRetries: 0, signal: AbortSignal.timeout(300) }
      )
    ).rejects.toThrow();
    const elapsed = Date.now() - start;

    // Should abort close to the 300ms deadline, not hang for the test's default timeout.
    expect(elapsed).toBeLessThan(2000);
  });

  it("the SDK's own timeout option alone does not abort a request whose body never arrives", async () => {
    const baseURL = await startStalledBodyServer();
    const client = new Cloudflare({ apiToken: 'test-token', baseURL, maxRetries: 0 });

    const STILL_PENDING = Symbol('still-pending');
    const outcome = await Promise.race([
      client.d1.database
        .query('db-1', { account_id: 'account-1', sql: 'SELECT 1' }, { maxRetries: 0, timeout: 300 })
        .then(() => 'resolved' as const)
        .catch(() => 'rejected' as const),
      new Promise((resolve) => setTimeout(() => resolve(STILL_PENDING), 1000)),
    ]);

    // A full second past the 300ms timeout option, the request has neither
    // resolved nor rejected — proving `timeout` alone does not cover the body.
    expect(outcome).toBe(STILL_PENDING);
  });
});
