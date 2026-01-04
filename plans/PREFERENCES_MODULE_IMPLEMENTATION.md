# Preferences Module Implementation Plan

## Overview

Rename `user-details` module to `preferences` and extend it with JSONB category columns for user preferences, settings, and onboarding data. Keep session API lean by fetching preferences separately.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   On app load:                                                   │
│   └─ GET /api/auth/get-session                                   │
│      → Returns: user (+ primary_workspace), session, org         │
│      → Uses: active_organization_id for practice routing         │
│                                                                  │
│   On settings page:                                              │
│   └─ GET /api/preferences                                        │
│      → Returns: all preferences (general, notifications, etc.)   │
│                                                                  │
│   On settings update:                                            │
│   └─ PUT /api/preferences/:category                              │
│      → Updates: specific JSONB column                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. Users Table (Better Auth + 1 additionalField)

Add only `primary_workspace` to track user's default workspace preference.

**Drizzle Schema:**
```typescript
// src/schema/better-auth-schema.ts
export const users = pgTable('users', {
  // ... existing fields
  primaryWorkspace: text('primary_workspace'), // 'client' | 'practice'
});
```

### 2. Preferences Table (renamed from user_details)

**Drizzle Schema:**
```typescript
// src/modules/preferences/schema/preferences.schema.ts
export const preferences = pgTable(
  'preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    
    // Stripe integration
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    
    // Profile fields (flat)
    phone: text('phone'),
    dob: date('dob'),
    
    // JSONB category columns
    general: jsonb('general').$type<GeneralPreferences>().default({}),
    notifications: jsonb('notifications').$type<NotificationPreferences>().default({}),
    security: jsonb('security').$type<SecurityPreferences>().default({}),
    account: jsonb('account').$type<AccountPreferences>().default({}),
    onboarding: jsonb('onboarding').$type<OnboardingPreferences>().default({}),
    
    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('preferences_user_idx').on(table.userId),
    index('preferences_stripe_customer_idx').on(table.stripeCustomerId),
    index('preferences_created_at_idx').on(table.createdAt),
  ],
);
```

### 3. JSONB Column Structures

#### `general` column
```typescript
{
  theme?: string;              // 'light' | 'dark' | 'system'
  accent_color?: string;       // hex color
  language?: string;           // 'en' | 'es' | etc.
  spoken_language?: string;    // for voice/audio features
  timezone?: string;           // 'America/New_York'
  date_format?: string;        // 'MM/DD/YYYY' | 'DD/MM/YYYY'
  time_format?: string;        // '12h' | '24h'
}
```

#### `notifications` column
```typescript
{
  responses_push?: boolean;
  tasks_push?: boolean;
  tasks_email?: boolean;
  messaging_push?: boolean;
}
```

#### `security` column
```typescript
{
  two_factor_enabled?: boolean;
  email_notifications?: boolean;
  login_alerts?: boolean;
  session_timeout?: number;    // minutes
}
```

#### `account` column
```typescript
{
  selected_domain?: string | null;
  custom_domains?: string | null;
  receive_feedback_emails?: boolean;
  marketing_emails?: boolean;
  security_alerts?: boolean;
}
```

#### `onboarding` column
```typescript
{
  birthday?: string;           // ISO date string
  primary_use_case?: string;
  use_case_additional_info?: string;
  completed?: boolean;
}
```

---

## API Endpoints

### GET /api/preferences
Returns all preferences for the current user.

**Response:**
```json
{
  "data": {
    "phone": "+1234567890",
    "dob": "1990-01-15",
    "general": { "theme": "dark", "language": "en" },
    "notifications": { "tasks_push": true },
    "security": { "two_factor_enabled": false },
    "account": { "marketing_emails": false },
    "onboarding": { "completed": true }
  }
}
```

### GET /api/preferences/:category
Returns specific category preferences.

**Categories:** `general`, `notifications`, `security`, `account`, `onboarding`, `profile`

**Response:**
```json
{
  "data": {
    "theme": "dark",
    "language": "en",
    "timezone": "America/New_York"
  }
}
```

