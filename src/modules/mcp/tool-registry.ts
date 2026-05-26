import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpContext } from '@/modules/mcp/mcp-context';
import type { McpJwt } from '@/modules/mcp/types';
import type { AnyToolDef } from '@/modules/mcp/types';
import { z } from '@hono/zod-openapi';
import { ZodRawShape } from 'zod';
import type { ServiceContext } from '@/shared/types/service-context';

const defineTool = <S extends ZodRawShape>(def: {
  name: string;
  description: string;
  schema: S;
  scope: string;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ServiceContext) => Promise<unknown>;
}): AnyToolDef => def as unknown as AnyToolDef;

const registerTools = (server: McpServer, jwt: McpJwt, tools: AnyToolDef[]): void => {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, async (args) => {
      if (!mcpContext.getMcpScopes(jwt).includes(tool.scope)) {
        return {
          content: [{ type: 'text' as const, text: `Forbidden: missing scope ${tool.scope}` }],
          isError: true,
        };
      }
      try {
        const ctx = await mcpContext.buildMcpServiceContext(jwt);
        const result = await tool.handler(args as Record<string, unknown>, ctx);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    });
  }
};

export const toolRegistry = {
  defineTool,
  registerTools,
};
