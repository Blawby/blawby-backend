import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { toolRegistry } from '@/modules/mcp/tool-registry';
import { MCP_TOOLS_REGISTRY } from '@/modules/mcp/mcp.tools.generated';
import type { McpJwt } from '@/modules/mcp/types';

export const createMcpServer = (jwt: McpJwt): McpServer => {
  const server = new McpServer({ name: 'blawby', version: '1.0.0' });
  toolRegistry.registerTools(server, jwt, MCP_TOOLS_REGISTRY);
  return server;
};

export const handleMcpRequest = async (req: Request, jwt: McpJwt): Promise<Response> => {
  const server = createMcpServer(jwt);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
};
