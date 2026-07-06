import type { McpRouteAnnotation } from '@/shared/router/route-builder';
import { ZodObject, type ZodRawShape } from 'zod';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

export const getZodShape = (value: unknown): ZodRawShape => (value instanceof ZodObject ? value.shape : {});

export const isMcpRouteAnnotation = (value: unknown): value is McpRouteAnnotation =>
  isRecord(value) && typeof value.scope === 'string' && typeof value.handler === 'function';
