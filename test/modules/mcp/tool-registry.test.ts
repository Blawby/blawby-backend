import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@hono/zod-openapi';
import { toolRegistry } from '@/modules/mcp/tool-registry';
import { mcpContext } from '@/modules/mcp/mcp-context';
import type { AnyToolDef, McpJwt } from '@/modules/mcp/types';
import type { ServiceContext } from '@/shared/types/service-context';

vi.mock('@/modules/mcp/mcp-context', () => ({
  mcpContext: {
    getMcpScopes: vi.fn((jwt: McpJwt) => {
      const {scope} = jwt;
      return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : [];
    }),
    buildMcpServiceContext: vi.fn(async () => ({ organizationId: 'org_1' }) as ServiceContext),
  },
}));

type CapturedToolCallback = (args: Record<string, unknown>) => Promise<CallToolResult>;

const createFakeServer = (action: 'accept' | 'decline' | 'cancel' = 'accept') => {
  const callbacks = new Map<string, CapturedToolCallback>();
  const elicitInput = vi.fn(async () => ({
    action,
    content: action === 'accept' ? { confirm: true } : undefined,
  }));

  const server = {
    server: { elicitInput },
    registerTool: vi.fn((name: string, _config: unknown, callback: CapturedToolCallback) => {
      callbacks.set(name, callback);
      return {};
    }),
  } as unknown as McpServer;

  return { callbacks, elicitInput, server };
};

const createTool = (handler: AnyToolDef['handler']): AnyToolDef => ({
  name: 'dangerous_tool',
  description: 'A test tool',
  schema: { value: z.string() },
  scope: 'things:write',
  approval: {
    required: true,
    message: 'Approve the test write?',
  },
  handler,
});

describe('toolRegistry.registerTools', () => {
  it('returns an MCP tool error before handler execution when scope is missing', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const { callbacks, elicitInput, server } = createFakeServer();

    toolRegistry.registerTools(server, { scope: 'things:read' }, [createTool(handler)]);
    const result = await callbacks.get('dangerous_tool')?.({ value: 'x' });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.type).toBe('text');
    expect(result?.content[0]?.text).toContain('Missing required MCP scope');
    expect(elicitInput).not.toHaveBeenCalled();
    expect(mcpContext.buildMcpServiceContext).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['decline', 'Approval declined'],
    ['cancel', 'Approval cancelled'],
  ] as const)('returns an MCP tool error when approval is %s', async (action, message) => {
    const handler = vi.fn(async () => ({ ok: true }));
    const { callbacks, server } = createFakeServer(action);

    toolRegistry.registerTools(server, { scope: 'things:write' }, [createTool(handler)]);
    const result = await callbacks.get('dangerous_tool')?.({ value: 'x' });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain(message);
    expect(mcpContext.buildMcpServiceContext).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler after required scope and approval acceptance', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const { callbacks, server } = createFakeServer('accept');

    toolRegistry.registerTools(server, { scope: 'things:write' }, [createTool(handler)]);
    const result = await callbacks.get('dangerous_tool')?.({ value: 'x' });

    expect(result?.isError).toBeUndefined();
    expect(result?.content[0]?.text).toBe(JSON.stringify({ ok: true }));
    expect(mcpContext.buildMcpServiceContext).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('MCP generated tool inventory', () => {
  it('includes expanded practice CRUD domains beyond the original core tools', async () => {
    process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/blawby_test';
    const { MCP_TOOLS_REGISTRY } = await import('@/modules/mcp/mcp.tools.generated');
    const names = new Set(MCP_TOOLS_REGISTRY.map((tool) => tool.name));

    expect(names).toContain('list_matter_tasks');
    expect(names).toContain('create_matter_note');
    expect(names).toContain('update_client_intake_profile');
    expect(names).toContain('list_engagement_templates');
    expect(names).toContain('send_invoice');
    expect(names).toContain('execute_refund');
    expect(names).toContain('create_trust_deposit');
    expect(names).toContain('convert_intake_to_matter');
    expect(names).toContain('run_conflict_check');
    expect(names).toContain('list_payouts');
    expect(names).toContain('get_current_subscription');
  });
});
