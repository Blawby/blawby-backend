import type { ServiceContext } from '@/shared/types/service-context';
import type { z } from '@hono/zod-openapi';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

export interface McpJwt {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface McpToolApproval {
  required: true;
  message?: string;
  confirm_title?: string;
}

export interface AnyToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: S;
  scope: string;
  approval?: McpToolApproval;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ServiceContext) => Promise<unknown>;
}

export type McpToolCallback = (args: Record<string, unknown>) => Promise<CallToolResult>;

export interface McpToolServer {
  server: {
    elicitInput: (
      request: {
        mode: 'form';
        message: string;
        requestedSchema: {
          type: 'object';
          properties: {
            confirm: {
              type: 'boolean';
              title: string;
              description: string;
              default: boolean;
            };
          };
          required: ['confirm'];
        };
      },
      options: { timeout: number }
    ) => Promise<{ action: string; content?: { confirm?: unknown } }>;
  };
  registerTool: (
    name: string,
    config: { description: string; inputSchema: ZodRawShape },
    callback: McpToolCallback
  ) => unknown;
}
