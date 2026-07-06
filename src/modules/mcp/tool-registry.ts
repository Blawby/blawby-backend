import { mcpContext } from '@/modules/mcp/mcp-context';
import { deriveHighRiskIdempotencyKey } from '@/modules/mcp/idempotency';
import { getRecord, getZodShape, isMcpRouteAnnotation } from '@/modules/mcp/tool-registry.guards';
import type { AnyToolDef, McpJwt, McpToolServer } from '@/modules/mcp/types';
import { pendingActionsService } from '@/modules/pending-actions/services/pending-actions.service';
import { config } from '@/shared/config';
import type { ServiceContext } from '@/shared/types/service-context';
import type { z } from '@hono/zod-openapi';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

const defineTool = <S extends ZodRawShape>(def: {
  name: string;
  description: string;
  schema: S;
  scope: string;
  approval?: AnyToolDef['approval'];
  requiresPendingApproval?: AnyToolDef['requiresPendingApproval'];
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ServiceContext) => Promise<unknown>;
}): AnyToolDef<S> => def;

const toolErrorResult = (message: string): CallToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const toolSuccessResult = (result: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
});

const requireToolScope = (jwt: McpJwt, tool: AnyToolDef): CallToolResult | null => {
  const scopes = mcpContext.getMcpScopes(jwt);
  if (scopes.includes(tool.scope)) {
    return null;
  }

  return toolErrorResult(`Missing required MCP scope "${tool.scope}" for tool "${tool.name}"`);
};

const requireToolApproval = async (server: McpToolServer, tool: AnyToolDef): Promise<CallToolResult | null> => {
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

/**
 * Stages the tool call as a `pending_actions` row instead of executing it,
 * and returns an approval URL. The actual write happens later, out-of-band,
 * when a practice member approves via `POST /api/pending-actions/{id}/approve`
 * (see the pending-actions module) — that route looks the tool back up by
 * name and calls the same `handler` this registry would otherwise call now.
 */
const createPendingApprovalResult = async (tool: AnyToolDef, args: Record<string, unknown>, ctx: ServiceContext): Promise<CallToolResult> => {
  const idempotencyKey = await deriveHighRiskIdempotencyKey({
    toolName: tool.name,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    params: args,
  });

  const pending = await pendingActionsService.createPendingAction({
    organizationId: ctx.organizationId,
    createdByUserId: ctx.userId,
    toolName: tool.name,
    toolParams: args,
    idempotencyKey,
  });

  const approvalUrl = `${config.app.appUrl}/approve/${pending.id}`;
  const text = [
    `I've prepared the ${tool.name.replace(/_/g, ' ')} request.`,
    `A practice member needs to approve it here: ${approvalUrl}.`,
    `The link expires at ${pending.expires_at.toISOString()}.`,
    "I'll learn the outcome once it's approved or rejected.",
  ].join(' ');

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      pending_action_id: pending.id,
      approval_url: approvalUrl,
      expires_at: pending.expires_at.toISOString(),
    },
  };
};

const registerTools = (server: McpToolServer, jwt: McpJwt, tools: AnyToolDef[]): void => {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, async (args) => {
      try {
        const scopeError = requireToolScope(jwt, tool);
        if (scopeError) {
          return scopeError;
        }

        const approvalError = await requireToolApproval(server, tool);
        if (approvalError) {
          return approvalError;
        }

        const ctx = await mcpContext.buildMcpServiceContext(jwt);

        if (tool.requiresPendingApproval) {
          return await createPendingApprovalResult(tool, args as Record<string, unknown>, ctx);
        }

        const result = await tool.handler(args, ctx);
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
  const exportsValue = getRecord(routeExports.routes);
  const routeMap = exportsValue ?? routeExports;
  const tools: AnyToolDef[] = [];
  const seen = new Set<object>();

  const addRouteTool = (exportKey: string, route: unknown): void => {
    if (typeof route !== 'object' || route === null) {
      return;
    }
    if (seen.has(route)) {
      return;
    }
    const r = getRecord(route);
    if (!r || !isMcpRouteAnnotation(r.mcp)) {
      return;
    }
    seen.add(route);

    const { mcp } = r;
    const method = typeof r.method === 'string' ? r.method : 'get';
    const path = typeof r.path === 'string' ? r.path : '';
    const name = mcp.name ?? deriveToolName(method, path, exportKey);
    const description = mcp.description ?? (typeof r.summary === 'string' ? r.summary : name);

    let schema: ZodRawShape = mcp.schema ?? {};
    if (!mcp.schema) {
      const req = getRecord(r.request);

      // Body schema
      const bodyContent = getRecord(req?.body);
      const jsonSchema = getRecord(bodyContent?.content);
      const bodySchema = getRecord(jsonSchema?.['application/json']);
      const bodyShape = getZodShape(bodySchema?.schema);

      // Path params — exclude org-scoping fields (practice_id, organization_id)
      const orgParams = new Set(['practice_id', 'organization_id']);
      const paramsShape = getZodShape(req?.params);
      const filteredParams = Object.fromEntries(Object.entries(paramsShape).filter(([k]) => !orgParams.has(k)));

      // Query params
      const queryShape = getZodShape(req?.query);

      schema = { ...queryShape, ...filteredParams, ...bodyShape };
    }

    tools.push({
      name,
      description,
      scope: mcp.scope,
      schema,
      approval: mcp.approval,
      requiresPendingApproval: mcp.requiresPendingApproval,
      handler: mcp.handler,
    });
  };

  for (const [exportKey, route] of Object.entries(routeMap)) {
    addRouteTool(exportKey, route);

    const r = getRecord(route);
    if (r && !r.mcp && !r.method) {
      for (const [nestedKey, nestedRoute] of Object.entries(r)) {
        addRouteTool(nestedKey, nestedRoute);
      }
    }
  }

  return tools;
};

export const toolRegistry = {
  defineTool,
  registerTools,
};
