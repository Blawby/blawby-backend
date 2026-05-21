// oxlint-disable import/group-exports
// oxlint-disable import/no-named-export
// oxlint-disable no-magic-numbers

import { config, type AppEnvironment, type NodeEnvironment } from '@/shared/config';

/**
 * Get the application environment
 */
export const getAppEnv = (): AppEnvironment => config.env.app;

/**
 * Get the Node.js environment
 */
export const getNodeEnv = (): NodeEnvironment => (config.env.node === 'production' ? 'production' : 'development');

/**
 * Check if running in development environment
 */
export const isDevelopment = (): boolean => config.env.isDevelopment;

/**
 * Check if running in test environment
 */
export const isTest = (): boolean => config.env.isTest;

/**
 * Check if running in staging environment
 */
export const isStaging = (): boolean => config.env.isStaging;

/**
 * Check if running in production environment
 */
export const isProduction = (): boolean => config.env.isProduction;

/**
 * Check if running in a non-development environment (staging or production)
 */
export const isNonDevelopment = (): boolean => !config.env.isDevelopment;

/**
 * Check if running in a production-like environment (staging or production)
 */
export const isProductionLike = (): boolean => config.env.isProductionLike;

/**
 * Get an environment variable as an array of strings (comma-separated)
 *
 * Special-case keys:
 * - ALLOWED_ORIGINS: returns config.app.allowedOrigins
 * - FRONTEND_URL: returns config.app.frontendUrls
 */
export const getEnvArray = (key: string, defaultValue: string[] = []): string[] => {
  if (key === 'ALLOWED_ORIGINS') {
    return config.app.allowedOrigins.length > 0 ? config.app.allowedOrigins : defaultValue;
  }

  if (key === 'FRONTEND_URL') {
    return config.app.frontendUrls.length > 0 ? config.app.frontendUrls : defaultValue;
  }

  const value = config.raw[key];
  if (!value) {
    return defaultValue;
  }

  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

/**
 * Extract the origin (scheme + host) from a Referer header value.
 * Returns undefined if the referer is missing or not a valid URL.
 */
export const extractOriginFromReferer = (referer?: string | null): string | undefined => {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};

/**
 * Get the best matching frontend URL from FRONTEND_URL environment variable
 * based on the provided origin. Falls back to the first URL if no match is found.
 */
export const getMatchingFrontendUrl = (origin?: string | null): string => {
  const urls = config.app.frontendUrls;
  if (urls.length === 0) {
    return config.app.baseUrl;
  }
  if (urls.length === 1 || !origin) {
    return urls[0] ?? '';
  }

  const normalizedOrigin = origin.toLowerCase().trim().replace(/\/$/, '');
  const match = urls.find((url) => {
    const normalizedUrl = url.toLowerCase().trim().replace(/\/$/, '');
    return normalizedUrl === normalizedOrigin;
  });

  return match ?? urls[0] ?? '';
};
