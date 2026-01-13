import { isEmpty, isNil } from 'es-toolkit/compat';
import type { MiddlewareHandler } from 'hono';
import { match } from 'path-to-regexp';
import { MODULE_REGISTRY } from './modules.generated';
import { CONFIG_REGISTRY } from './configs.generated';
import type { AppType } from '@/shared/types/hono';

// Static module registry - auto-generated at build time

console.log(`📦 Loaded ${MODULE_REGISTRY.length} modules statically`);

/**
 * Middleware configuration types
 */
export type MiddlewareConfig
  = | 'requireAuth'
  | 'requireGuest'
  | 'requireAdmin'
  | 'throttle'
  | 'requireCaptcha'
  | 'public'
  | MiddlewareHandler;

/**
 * Route middleware configuration item
 */
export interface RouteMiddlewareItem {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  path: string;
  middleware: MiddlewareConfig[];
}

/**
 * Route-level middleware configuration
 */
export interface RouteMiddlewareConfig {
  [pattern: string]: MiddlewareConfig[] | RouteMiddlewareItem[];
}

/**
 * Module configuration interface
 */
export interface ModuleConfig {
  name: string;
  middleware?: RouteMiddlewareConfig;
  prefix?: string;
}

interface ParsedPattern {
  method: string | null;
  path: string;
}

const DEFAULT_THROTTLE_RATE = 60;
const WILDCARD = '*';

// Lazy-loaded middleware functions
let requireAuth: () => MiddlewareHandler;
let requireGuest: () => MiddlewareHandler;
let requireAdmin: () => MiddlewareHandler;
let requireCaptcha: () => MiddlewareHandler;
let throttle: (rate: number) => MiddlewareHandler;

/**
 * Lazy load middleware functions to avoid circular dependencies
 */
const loadMiddleware = async (): Promise<void> => {
  if (isNil(requireAuth)) {
    const captchaModule = await import('@/shared/middleware/requireCaptcha');
    const authModule = await import('@/shared/middleware/requireAuth');
    requireAuth = authModule.requireAuth;
    requireGuest = authModule.requireGuest;
    requireAdmin = authModule.requireAdmin;
    throttle = authModule.throttle;
    requireCaptcha = captchaModule.requireCaptcha;
  }
};

/**
 * Parse pattern into method and path components
 * @example 'GET /path' -> { method: 'GET', path: '/path' }
 * @example '/path' -> { method: null, path: '/path' }
 * @example '*' -> { method: null, path: '*' }
 */
const parsePattern = (pattern: string): ParsedPattern => {
  const trimmed = pattern.trim();

  if (trimmed === WILDCARD) {
    return { method: null, path: WILDCARD };
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length === 2) {
    return { method: parts[0].toUpperCase(), path: parts[1] };
  }

  return { method: null, path: trimmed };
};

/**
 * Resolve middleware configuration to actual middleware functions
 */
const resolveMiddleware = async (config: MiddlewareConfig): Promise<MiddlewareHandler> => {
  // If it's already a function (custom middleware), return it directly
  if (typeof config === 'function') {
    return config;
  }

  // Otherwise, it's a string identifier - load the built-in middleware
  await loadMiddleware();

  switch (config) {
    case 'requireAuth':
      return requireAuth();
    case 'requireGuest':
      return requireGuest();
    case 'requireAdmin':
      return requireAdmin();
    case 'requireCaptcha':
      return requireCaptcha();
    case 'throttle':
      return throttle(DEFAULT_THROTTLE_RATE);
    case 'public':
      return async (c, next) => next();
    default:
      throw new Error(`Unknown middleware configuration: ${config}`);
  }
};


/**
 * Create middleware chain executor
 */
const createMiddlewareChain = (middlewares: MiddlewareHandler[]): MiddlewareHandler => {
  return async (c, next) => {
    let index = 0;
    let blockedResponse: Response | undefined;

    const executeNext = async (): Promise<void> => {
      if (index < middlewares.length) {
        const currentMiddleware = middlewares[index++];
        const result = await currentMiddleware(c, executeNext);

        if (result instanceof Response) {
          blockedResponse = result;
        }
      }
    };

    await executeNext();

    return blockedResponse ?? next();
  };
};

/**
 * Register middleware for a specific route item
 */
