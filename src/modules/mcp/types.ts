import type { ZodRawShape } from 'zod';
import type { ServiceContext } from '@/shared/types/service-context';

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

export interface AnyToolDef {
  name: string;
  description: string;
  schema: ZodRawShape;
  scope: string;
  approval?: McpToolApproval;
  handler: (args: Record<string, unknown>, ctx: ServiceContext) => Promise<unknown>;
}
