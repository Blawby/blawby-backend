import Cloudflare from 'cloudflare';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Proves, against the real (unmocked) `cloudflare` SDK, that an AbortSignal we
 * control — not the SDK's own `timeout` option — is what actually protects
 * against a response whose headers arrive promptly but whose body never
 * finishes. This is the exact gap krabiclaw-directory.service.ts's
 * `runFixedQuery` closes by passing `signal: AbortSignal.timeout(remaining)`.
 */

let server: Server | undefined = undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

const startStalledBodyServer = (): Promise<string> =>
  new Promise((resolve) => {
    server = createServer((_req, res) => {
      // Send headers immediately, then never write/end the body.
      res.writeHead(200, { 'content-type': 'application/json' });
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
});