const registerRouteItem = async (
  app: AppType,
  mountPath: string,
  item: RouteMiddlewareItem,
  registeredPaths: Set<string>,
): Promise<void> => {
  const fullPath = `${mountPath}${item.path}`;
  const resolvedMiddleware: MiddlewareHandler[] = [];

  // Resolve all middleware in parallel
  const middlewarePromises = item.middleware.map((config) => resolveMiddleware(config));
  const resolved = await Promise.all(middlewarePromises);
  resolvedMiddleware.push(...resolved);

  const middlewareChain = createMiddlewareChain(resolvedMiddleware);

  app.use(fullPath, async (c, next) => {
    if (c.req.method === item.method) {
      return middlewareChain(c, next);
    }
    return next();
  });

  registeredPaths.add(fullPath);
};

/**
 * Check if middleware config is in object format
 */
const isRouteItemArray = (config: unknown): config is RouteMiddlewareItem[] => {
  return (
    Array.isArray(config)
    && config.length > 0
    && typeof config[0] === 'object'
    && 'method' in config[0]
  );
};

/**
 * Register middleware for a pattern
 */
const registerPattern = async (
  app: AppType,
  mountPath: string,
  pattern: string,
  middlewareConfig: MiddlewareConfig[] | RouteMiddlewareItem[],
  registeredPaths: Set<string>,
): Promise<void> => {
  // Handle object format
  if (isRouteItemArray(middlewareConfig)) {
    // Process all route items in parallel
    await Promise.all(
      middlewareConfig.map((item) => registerRouteItem(app, mountPath, item, registeredPaths)),
    );
    return;
  }

  // Handle string format
  const middlewareList = middlewareConfig as MiddlewareConfig[];
  const { method, path } = parsePattern(pattern);

  const fullPath = path === WILDCARD ? `${mountPath}/*` : `${mountPath}${path}`;

  // Handle empty middleware array
  if (isEmpty(middlewareList)) {
    app.use(fullPath, async (c, next) => next());

    if (path !== WILDCARD) {
      registeredPaths.add(fullPath);
    }
    return;
  }

  // Resolve middleware in parallel
  const resolvedMiddleware: MiddlewareHandler[] = [];

  const middlewarePromises = middlewareList.map((config) => resolveMiddleware(config));
  const resolved = await Promise.all(middlewarePromises);
  resolvedMiddleware.push(...resolved);

  const middlewareChain = createMiddlewareChain(resolvedMiddleware);

  // Register method-specific or all-methods middleware
  if (method) {
    app.use(fullPath, async (c, next) => {
      if (c.req.method === method) {
        return middlewareChain(c, next);
      }
      return next();
    });
  } else {
    app.use(fullPath, ...resolvedMiddleware);
  }

  if (path !== WILDCARD) {
    registeredPaths.add(fullPath);
  }
};

/**
 * Register module middleware
 *
 * Middleware respects file order - later entries override earlier ones.
 * Earlier patterns are wrapped to skip if a later pattern matches the same route.
 * Uses path-to-regexp (battle-tested, used by Hono internally) for pattern matching.
 *
 * Example:
 *   middleware: {
 *     '*': ['requireAuth'],           // First: wrapped to check later patterns
 *     '/details/:slug': ['requireCaptcha'],  // Later: overrides wildcard
 *   }
 *
 * Result: '/details/:slug' gets ONLY requireCaptcha (not requireAuth)
 */