### PUT /api/preferences/:category
Updates specific category preferences.

**Request:**
```json
{
  "theme": "dark",
  "language": "en"
}
```

**Response:**
```json
{
  "data": {
    "theme": "dark",
    "language": "en",
    "timezone": "America/New_York"
  }
}
```

### PUT /api/preferences/profile
Updates flat profile fields (phone, dob).

**Request:**
```json
{
  "phone": "+1234567890",
  "dob": "1990-01-15"
}
```

---

## Implementation Steps

### Phase 1: Database Migration

1. **Rename module directory first**
   - `src/modules/user-details/` → `src/modules/preferences/`
   - This ensures schema file is in the right location

2. **Update Drizzle schema to rename table**
   - Update `src/modules/preferences/schema/preferences.schema.ts`
   - Change table name from `'user_details'` to `'preferences'`
   - Add new JSONB columns: `general`, `notifications`, `security`, `account`, `onboarding`
   - Keep `product_usage` column temporarily (will migrate data then remove)
   - Update indexes to use new table name

3. **Update users table schema**
   - Update `src/schema/better-auth-schema.ts` to add `primaryWorkspace` column

4. **Generate Drizzle migration**
   ```bash
   pnpm run db:generate
   ```
   - Drizzle will detect:
     - Table rename: `user_details` → `preferences` (via schema change)
     - New columns: `general`, `notifications`, `security`, `account`, `onboarding`
     - New column in users: `primary_workspace`
     - Index updates (old indexes dropped, new ones created)

5. **Run schema migration**
   ```bash
   pnpm run db:migrate
   ```
   - This renames the table and adds new columns
   - Existing data is preserved

6. **Create data migration script using Drizzle**
   - Use Drizzle to migrate `product_usage` to `onboarding` JSONB column
   - Run after schema migration

7. **Remove old `product_usage` column**
   - Update schema to remove `product_usage` field
   - Generate and run another migration to drop the column

8. **Configure Better Auth `additionalFields`**
   - Add `primaryWorkspace` to Better Auth config

### Phase 2: Rename Module (Do this FIRST, before Phase 1)

1. **Rename directory**
   - `src/modules/user-details/` → `src/modules/preferences/`

2. **Rename files**
   - `user-details.schema.ts` → `preferences.schema.ts`
   - `user-details.service.ts` → `preferences.service.ts`
   - `user-details.validation.ts` → `preferences.validation.ts`

3. **Update all imports across codebase**
   - Search for `@/modules/user-details` and replace with `@/modules/preferences`
   - Search for `user-details` imports and update
   - Update any references in `src/schema/index.ts`

### Phase 3: Update Schema

1. **Update Drizzle schema** (`src/modules/preferences/schema/preferences.schema.ts`)
   ```typescript
   export const preferences = pgTable(
     'preferences', // Table name changed from 'user_details'
     {
       id: uuid('id').primaryKey().defaultRandom(),
       userId: text('user_id')
         .notNull()
         .unique()
         .references(() => users.id, { onDelete: 'cascade' }),
       stripeCustomerId: text('stripe_customer_id').notNull().unique(),
       
       // Profile fields (flat)
       phone: text('phone'),
       dob: date('dob'),
       
       // JSONB category columns (new)
       general: jsonb('general').$type<GeneralPreferences>().default({}),
       notifications: jsonb('notifications').$type<NotificationPreferences>().default({}),
       security: jsonb('security').$type<SecurityPreferences>().default({}),
       account: jsonb('account').$type<AccountPreferences>().default({}),
       onboarding: jsonb('onboarding').$type<OnboardingPreferences>().default({}),
       
       // Old field (temporary - will be removed after data migration)
       productUsage: jsonb('product_usage').$type<ProductUsage[]>(),
       
       // Metadata
       createdAt: timestamp('created_at').defaultNow().notNull(),
       updatedAt: timestamp('updated_at')
         .defaultNow()
         .notNull()
         .$onUpdate(() => new Date()),
     },
     (table) => [
       index('preferences_user_idx').on(table.userId),
       index('preferences_stripe_customer_idx').on(table.stripeCustomerId),
       index('preferences_created_at_idx').on(table.createdAt),
     ],
   );
   ```

