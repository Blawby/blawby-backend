// oxlint-disable import/group-exports
// oxlint-disable import/no-named-export
// oxlint-disable no-magic-numbers

/**
 * Environment Utilities
 *
 * Provides utilities for environment variable handling.
 * Separates APP_ENV (application environment) from NODE_ENV (Node.js runtime environment).
 *
 * - NODE_ENV: Used by Node.js for optimizations ('development' | 'production')
 * - APP_ENV: Used by application logic ('development' | 'staging' | 'production')
 */

type AppEnvironment = 'development' | 'staging' | 'production' | 'test';
type NodeEnvironment = 'development' | 'production';

/**
 * Get the application environment
 * Falls back to NODE_ENV if APP_ENV is not set
 */
export const getAppEnv = (): AppEnvironment => {
  const appEnv = process.env.APP_ENV?.toLowerCase();

  if (appEnv === 'development' || appEnv === 'staging' || appEnv === 'production' || appEnv === 'test') {
    return appEnv;
  }

  // Default to development
  return 'development';
};

/**
 * Get the Node.js environment
 */
export const getNodeEnv = (): NodeEnvironment => {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  return nodeEnv === 'production' ? 'production' : 'development';
};

/**
 * Check if running in development environment
 */
export const isDevelopment = (): boolean => getAppEnv() === 'development';

/**
 * Check if running in test environment
 */
export const isTest = (): boolean => getAppEnv() === 'test';

/**
 * Check if running in staging environment
 */
export const isStaging = (): boolean => getAppEnv() === 'staging';

/**
 * Check if running in production environment
 */
export const isProduction = (): boolean => getAppEnv() === 'production';

/**
 * Check if running in a non-development environment (staging or production)
 */
export const isNonDevelopment = (): boolean => !isDevelopment();

/**
 * Check if running in a production-like environment (staging or production)
 */
export const isProductionLike = (): boolean => {
  const env = getAppEnv();
  return env === 'staging' || env === 'production';
};

/**
 * Get an environment variable as an array of strings (comma-separated)
 */
export const getEnvArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (!value) {return defaultValue;}

  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

/**
 * Get the best matching frontend URL from FRONTEND_URL environment variable
 * based on the provided origin. Falls back to the first URL if no match is found.
 */
export const getMatchingFrontendUrl = (origin?: string | null): string => {
  const urls = getEnvArray('FRONTEND_URL');
  if (urls.length === 0) {return process.env.BASE_URL || '';}
  if (urls.length === 1 || !origin) {return urls[0] ?? '';}

  const normalizedOrigin = origin.toLowerCase().trim().replace(/\/$/, '');
  const match = urls.find((url) => {
    const normalizedUrl = url.toLowerCase().trim().replace(/\/$/, '');
    return normalizedUrl === normalizedOrigin;
  });

  return match ?? urls[0];
};
