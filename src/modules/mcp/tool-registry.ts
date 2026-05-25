import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';
import { z } from '@hono/zod-openapi';

import { buildMcpServiceContext, getMcpScopes } from '@/modules/mcp/mcp-context';
import type { McpJwt } from '@/modules/mcp/types';
import type { ServiceContext } from '@/shared/types/service-context';

export interface AnyToolDef {
  name: string;
  description: string;
  schema: ZodRawShape;
  scope: string;
  handler: (args: Record<string, unknown>, ctx: ServiceContext) => Promise<unknown>;
}

export const defineTool = <S extends ZodRawShape>(def: {
  name: string;
  description: string;
  schema: S;
  scope: string;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ServiceContext) => Promise<unknown>;
}): AnyToolDef => def as unknown as AnyToolDef;

export const registerTools = (server: McpServer, jwt: McpJwt, tools: AnyToolDef[]): void => {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      if (!getMcpScopes(jwt).includes(tool.scope)) {
        return {
          content: [{ type: 'text' as const, text: `Forbidden: missing scope ${tool.scope}` }],
          isError: true,
        };
      }
      try {
        const ctx = await buildMcpServiceContext(jwt);
        const result = await tool.handler(args as Record<string, unknown>, ctx);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    });
  }
};