2. **Define TypeScript types for each JSONB column**
   - Create type definitions for `GeneralPreferences`, `NotificationPreferences`, etc.

### Phase 4: Update Validation Schemas

1. **Create category-specific validation schemas**
   ```typescript
   export const generalPreferencesSchema = z.object({
     theme: z.enum(['light', 'dark', 'system']).optional(),
     accent_color: z.string().optional(),
     language: z.string().optional(),
     // ...
   });
   
   export const notificationPreferencesSchema = z.object({
     responses_push: z.boolean().optional(),
     tasks_push: z.boolean().optional(),
     // ...
   });
   // ... etc for each category
   ```

### Phase 5: Update Service Layer

1. **Create category-based update functions using Drizzle**
   ```typescript
   import { db } from '@/shared/database';
   import { preferences } from './schema/preferences.schema';
   import { eq } from 'drizzle-orm';
   
   export const getPreferences = async (userId: string): Promise<Preferences> => {
     const result = await db
       .select()
       .from(preferences)
       .where(eq(preferences.userId, userId))
       .limit(1);
     
     return result[0];
   };
   
   export const getPreferencesByCategory = async (
     userId: string,
     category: PreferenceCategory
   ): Promise<CategoryData> => {
     const result = await db
       .select({ [category]: preferences[category] })
       .from(preferences)
       .where(eq(preferences.userId, userId))
       .limit(1);
     
     return result[0]?.[category] || {};
   };
   
   export const updatePreferencesByCategory = async (
     userId: string,
     category: PreferenceCategory,
     data: Record<string, unknown>
   ): Promise<CategoryData> => {
     const result = await db
       .update(preferences)
       .set({ 
         [category]: data,
         updatedAt: new Date(),
       })
       .where(eq(preferences.userId, userId))
       .returning();
     
     return result[0]?.[category] || {};
   };
   
   export const updateProfileFields = async (
     userId: string,
     data: { phone?: string; dob?: string }
   ): Promise<Preferences> => {
     const result = await db
       .update(preferences)
       .set({
         ...data,
         updatedAt: new Date(),
       })
       .where(eq(preferences.userId, userId))
       .returning();
     
     return result[0];
   };
   ```

### Phase 6: Update HTTP Routes

1. **Update route handlers**
   ```typescript
   // GET /api/preferences - Get all preferences
   app.get('/', getPreferences);
   
   // GET /api/preferences/:category - Get category
   app.get('/:category', getPreferencesByCategory);
   
   // PUT /api/preferences/:category - Update category
   app.put('/:category', validateCategory, updatePreferencesByCategory);
   ```

### Phase 7: Configure Better Auth

1. **Add `primary_workspace` to additionalFields**
   ```typescript
   // src/shared/auth/better-auth.ts
   user: {
     additionalFields: {
       primaryWorkspace: {
         type: ["client", "practice"],
         required: false,
       },
     }
   }
   ```

2. **Update Drizzle schema for users table**
   ```typescript
   // src/schema/better-auth-schema.ts
   export const users = pgTable('users', {
     // ... existing fields
     primaryWorkspace: text('primary_workspace'),
   });
   ```

### Phase 8: Update Schema Exports

1. **Update `src/schema/index.ts`**
   - Remove old user-details export
   - Add preferences export

2. **Update any other imports across the codebase**

---

## Data Migration Script (Using Drizzle)

After schema migration (table renamed to `preferences`), migrate existing `product_usage` data:

