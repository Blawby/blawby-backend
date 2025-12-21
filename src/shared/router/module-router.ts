import { isEmpty, isNil } from 'es-toolkit/compat';
import type { MiddlewareHandler } from 'hono';
import { MODULE_REGISTRY } from './modules.generated';
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

// Constants
const EXCLUDED_MODULES = [
  'analytics',
  'subscriptions',
  'billing',
  'payments',
  'admin',
  'clients',
  'customers',
  'events',
  'health',
  'invoices',
  'payouts',
  'settings',
  'stripe',
] as const;

const DEFAULT_THROTTLE_RATE = 60;
const WILDCARD = '*';

// Lazy-loaded middleware functions
let requireAuth: () => MiddlewareHandler;
let requireGuest: () => MiddlewareHandler;
let requireAdmin: () => MiddlewareHandler;
let throttle: (rate: number) => MiddlewareHandler;

/**
 * Lazy load middleware functions to avoid circular dependencies
 */
const loadMiddleware = async (): Promise<void> => {
  if (isNil(requireAuth)) {
    const authModule = await import('@/shared/middleware/requireAuth');
    requireAuth = authModule.requireAuth;
    requireGuest = authModule.requireGuest;
    requireAdmin = authModule.requireAdmin;
    throttle = authModule.throttle;
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
  console.log(
    `🔧 Registering middleware: ${item.method} ${item.path} -> [${item.middleware.join(', ')}]`,
  );

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

  console.log(`🔧 Registering middleware: ${pattern} -> method: ${method}, path: ${path}`);

  const fullPath = path === WILDCARD ? `${mountPath}/*` : `${mountPath}${path}`;

  // Skip wildcard if specific paths already registered
  if (path === WILDCARD && registeredPaths.size > 0) {
    console.log(`🔧 Skipping wildcard for ${fullPath} - specific paths exist`);
    return;
  }

  // Handle empty middleware array
  if (isEmpty(middlewareList)) {
    console.log(`🔧 Registering pass-through for: ${pattern}`);
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
 * Sort patterns to prioritize specific routes over wildcards
 */
const sortPatterns = (
  entries: [string, MiddlewareConfig[] | RouteMiddlewareItem[]][],
): [string, MiddlewareConfig[] | RouteMiddlewareItem[]][] => {
  return entries.sort((a, b) => {
    if (a[0] === WILDCARD) return 1;
    if (b[0] === WILDCARD) return -1;
    return 0;
  });
};

/**
 * Register module middleware
 */
const registerModuleMiddleware = async (
  app: AppType,
  mountPath: string,
  config: ModuleConfig,
): Promise<void> => {
  if (!config.middleware || isEmpty(config.middleware)) {
    return;
  }

  const patterns = sortPatterns(Object.entries(config.middleware));
  const registeredPaths = new Set<string>();

  for (const [pattern, middlewareConfig] of patterns) {
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
  try {
    const configModule = await import(`@/modules/${moduleName}/routes.config.js`);

    if (configModule.config) {
      // Convert old array format to new object format
      if (Array.isArray(configModule.config.middleware)) {
        configModule.config.middleware = {
          [WILDCARD]: configModule.config.middleware,
        };
      }

      return {
        name: moduleName,
        ...configModule.config,
      };
    }
  } catch {
    // Module doesn't have a config file, use default
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
