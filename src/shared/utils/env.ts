/**
 * Environment Utilities
 *
 * Provides utilities for environment variable handling.
 * Separates APP_ENV (application environment) from NODE_ENV (Node.js runtime environment).
 *
 * - NODE_ENV: Used by Node.js for optimizations ('development' | 'production')
 * - APP_ENV: Used by application logic ('development' | 'staging' | 'production')
 */

type AppEnvironment = 'development' | 'staging' | 'production';
type NodeEnvironment = 'development' | 'production';

/**
 * Get the application environment
 * Falls back to NODE_ENV if APP_ENV is not set
 */
export const getAppEnv = (): AppEnvironment => {
  const appEnv = process.env.APP_ENV?.toLowerCase();
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();

  if (appEnv === 'development' || appEnv === 'staging' || appEnv === 'production') {
    return appEnv;
  }

  // Fallback to NODE_ENV
  if (nodeEnv === 'development' || nodeEnv === 'production') {
    return nodeEnv;
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
export const isDevelopment = (): boolean => {
  return getAppEnv() === 'development';
};

/**
 * Check if running in staging environment
 */
export const isStaging = (): boolean => {
  return getAppEnv() === 'staging';
};

/**
 * Check if running in production environment
 */
export const isProduction = (): boolean => {
  return getAppEnv() === 'production';
};

/**
 * Check if running in a non-development environment (staging or production)
 */
export const isNonDevelopment = (): boolean => {
  return !isDevelopment();
};

/**
 * Check if running in a production-like environment (staging or production)
 */
export const isProductionLike = (): boolean => {
  const env = getAppEnv();
  return env === 'staging' || env === 'production';
};