```typescript
// scripts/migrate-preferences-data.ts
import { db } from '@/shared/database';
import { preferences } from '@/modules/preferences/schema/preferences.schema';
import { eq, sql, isNotNull } from 'drizzle-orm';

async function migratePreferencesData() {
  // Get all preferences records that have product_usage
  const existingRecords = await db
    .select({
      userId: preferences.userId,
      productUsage: sql<any>`product_usage`, // Access old column via SQL
    })
    .from(preferences)
    .where(isNotNull(sql`product_usage`));
  
  console.log(`Found ${existingRecords.length} records to migrate`);
  
  for (const record of existingRecords) {
    // Migrate product_usage to onboarding JSONB
    const onboardingData = record.productUsage 
      ? { product_usage: record.productUsage }
      : {};
    
    // Update preferences table with migrated data
    await db
      .update(preferences)
      .set({
        onboarding: onboardingData,
      })
      .where(eq(preferences.userId, record.userId));
    
    console.log(`Migrated preferences for user: ${record.userId}`);
  }
  
  console.log(`✅ Migrated ${existingRecords.length} preferences records`);
}

migratePreferencesData()
  .then(() => {
    console.log('✅ Data migration complete');
    console.log('⚠️  Next step: Remove product_usage column from schema and generate migration');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
```

**Run migration:**
```bash
tsx scripts/migrate-preferences-data.ts
```

**After data migration:**
1. Remove `productUsage` field from `preferences.schema.ts`
2. Generate migration: `pnpm run db:generate`
3. Run migration: `pnpm run db:migrate`
4. This will drop the `product_usage` column

---

## File Changes Summary

### Renamed Files
| Old Path | New Path |
|----------|----------|
| `src/modules/user-details/` | `src/modules/preferences/` |
| `src/modules/user-details/schema/user-details.schema.ts` | `src/modules/preferences/schema/preferences.schema.ts` |
| `src/modules/user-details/services/user-details.service.ts` | `src/modules/preferences/services/preferences.service.ts` |
| `src/modules/user-details/validations/user-details.validation.ts` | `src/modules/preferences/validations/preferences.validation.ts` |
| `src/modules/user-details/handlers.ts` | `src/modules/preferences/handlers.ts` |
| `src/modules/user-details/http.ts` | `src/modules/preferences/http.ts` |
| `src/modules/user-details/index.ts` | `src/modules/preferences/index.ts` |
| `src/modules/user-details/routes.config.ts` | `src/modules/preferences/routes.config.ts` |

### Modified Files
| File | Changes |
|------|---------|
| `src/schema/index.ts` | Update export path |
| `src/schema/better-auth-schema.ts` | Add `primaryWorkspace` column |
| `src/shared/auth/better-auth.ts` | Add `additionalFields` config |
| Any files importing from `user-details` | Update import paths |

---

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] GET /api/preferences returns all preferences
- [ ] GET /api/preferences/:category returns specific category
- [ ] PUT /api/preferences/:category updates only that category
- [ ] PUT /api/preferences/profile updates phone and dob
- [ ] Better Auth session includes `primary_workspace`
- [ ] Existing Stripe customer flow still works
- [ ] All imports updated and working

---

## Rollback Plan

1. **Keep old schema files** in git history (don't delete, just rename)
2. **Don't drop `product_usage` column** until data migration is verified
3. **Table rename is reversible** - Drizzle can rename back if needed:
   - Revert schema to use `'user_details'` table name
   - Generate migration to rename back
4. **Data preservation** - All existing data is preserved during rename
5. **Keep old module code** in a backup branch until verified
6. **If rollback needed:**
   ```bash
   # 1. Revert schema files to old names
   # 2. Generate migration to rename table back
   # 3. Revert module directory rename
   ```

---

## Timeline Estimate

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Database Migration | 30 mins |
| Phase 2: Rename Module | 15 mins |
| Phase 3: Update Schema | 30 mins |
| Phase 4: Update Validations | 30 mins |
| Phase 5: Update Service | 45 mins |
| Phase 6: Update Routes | 30 mins |
| Phase 7: Configure Better Auth | 15 mins |
| Phase 8: Update Exports | 15 mins |
| Testing | 30 mins |
| **Total** | **~4 hours** |

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Database Migration)
3. Proceed through phases sequentially
4. Test after each phase

