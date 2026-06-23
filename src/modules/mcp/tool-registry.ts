import { mcpContext } from '@/modules/mcp/mcp-context';
import type { AnyToolDef, McpJwt } from '@/modules/mcp/types';
import type { McpRouteAnnotation } from '@/shared/router/route-builder';
import type { ServiceContext } from '@/shared/types/service-context';
import type { z } from '@hono/zod-openapi';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodObject, ZodRawShape } from 'zod';

const defineTool = <S extends ZodRawShape>(def: {
  name: string;
  description: string;
  schema: S;
  scope: string;
  approval?: AnyToolDef['approval'];
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ServiceContext) => Promise<unknown>;
}): AnyToolDef => def as unknown as AnyToolDef;

const hasRequiredMcpScope = (jwt: McpJwt, requiredScope: string): boolean => {
  const scopes = mcpContext.getMcpScopes(jwt);
  return scopes.includes(requiredScope);
};

const toolErrorResult = (message: string): CallToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const toolSuccessResult = (result: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
});

const requireToolApproval = async (server: McpServer, tool: AnyToolDef): Promise<CallToolResult | null> => {
  if (!tool.approval?.required) {
    return null;
  }

  const result = await server.server.elicitInput(
    {
      mode: 'form',
      message: tool.approval.message ?? `Approve MCP tool "${tool.name}" before continuing.`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: tool.approval.confirm_title ?? 'Approve',
            description: `Confirm that "${tool.name}" may make this change.`,
            default: false,
          },
        },
        required: ['confirm'],
      },
    },
    { timeout: 30_000 }
  );

  if (result.action === 'decline') {
    return toolErrorResult(`Approval declined for MCP tool "${tool.name}"`);
  }

  if (result.action === 'cancel') {
    return toolErrorResult(`Approval cancelled for MCP tool "${tool.name}"`);
  }

  if (result.action !== 'accept') {
    return toolErrorResult(`Unexpected approval response for MCP tool "${tool.name}"`);
  }

  if (result.content?.confirm !== true) {
    return toolErrorResult(`Approval declined for MCP tool "${tool.name}"`);
  }

  return null;
};

const registerTools = (server: McpServer, jwt: McpJwt, tools: AnyToolDef[]): void => {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, async (args) => {
      try {
        if (!hasRequiredMcpScope(jwt, tool.scope)) {
          return toolErrorResult(`Missing required MCP scope "${tool.scope}" for tool "${tool.name}"`);
        }

        const approvalError = await requireToolApproval(server, tool);
        if (approvalError) {
          return approvalError;
        }

        const ctx = await mcpContext.buildMcpServiceContext(jwt);
        const result = await tool.handler(args as Record<string, unknown>, ctx);
        return toolSuccessResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolErrorResult(message);
      }
    });
  }
};

const exportKeyToModName = (exportKey: string): string =>
  exportKey
    .replace(/^(list|get|create|update|patch|delete)/, '')
    .replace(/Route$/, '')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

const deriveToolName = (method: string, path: string, exportKey?: string): string => {
  // Strip leading /{practice_id} prefix — it's just org scoping
  const normalized = path.replace(/^\/\{practice_id\}/, '').replace(/^\//, '');
  const segments = normalized.split('/').filter(Boolean);
  // Fall back to export key when path gives no stable resource name
  const pathModName = segments.find((s) => !s.startsWith('{'))?.replace(/-/g, '_');
  const modName = pathModName ?? (exportKey ? exportKeyToModName(exportKey) : 'resource');
  const hasIdSegment = segments.some((s) => s.startsWith('{') && s.endsWith('}'));
  const m = method.toLowerCase();

  if (!hasIdSegment) {
    if (m === 'get') {
      return `list_${modName}`;
    }
    if (m === 'post') {
      return `create_${modName}`;
    }
  } else {
    // First non-id segment is the resource name; fall back to modName (from export key or path)
    const resourceSeg = segments.find((s) => !s.startsWith('{'));
    const resourceName = (resourceSeg?.replace(/-/g, '_') ?? modName).replace(/[{}]/g, '');
    if (m === 'get') {
      return `get_${resourceName}`;
    }
    if (m === 'patch' || m === 'put') {
      return `update_${resourceName}`;
    }
    if (m === 'delete') {
      return `delete_${resourceName}`;
    }
  }

  return `${m}_${path.replace(/[^\w]/g, '_')}`;
};

export const buildMcpToolsFromModule = (routeExports: Record<string, unknown>): AnyToolDef[] => {
  const exportsValue = routeExports.routes as Record<string, unknown> | undefined;
  const routeMap = exportsValue ?? routeExports;
  const tools: AnyToolDef[] = [];

  const addRouteTool = (exportKey: string, route: unknown): void => {
    if (typeof route !== 'object' || route === null) {
      return;
    }
    const r = route as Record<string, unknown>;
    if (!r.mcp) {
      return;
    }

    const mcp = r.mcp as McpRouteAnnotation;
    const method = typeof r.method === 'string' ? r.method : 'get';
    const path = typeof r.path === 'string' ? r.path : '';
    const name = mcp.name ?? deriveToolName(method, path, exportKey);
    const description = mcp.description ?? (typeof r.summary === 'string' ? r.summary : name);

    let schema: ZodRawShape = mcp.schema ?? {};
    if (!mcp.schema) {
      const req = r.request as Record<string, unknown> | undefined;

      // Body schema
      const bodyContent = req?.body;
      const jsonSchema = (bodyContent as Record<string, unknown> | undefined)?.content as
        | Record<string, unknown>
        | undefined;
      const bodySchema = jsonSchema?.['application/json'] as Record<string, unknown> | undefined;
      const bodyShape = (bodySchema?.schema as ZodObject<ZodRawShape> | undefined)?.shape ?? {};

      // Path params — exclude org-scoping fields (practice_id, organization_id)
      const orgParams = new Set(['practice_id', 'organization_id']);
      const paramsShape = (req?.params as ZodObject<ZodRawShape> | undefined)?.shape ?? {};
      const filteredParams = Object.fromEntries(Object.entries(paramsShape).filter(([k]) => !orgParams.has(k)));

      // Query params
      const queryShape = (req?.query as ZodObject<ZodRawShape> | undefined)?.shape ?? {};

      schema = { ...queryShape, ...filteredParams, ...bodyShape };
    }

    tools.push({ name, description, scope: mcp.scope, schema, approval: mcp.approval, handler: mcp.handler });
  };

  for (const [exportKey, route] of Object.entries(routeMap)) {
    addRouteTool(exportKey, route);

    const r = route as Record<string, unknown>;
    if (typeof route === 'object' && route !== null && !Array.isArray(route) && !r.mcp && !r.method) {
      for (const [nestedKey, nestedRoute] of Object.entries(r)) {
        addRouteTool(nestedKey, nestedRoute);
      }
    }
  }

  return tools;
};

export const toolRegistry = {
  defineTool,
  hasRequiredMcpScope,
  registerTools,
};
