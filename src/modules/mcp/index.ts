import { Hono } from 'hono';
import { mcpHandler } from '@better-auth/oauth-provider';

import { config } from '@/shared/config';
import { handleMcpRequest } from '@/modules/mcp/server';

const baseUrl = config.app.baseUrl;
if (!baseUrl) {
  throw new Error('config.app.baseUrl is required for MCP authentication');
}

const mcpRequestHandler = mcpHandler(
  {
    jwksUrl: `${baseUrl}/api/auth/jwks`,
    verifyOptions: {
      issuer: `${baseUrl}/api/auth`,
      audience: `${baseUrl}/mcp`,
    },
  },
  (req, jwt) => handleMcpRequest(req, jwt)
);

const app = new Hono();

app.all('/', (c) => mcpRequestHandler(c.req.raw));
app.all('/*', (c) => mcpRequestHandler(c.req.raw));

export { app as mcpHttp };
