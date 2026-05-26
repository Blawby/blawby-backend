import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpContext } from '@/modules/mcp/mcp-context';
import type { McpJwt } from '@/modules/mcp/types';
import type { AnyToolDef } from '@/modules/mcp/types';
import { z } from '@hono/zod-openapi';
import type { ZodRawShape } from 'zod';
import type { ZodObject } from 'zod';
import type { ServiceContext } from '@/shared/types/service-context';
import type { McpRouteAnnotation } from '@/shared/router/route-builder';

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

const deriveToolName = (method: string, path: string): string => {
  // Strip leading /{practice_id} prefix — it's just org scoping
  const normalized = path.replace(/^\/\{practice_id\}/, '').replace(/^\//, '');
  const segments = normalized.split('/').filter(Boolean);
  const modName = segments[0]?.replace(/-/g, '_') ?? 'resource';
  const hasIdSegment = segments.some((s) => s.startsWith('{') && s.endsWith('}'));
  const m = method.toLowerCase();

  if (!hasIdSegment) {
    if (m === 'get') return `list_${modName}`;
    if (m === 'post') return `create_${modName}`;
  } else if (segments.length === 2) {
    if (m === 'get') return `get_${modName}`;
    if (m === 'patch' || m === 'put') return `update_${modName}`;
    if (m === 'delete') return `delete_${modName}`;
  }

  return `${m}_${path.replace(/[^\w]/g, '_')}`;
};

export const buildMcpToolsFromModule = (routeExports: Record<string, unknown>): AnyToolDef[] => {
  const exportsValue = routeExports['routes'] as Record<string, unknown> | undefined;
  const allRoutes = Object.values(exportsValue ?? routeExports);
  const tools: AnyToolDef[] = [];

  for (const route of allRoutes) {
    if (typeof route !== 'object' || route === null) continue;
    const r = route as Record<string, unknown>;
    if (!r['mcp']) continue;

    const mcp = r['mcp'] as McpRouteAnnotation;
    const method = typeof r['method'] === 'string' ? r['method'] : 'get';
    const path = typeof r['path'] === 'string' ? r['path'] : '';
    const name = mcp.name ?? deriveToolName(method, path);
    const description = mcp.description ?? (typeof r['summary'] === 'string' ? r['summary'] : name);

    let schema: ZodRawShape = mcp.schema ?? {};
    if (!mcp.schema) {
      const bodyContent = (r['request'] as Record<string, unknown> | undefined)?.['body'];
      const jsonSchema = (bodyContent as Record<string, unknown> | undefined)?.['content'] as
        | Record<string, unknown>
        | undefined;
      const bodySchema = jsonSchema?.['application/json'] as Record<string, unknown> | undefined;
      schema = ((bodySchema?.['schema'] as ZodObject<ZodRawShape> | undefined)?.shape as ZodRawShape | undefined) ?? {};
    }

    tools.push({ name, description, scope: mcp.scope, schema, handler: mcp.handler });
  }

  return tools;
};

export const toolRegistry = {
  defineTool,
  registerTools,
};
