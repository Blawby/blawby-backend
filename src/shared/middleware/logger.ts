import { consola } from 'consola';
import type { MiddlewareHandler } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import {
  sanitizeError,
  categorizeError,
  formatResponseTime,
  shouldSkipLogging,
  sanitizeHeaders,
  sanitizeBody,
} from '@/shared/utils/logging';

/**
 * Hono Logger Middleware
 *
 * Provides request/response logging similar to Fastify's logger.
 * Uses Hono's built-in logger middleware with custom formatting.
 */
export const logger = (): MiddlewareHandler => {
  return honoLogger((message, ...rest) => {
    // Use consola for consistent logging
    consola.info(`[HONO] ${message}`, ...rest);
  });
};

/**
 * Enhanced Error Logger
 *
 * Provides detailed error logging
 */
export const logError = (error: unknown, context?: {
  method?: string;
  url?: string;
  statusCode: number;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  responseTime?: number;
  errorType?: string;
  errorMessage?: string;
  stack?: string;
}): void => {
  // Skip logging for certain requests
  if (context?.url && context?.method && shouldSkipLogging(context.url, context.method)) {
    return;
  }

  const sanitizedError = sanitizeError(error);
  const errorCategory = categorizeError(error);
  const responseTime = context?.responseTime ? formatResponseTime(context.responseTime) : undefined;

  const errorInfo = {
    ...sanitizedError,
    ...context,
    category: errorCategory,
    responseTime,
    timestamp: new Date().toISOString(),
  };

  // Use consola with appropriate level based on status code
  const level = (context?.statusCode && context.statusCode >= 500) ? 'error' : 'warn';
  consola[level]('API Error:', errorInfo);
};

/**
 * Request Logger
 *
 * Logs incoming requests with detailed information
 */
export const logRequest = (context: {
  method: string;
  url: string;
  headers?: Record<string, unknown>;
  body?: unknown;
  userAgent?: string;
  ip?: string;
  userId?: string;
  organizationId?: string;
  requestId?: string;
}): void => {
  // Skip logging for certain requests
  if (shouldSkipLogging(context.url, context.method)) {
    return;
  }

  const requestInfo = {
    method: context.method,
    url: context.url,
    headers: context.headers ? sanitizeHeaders(context.headers) : undefined,
    body: context.body ? sanitizeBody(context.body) : undefined,
    userAgent: context.userAgent,
    ip: context.ip,
    userId: context.userId,
    organizationId: context.organizationId,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  };

  consola.info('Request:', requestInfo);
};

/**
 * Response Logger
 *
 * Logs outgoing responses with timing information
 */
export const logResponse = (context: {
  method: string;
  url: string;
  statusCode: number;
  responseTime?: number;
  body?: unknown;
  userId?: string;
  organizationId?: string;
  requestId?: string;
}): void => {
  // Skip logging for certain requests
  if (shouldSkipLogging(context.url, context.method)) {
    return;
  }

  const responseTime = context.responseTime ? formatResponseTime(context.responseTime) : undefined;
  const responseInfo = {
    method: context.method,
    url: context.url,
    statusCode: context.statusCode,
    responseTime,
    body: context.body ? sanitizeBody(context.body) : undefined,
    userId: context.userId,
    organizationId: context.organizationId,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  };

  // Use consola with appropriate level based on status code
  const level = context.statusCode >= 400 ? 'error' : 'info';
  consola[level]('Response:', responseInfo);
};

/**
 * Success Logger
 *
 * Logs successful operations with structured data
 */
export const logSuccess = (message: string, data?: Record<string, unknown>): void => {
  const successInfo = {
    message,
    data: data ? sanitizeBody(data) : undefined,
    timestamp: new Date().toISOString(),
  };

  consola.success('Success:', successInfo);
};

/**
 * Debug Logger
 *
 * Logs debug information (only in development)
 */
export const logDebug = (message: string, data?: Record<string, unknown>): void => {
  if (process.env.NODE_ENV !== 'production') {
    const debugInfo = {
      message,
      data: data ? sanitizeBody(data) : undefined,
      timestamp: new Date().toISOString(),
    };

    consola.debug('Debug:', debugInfo);
  }
};

/**
 * Warning Logger
 *
 * Logs warnings and non-critical issues
 */
export const logWarning = (message: string, data?: Record<string, unknown>): void => {
  const warningInfo = {
    message,
    data: data ? sanitizeBody(data) : undefined,
    timestamp: new Date().toISOString(),
  };

  consola.warn('Warning:', warningInfo);
};
