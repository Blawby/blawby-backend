# APP_ENV Migration Summary

## Overview

Introduced `APP_ENV` as a separate environment variable from `NODE_ENV` to properly handle staging environments.

### Key Concepts

- **NODE_ENV**: Used by Node.js for runtime optimizations (`development` | `production`)
- **APP_ENV**: Used by application logic (`development` | `staging` | `production`)

This separation allows:
- `NODE_ENV=production` (for Node.js optimizations)
- `APP_ENV=staging` (for application behavior)

## Changes Made

### 1. Created Environment Utility (`src/shared/utils/env.ts`)

New utility functions:
- `getAppEnv()` - Get application environment (falls back to NODE_ENV)
- `getNodeEnv()` - Get Node.js environment
- `isDevelopment()` - Check if in development
- `isStaging()` - Check if in staging
- `isProduction()` - Check if in production
- `isNonDevelopment()` - Check if in staging or production
- `isProductionLike()` - Check if in staging or production

### 2. Updated Files

#### Application Logic (Now uses APP_ENV)

1. **`src/shared/utils/captchaValidation.ts`**
   - ✅ Uses `isDevelopment()` instead of `NODE_ENV === 'production'`
   - ✅ CAPTCHA now works correctly in staging

2. **`src/shared/middleware/requireCaptcha.ts`**
   - ✅ Uses `isDevelopment()` for skip logic
   - ✅ CAPTCHA properly enforced in staging

3. **`src/shared/auth/better-auth.ts`**
   - ✅ Uses `isDevelopment()` for origin check
   - ✅ Origin validation enabled in staging (secure)

4. **`src/boot/event-handlers.ts`**
   - ✅ Uses `isProductionLike()` for email event handlers
   - ✅ Email handlers now work in staging

5. **`src/boot/index.ts`**
   - ✅ Uses `isProductionLike()` for background workers
   - ✅ Workers can run in staging

6. **`src/shared/events/event-publisher.ts`**
   - ✅ Uses `getAppEnv()` for event metadata
   - ✅ Events correctly tagged with staging environment

7. **`src/shared/middleware/responseMiddleware.ts`**
   - ✅ Uses `isProduction()` for request logging
   - ✅ Logging enabled in staging (useful for debugging)

8. **`src/shared/middleware/logger.ts`**
   - ✅ Uses `isProduction()` for debug logging
   - ✅ Debug logs enabled in staging

## Usage

### Environment Variables

```env
# For Node.js optimizations
NODE_ENV=production

# For application logic
APP_ENV=staging
```

### In Code

```typescript
import { isDevelopment, isStaging, isProduction, isProductionLike } from '@/shared/utils/env';

// Check specific environment
if (isDevelopment()) {
  // Development-only code
}

if (isStaging()) {
  // Staging-specific code
}

if (isProduction()) {
  // Production-only code
}

// Check for production-like behavior (staging or production)
if (isProductionLike()) {
  // Enable production features (emails, workers, etc.)
}
```

## Benefits

1. ✅ **CAPTCHA works in staging** - Uses real secret key instead of test key
2. ✅ **Email handlers work in staging** - Can test email functionality
3. ✅ **Workers can run in staging** - Background jobs work correctly
4. ✅ **Proper environment tagging** - Events correctly identify staging
5. ✅ **Flexible configuration** - Can have `NODE_ENV=production` with `APP_ENV=staging`

## Migration Notes

- All existing code continues to work (APP_ENV falls back to NODE_ENV)
- No breaking changes for existing deployments
- Staging deployments should set both:
  - `NODE_ENV=production` (for Node.js optimizations)
  - `APP_ENV=staging` (for application behavior)

## Testing

To test staging behavior locally:

```bash
# Set environment variables
export NODE_ENV=production
export APP_ENV=staging

# Run application
npm run dev
```

The application will:
- Use production Node.js optimizations
- Use staging application logic (CAPTCHA, emails, etc.)