const registerModuleMiddleware = async (
  app: AppType,
  mountPath: string,
  config: ModuleConfig,
): Promise<void> => {
  if (!config.middleware || isEmpty(config.middleware)) {
    return;
  }

  // Get entries in file order (respects config file order)
  const patterns = Object.entries(config.middleware);
  const registeredPaths = new Set<string>();

  // Register patterns in file order
  for (let i = 0; i < patterns.length; i++) {
    const [pattern, middlewareConfig] = patterns[i];
    const { method, path } = parsePattern(pattern);

    // Get later patterns (that could override this one)
    const laterPatterns = patterns.slice(i + 1).map(([p]) => {
      const parsed = parsePattern(p);
      return {
        method: parsed.method,
        path: parsed.path === WILDCARD ? '*' : parsed.path,
      };
    });

    // Wrap middleware if it could be overridden by later patterns
    if ((path === WILDCARD || path.includes('*')) && laterPatterns.length > 0) {
      if (Array.isArray(middlewareConfig) && !isRouteItemArray(middlewareConfig)) {
        try {
          const middlewareList = middlewareConfig as MiddlewareConfig[];
          const wrappedConfig: MiddlewareConfig[] = middlewareList.map((mwConfig) => {
            return (async (c: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]) => {
              try {
                const requestPath = c.req.path;
                const requestMethod = c.req.method;

                // Remove mount path from request path for comparison
                const relativePath = requestPath.startsWith(mountPath)
                  ? requestPath.slice(mountPath.length) || '/'
                  : requestPath;

                // Check if any LATER pattern matches this request using path-to-regexp
                const laterPatternMatches = laterPatterns.some(({ method: laterMethod, path: laterPath }) => {
                  // If later pattern has a method, check it matches
                  if (laterMethod && laterMethod !== requestMethod) {
                    return false;
                  }

                  // Wildcard matches everything
                  if (laterPath === '*') {
                    return true;
                  }

                  // Use path-to-regexp to check if path matches (battle-tested, used by Hono)
                  try {
                    const matcher = match(laterPath, { decode: decodeURIComponent });
                    return !!matcher(relativePath);
                  } catch (error) {
                    // If pattern is invalid, fall back to simple string matching
                    console.warn(`[Middleware Override] Pattern matching failed for "${laterPath}":`, error);
                    return laterPath === relativePath;
                  }
                });

                // Skip this middleware if a later pattern matches (override)
                if (laterPatternMatches) {
                  return next();
                }

                // Otherwise, apply this middleware
                const mw = await resolveMiddleware(mwConfig);
                return mw(c, next);
              } catch (error) {
                console.error(`[Middleware Override] Error in wrapped middleware for pattern "${pattern}":`, error);
                // On error, skip middleware to avoid blocking
                return next();
              }
            }) as MiddlewareHandler;
          });

          await registerPattern(app, mountPath, pattern, wrappedConfig, registeredPaths);
          continue;
        } catch (error) {
          console.error(`[Middleware Override] Failed to wrap middleware for pattern "${pattern}", falling back to normal registration:`, error);
          // Fall through to normal registration
        }
      }
    }

    // For specific routes or when no later patterns exist, register normally
    await registerPattern(app, mountPath, pattern, middlewareConfig, registeredPaths);
  }
};

/**
 * Get list of module names from static registry
 */
const getModuleNames = (): string[] => {
  return MODULE_REGISTRY.map((m) => m.name);
};

/**
 * Load module configuration or return default
 */
const loadModuleConfig = async (moduleName: string): Promise<ModuleConfig> => {
  // Use static config registry (generated at build time)
  const configEntry = CONFIG_REGISTRY.find((entry) => entry.name === moduleName);

  if (configEntry?.config) {
    const config = configEntry.config as Partial<ModuleConfig>;

    // Convert old array format to new object format
    if (config.middleware && Array.isArray(config.middleware)) {
      config.middleware = {
        [WILDCARD]: config.middleware as MiddlewareConfig[],
      };
    }

    const loadedConfig: ModuleConfig = {
      name: moduleName,
      middleware: config.middleware,
      prefix: config.prefix,
    };

    return loadedConfig;
  }
  return {
    name: moduleName,
    middleware: moduleName === 'public' ? { [WILDCARD]: [] } : { [WILDCARD]: ['requireAuth'] },
  };
};

/**
 * Load and mount a single module from static registry
 */
const loadModule = async (app: AppType, moduleName: string): Promise<void> => {
  try {
    // Get module from static registry
    const registryEntry = MODULE_REGISTRY.find((m) => m.name === moduleName);

    if (!registryEntry?.http) {
      console.warn(`⚠️  Module ${moduleName} not found in registry or missing http export`);
      return;
    }

    const config = await loadModuleConfig(moduleName);

    // If prefix is provided and starts with '/', use it as-is (full path)
    // Otherwise, construct path with module name
    const mountPath = config.prefix
      ? (config.prefix.startsWith('/') ? config.prefix : `/api/${config.prefix}/${moduleName}`)
      : `/api/${moduleName}`;

    await registerModuleMiddleware(app, mountPath, config);
    app.route(mountPath, registryEntry.http);

    const middlewareInfo = config.middleware
      ? Object.entries(config.middleware)
        .map(([pattern, mw]) => `${pattern}: [${Array.isArray(mw) ? mw.join(', ') : ''}]`)
        .join(', ')
      : 'none';

    console.log(`✅ Mounted module: ${moduleName} at ${mountPath}`);
    if (middlewareInfo !== 'none') {
      console.log(`   Middleware: ${middlewareInfo}`);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to load module ${moduleName}:`, error);
  }
};

/**
 * Register all module routes
 * Modules are statically discovered at build time
 */
export const registerModuleRoutes = async (app: AppType): Promise<void> => {
  const modules = getModuleNames();
  await Promise.all(modules.map((moduleName) => loadModule(app, moduleName)));
};
