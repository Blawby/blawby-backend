# Build & Module Architecture

**Last Updated:** February 21, 2026  
**Version:** 1.1
**Status:** Production Ready

> **See also:** [CODING_STANDARDS.md](./CODING_STANDARDS.md) for timestamp handling, Zod validation, and service layer conventions.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Build System](#build-system)
4. [Module Auto-Discovery](#module-auto-discovery)
5. [File Structure](#file-structure)
6. [Workflow](#workflow)
7. [Adding New Modules](#adding-new-modules)
8. [Technical Decisions](#technical-decisions)
9. [Performance Metrics](#performance-metrics)
10. [Future Considerations](#future-considerations)

---

## Overview

The Blawby Backend uses a **unified build system** with **build-time module auto-discovery**. This architecture eliminates manual module registration while maintaining optimal performance through static imports and bundling.

### Key Features

- ✅ **Zero Manual Registration** - Modules auto-discovered at build time
- ✅ **Static Imports** - Full tree-shaking and optimization
- ✅ **Unified Build Script** - One command orchestrates everything
- ✅ **Type Safety** - Generated TypeScript types
- ✅ **Fast Builds** - ~1 second production builds
- ✅ **Scalable** - Ready for 100+ modules

---

## Architecture Principles

### 1. Build-Time Discovery
- Modules discovered during build, not runtime
- Generates static import statements
- Zero runtime overhead

### 2. Convention Over Configuration
- Drop a folder in `src/modules/` → automatically included
- Standard structure expected: `http.ts` with default export
- Optional `routes.config.ts` for customization

### 3. Single Responsibility
- Each script has one clear purpose
- Build orchestrator coordinates all phases
- Separation of concerns maintained

---

## Build System

### Architecture

```
┌─────────────────────────────────────────┐
│         scripts/build.ts                │
│    (Unified Build Orchestrator)         │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │ Phase  │  │ Phase  │  │ Phase  │
   │   1-2  │  │   3-4  │  │ Output │
   └────────┘  └────────┘  └────────┘
   Discovery    Building    Bundled
   + Schema                  JS Files
```

### Build Phases

#### Phase 1: Module Discovery
**Purpose:** Scan and register all modules

```typescript
// Scans: src/modules/
// Generates: src/shared/router/modules.generated.ts
```

**Output:**
```typescript
import intakePaymentsHttp from '@/modules/intake-payments/http';
import onboardingHttp from '@/modules/onboarding/http';
// ... more imports

export const MODULE_REGISTRY = [
  { name: 'intake-payments', http: intakePaymentsHttp },
  { name: 'onboarding', http: onboardingHttp },
  // ... more entries
] as const;
```

#### Phase 2: Schema Sync
**Purpose:** Synchronize database schemas

```bash
tsx scripts/sync-schemas.ts
```

Scans for schema files and generates a consolidated index.

#### Phase 3: TypeScript Build
**Purpose:** Bundle and transpile TypeScript

```bash
tsup
```

**Configuration:**
- Entry points: `hono-server.ts`, `workers/*.worker.ts`
- Target: ES2022
- Format: ESM
- Bundle: ✅ Enabled
- Tree-shaking: ✅ Enabled

**Output:**
```
dist/
├── hono-server.js         (132 KB)
├── workers/
│   ├── webhook.worker.js  (54 KB)
│   └── event-listener.worker.js (2 KB)
└── *.js.map               (source maps)
```

#### Phase 4: Path Alias Resolution
**Purpose:** Resolve `@/` import aliases

```bash
tsc-alias -p tsconfig.json
```

Converts `@/shared/...` → actual relative paths in bundled output.

---

## Module Auto-Discovery

### How It Works

```
┌─────────────────────────────────────────────────┐
│  Build Time                                     │
│                                                 │
│  1. Scan src/modules/                           │
│  2. Find all directories (excluding blacklist)  │
│  3. Generate static imports                     │
│  4. Create MODULE_REGISTRY array                │
│  5. Bundle everything together                  │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│  Runtime                                        │
│                                                 │
│  1. Import MODULE_REGISTRY                      │
│  2. Loop through array                          │
│  3. Mount each module (already imported)        │
│  4. No dynamic imports or file system access    │
└─────────────────────────────────────────────────┘
```

### Module Structure

Each module must follow this structure:

```
src/modules/my-module/
├── http.ts              ← Required: Default export Hono app
├── routes.config.ts     ← Optional: Route configuration
├── handlers/            ← Optional: Route handlers
├── services/            ← Optional: Business logic
├── validations/         ← Optional: Zod schemas
└── types/               ← Optional: TypeScript types
```

### Module Registration

**modules.generated.ts** (auto-generated):
```typescript
// 🤖 AUTO-GENERATED - DO NOT EDIT
import myModuleHttp from '@/modules/my-module/http';

export const MODULE_REGISTRY = [
  { name: 'my-module', http: myModuleHttp }
] as const;
```

**module-router.ts** (static):
```typescript
import { MODULE_REGISTRY } from './modules.generated';

export const registerModuleRoutes = async (app: AppType) => {
  const modules = MODULE_REGISTRY.map(m => m.name);
  await Promise.all(modules.map(name => loadModule(app, name)));
};

const loadModule = async (app: AppType, moduleName: string) => {
  const entry = MODULE_REGISTRY.find(m => m.name === moduleName);
  if (entry?.http) {
    app.route(`/api/${moduleName}`, entry.http);
  }
};
```

---

## File Structure

```
blawby-ts/
├── scripts/
│   ├── build.ts              ← Unified build orchestrator
│   └── sync-schemas.ts       ← Database schema sync
│
├── src/
│   ├── modules/              ← Auto-discovered modules
│   │   ├── intake-payments/
│   │   ├── onboarding/
│   │   ├── practice/
│   │   ├── public/
│   │   └── user-details/
│   │
│   ├── shared/
│   │   └── router/
│   │       ├── module-router.ts        ← Module registration logic
│   │       └── modules.generated.ts    ← Auto-generated registry
│   │
│   └── hono-server.ts        ← Application entry point
│
├── dist/                     ← Build output (bundled)
├── tsup.config.ts            ← Build configuration
├── tsconfig.json             ← TypeScript configuration
└── package.json              ← Scripts and dependencies
```

---

## Workflow

### Development Workflow

```bash
# Start development server (hot-reload)
pnpm run dev

# Development server features:
# - Auto-restart on file changes
# - No build step needed
# - Runs TypeScript directly via tsx
```

### Production Build & Deploy

```bash
# Build for production
pnpm run build

# Start production server
pnpm start
```

### Build Output

```bash
╔════════════════════════════════════════════════╗
║         🚀 Blawby Backend Build System        ║
╚════════════════════════════════════════════════╝

📦 Phase 1: Module Discovery
──────────────────────────────────────────────────
✅ Discovered 5 modules:
   • intake-payments
   • onboarding
   • practice
   • public
   • user-details
✅ Generated: src/shared/router/modules.generated.ts

🔄 Phase 2: Schema Sync
──────────────────────────────────────────────────
✅ Schema index generated successfully!

🔨 Phase 3: TypeScript Build
──────────────────────────────────────────────────
ESM dist/hono-server.js                       132.44 KB
ESM ⚡️ Build success in 214ms

🔗 Phase 4: Path Alias Resolution
──────────────────────────────────────────────────

╔════════════════════════════════════════════════╗
║  ✅ Build completed in 1.14s                    ║
╚════════════════════════════════════════════════╝
```

---

## Adding New Modules

### Step-by-Step Guide

1. **Create module directory:**
   ```bash
   mkdir src/modules/my-new-module
   ```

2. **Create http.ts with default export:**
   ```typescript
   // src/modules/my-new-module/http.ts
   import { Hono } from 'hono';
   
   const app = new Hono();
   
   app.get('/', (c) => {
     return c.json({ message: 'Hello from my-new-module' });
   });
   
   export default app;
   ```

3. **Optional: Add route config:**
   ```typescript
   // src/modules/my-new-module/routes.config.ts
   export const config = {
     middleware: {
       '*': ['requireAuth']  // Apply auth to all routes
     }
   };
   ```

4. **Build and run:**
   ```bash
   pnpm run build  # Module auto-discovered!
   pnpm start
   ```

5. **Test your endpoint:**
   ```bash
   curl http://localhost:3000/api/my-new-module
   ```

### Module Naming Conventions

- Use **kebab-case** for directory names: `my-module` ✅
- Avoid underscores or camelCase: `my_module` ❌ `myModule` ❌
- Names become URL paths: `/api/my-module`

### Excluded Modules

The following module names are excluded from auto-discovery:

```typescript
const EXCLUDED_MODULES = [
  'analytics', 'subscriptions', 'billing', 'payments', 
  'admin', 'clients', 'customers', 'events', 'health', 
  'invoices', 'payouts', 'settings', 'stripe'
];
```

To use these names, update the exclusion list in `scripts/build.ts`.

---

## Technical Decisions

### Why Build-Time Discovery?

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Runtime Discovery** | No rebuild needed | Slower cold starts, can't tree-shake | ❌ |
| **Manual Registration** | Full control | Tedious, error-prone | ❌ |
| **Build-Time Discovery** | Fast runtime, tree-shakeable, no manual work | Requires rebuild | ✅ |

### Why Bundling?

**Without Bundling** (`bundle: false`):
- Multiple files (500+)
- Requires post-build script for `.js` extensions
- Slower cold starts (many file reads)
- ✅ Faster builds
- ❌ Larger deployment

**With Bundling** (`bundle: true`):
- 3 files total
- No post-build scripts needed
- Fast cold starts
- ✅ Tree-shaking enabled
- ✅ Smaller deployment
- ✅ Better for production

**Decision:** Use bundling for production optimization.

### Why Not tsconfig.json for Import Extensions?

TypeScript **intentionally** doesn't rewrite import paths:

```typescript
// You write:
import { foo } from './bar'

// TypeScript outputs (unchanged):
import { foo } from './bar'  // Missing .js!
```

**Solutions:**
1. ❌ Write `.js` in source: `import './bar.js'` (ugly)
2. ❌ Post-build script (maintenance burden)
3. ✅ **Use bundler** (handles everything)

### Why tsup Over Rollup/Webpack?

| Tool | Speed | Config | ESM Support | Verdict |
|------|-------|--------|-------------|---------|
| **tsup** | ⚡️ Fastest | Minimal | ✅ Perfect | ✅ |
| **Rollup** | 🐌 Slower | Complex | ✅ Good | ❌ |
| **Webpack** | 🐌 Slowest | Very Complex | ⚠️ Tricky | ❌ |

**Decision:** tsup for speed and simplicity.

---

## Performance Metrics

### Build Performance

```
Phase 1 (Module Discovery):  ~50ms
Phase 2 (Schema Sync):      ~200ms
Phase 3 (TypeScript Build): ~350ms
Phase 4 (Path Resolution):  ~100ms
────────────────────────────────────
Total:                      ~1.14s
```

### Runtime Performance

```
Server Cold Start:          ~200ms
Module Loading:             Instant (pre-bundled)
Memory Footprint:           ~60MB
```

### Bundle Sizes

```
hono-server.js:             132 KB (gzipped: ~35 KB)
webhook.worker.js:           54 KB (gzipped: ~15 KB)
event-listener.worker.js:     2 KB (gzipped: <1 KB)
```

---

## Future Considerations

### Potential Enhancements

1. **Incremental Builds**
   - Track file changes
   - Only rebuild changed modules
   - Could reduce build time to <500ms

2. **Module Lazy Loading** (if needed)
   - Load modules on first request
   - Reduce initial bundle size
   - Trade-off: More complex, slower first request

3. **Build Caching**
   - Cache module registry between builds
   - Skip Phase 1 if no module changes
   - Potential 30% faster builds

4. **Module Validation**
   - Validate module structure at build time
   - Check for required exports
   - Prevent runtime errors

5. **Module Dependencies**
   - Track inter-module dependencies
   - Optimize import order
   - Better tree-shaking

### Scaling Considerations

**Current:** Works great for 5-50 modules  
**50-100 modules:** No changes needed  
**100-200 modules:** Consider code-splitting  
**200+ modules:** Consider micro-services

---

## Troubleshooting

### Module Not Discovered

**Check:**
1. Directory exists in `src/modules/`
2. Has `http.ts` with default export
3. Name not in `EXCLUDED_MODULES` list
4. Directory name uses kebab-case

### Build Fails

**Common Issues:**
1. TypeScript errors → Fix type errors
2. Import path issues → Check `@/` aliases
3. Missing dependencies → Run `pnpm install`

### Module Not Mounting

**Check:**
1. Build completed successfully
2. `modules.generated.ts` includes your module
3. `http.ts` exports Hono app as default
4. No errors in console logs

---

## References

### Key Files

- `scripts/build.ts` - Build orchestrator
- `src/shared/router/module-router.ts` - Module mounting logic
- `src/shared/router/modules.generated.ts` - Generated registry
- `tsup.config.ts` - Build configuration

### External Documentation

- [tsup Documentation](https://tsup.egoist.dev/)
- [Hono Documentation](https://hono.dev/)
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)

---

## Change Log

### Version 1.0 (October 25, 2025)
- ✅ Implemented build-time module discovery
- ✅ Unified build script with 4 phases
- ✅ Removed runtime dynamic imports
- ✅ Enabled full bundling and tree-shaking
- ✅ Simplified script management
- ✅ Production-ready architecture

---

**Maintained by:** Development Team  
**Last Review:** October 25, 2025  
**Next Review:** January 2026
