# Matters Module Implementation Plan

## Overview
This document outlines the implementation plan for the Matters module in the blawby-ts TypeScript project, based on the existing implementation in the blawby PHP/Laravel project.

## Source Analysis (PHP/Laravel Implementation)

### Core Matter Model
- **Primary Key**: ULID
- **Fields**:
  - `team_id` (ULID, foreign key to teams) → Maps to `organization_id` in TS
  - `customer_id` (ID, foreign key to users/customers)
  - `title` (string)
  - `description` (text, nullable)
  - `billing_type` (enum: 'hourly', 'fixed', 'contingency')
  - `total_fixed_price` (integer, cents, nullable)
  - `contingency_percentage` (float, nullable)
  - `settlement_amount` (integer, cents, nullable)
  - `practice_area_id` (ID, foreign key)
  - `admin_hourly_rate` (integer, cents, nullable)
  - `attorney_hourly_rate` (integer, cents, nullable)
  - `payment_frequency` (enum: 'project', 'milestone', nullable)
  - `status` (enum: 'draft', 'active')
  - Soft deletes enabled

### Related Models

#### 1. MatterNote
- `matter_id` (ULID)
- `content` (text)
- `user_id` (ID)
- `created_at`, `updated_at`

#### 2. MatterTimeEntry
- `matter_id` (ULID)
- `user_id` (ID)
- `start_time` (datetime)
- `end_time` (datetime)
- `duration` (integer, seconds)
- `description` (text, nullable)
- `billable` (boolean)

#### 3. MatterExpense
- `matter_id` (ULID)
- `description` (string)
- `amount` (integer, cents)
- `date` (date)
- `billable` (boolean)

#### 4. MatterMilestone
- `matter_id` (ULID)
- `description` (string)
- `amount` (integer, cents)
- `due_date` (date)
- `status` (enum: 'pending', 'in_progress', 'completed', 'overdue')
- `order` (integer)

#### 5. MatterFile
- `matter_id` (ULID)
- `name` (string)
- `path` (string)
- `size` (integer)
- `mime_type` (string)

### Relationships
- **Assignees**: Many-to-many with Users through `matter_user` pivot table
- **Customer**: Belongs to User
- **Practice Area**: Belongs to PracticeArea
- **Team**: Belongs to Team (Organization in TS)

### Activity Log Pattern
The PHP implementation computes activity logs in the frontend by aggregating:
- Matter creation event
- Time entries
- Expenses
- Notes
- Milestones

This is displayed in a unified "Recent Activity" section on the matter show page.

---

## Implementation Plan for TypeScript Project

### Phase 1: Database Schema Setup

#### 1.1 Create Matter Schema
**File**: `src/modules/matters/database/schema/matters.schema.ts`

```typescript
- Define matters table with UUID primary key
- Map team_id → organization_id
- All billing and rate fields
- Soft delete support
- Indexes for organization_id, customer_id, status, practice_area_id
- Relations to organizations, users (customer), practice_areas
```

#### 1.2 Create Related Schemas

**MatterNote**: `src/modules/matters/database/schema/matter-notes.schema.ts`
**MatterTimeEntry**: `src/modules/matters/database/schema/matter-time-entries.schema.ts`
**MatterExpense**: `src/modules/matters/database/schema/matter-expenses.schema.ts`
**MatterMilestone**: `src/modules/matters/database/schema/matter-milestones.schema.ts`

Note: MatterFile functionality is already covered by the uploads module with `matterId` field.

#### 1.3 Create Pivot Table Schema
**File**: `src/modules/matters/database/schema/matter-assignees.schema.ts`
- Many-to-many relationship between matters and users
- Unique constraint on (matter_id, user_id)

#### 1.4 Create Practice Areas Schema
**File**: `src/modules/matters/database/schema/practice-areas.schema.ts`
- `id` (UUID)
- `organization_id` (UUID)
- `name` (string)
- `description` (text, nullable)
- `created_at`, `updated_at`

#### 1.5 Schema Index Export
**File**: `src/modules/matters/database/schema/index.ts`
Export all schema tables and types.

### Phase 2: Database Queries

Create query files for each entity:
- `src/modules/matters/database/queries/matters.queries.ts`
- `src/modules/matters/database/queries/matter-notes.queries.ts`
- `src/modules/matters/database/queries/matter-time-entries.queries.ts`
- `src/modules/matters/database/queries/matter-expenses.queries.ts`
- `src/modules/matters/database/queries/matter-milestones.queries.ts`
- `src/modules/matters/database/queries/practice-areas.queries.ts`

Each query file should include:
- CRUD operations
- List/filter operations
- Relationship loading
- Scoped queries (by organization, status, etc.)

### Phase 3: Validations

**File**: `src/modules/matters/validations/matters.validation.ts`

Define Zod schemas for:
- `createMatterSchema`
- `updateMatterSchema`
- `matterIdParamSchema`
- `listMattersQuerySchema` (with filters: status, practice_area_id, customer_id, assignee_id)

**File**: `src/modules/matters/validations/matter-notes.validation.ts`
- `createMatterNoteSchema`
- `updateMatterNoteSchema`

**File**: `src/modules/matters/validations/matter-time-entries.validation.ts`
- `createMatterTimeEntrySchema`
- `updateMatterTimeEntrySchema`

**File**: `src/modules/matters/validations/matter-expenses.validation.ts`
- `createMatterExpenseSchema`
- `updateMatterExpenseSchema`

**File**: `src/modules/matters/validations/matter-milestones.validation.ts`
- `createMatterMilestoneSchema`
- `updateMatterMilestoneSchema`
- `reorderMilestonesSchema`

**File**: `src/modules/matters/validations/practice-areas.validation.ts`
- `createPracticeAreaSchema`
- `updatePracticeAreaSchema`

### Phase 4: Services

#### Core Matter Service
**File**: `src/modules/matters/services/matters.service.ts`

Functions:
- `createMatter(data, user, headers)` - Create matter with assignees and milestones
- `getMatterById(matterId, user, headers)` - Get matter with all relations
- `listMatters(organizationId, filters, user, headers)` - List with filtering/pagination
- `updateMatter(matterId, data, user, headers)` - Update matter
- `deleteMatter(matterId, user, headers)` - Soft delete matter
- `getMatterCounts(organizationId, user, headers)` - Get counts by status

#### Related Services
- `src/modules/matters/services/matter-notes.service.ts`
- `src/modules/matters/services/matter-time-entries.service.ts`
- `src/modules/matters/services/matter-expenses.service.ts`
- `src/modules/matters/services/matter-milestones.service.ts`
- `src/modules/matters/services/practice-areas.service.ts`

Each service should include:
- CRUD operations
- Calculation utilities (e.g., billable amounts, durations)
- Authorization checks
- Event emission for activity tracking

### Phase 5: Activity Log Implementation

**Option A: Frontend Computed (Like PHP)**
- Aggregate from notes, time entries, expenses, milestones in frontend
- No separate table needed
- Return all related data with matter GET request

**Option B: Backend Activity Log Table (Recommended)**
**File**: `src/modules/matters/database/schema/matter-activity-log.schema.ts`

Fields:
- `id` (UUID)
- `matter_id` (UUID)
- `user_id` (UUID, nullable)
- `action` (enum: 'created', 'updated', 'note_added', 'time_entry_added', 'expense_added', 'milestone_created', 'milestone_completed', etc.)
- `description` (text) - Human-readable description
- `metadata` (jsonb) - Additional context
- `created_at`

Benefits:
- Centralized activity tracking
- Can track matter updates and other events not captured by related entities
- Easier querying and pagination
- Better audit trail

**File**: `src/modules/matters/services/matter-activity.service.ts`
- `logActivity(matterId, action, user, metadata)`
- `getMatterActivity(matterId, pagination)`

### Phase 6: HTTP Routes & Handlers

**File**: `src/modules/matters/http.ts`

Routes:
```
GET    /api/matters                        - List matters (with filters)
POST   /api/matters                        - Create matter
GET    /api/matters/:uuid                  - Get matter by ID
PUT    /api/matters/:uuid                  - Update matter
DELETE /api/matters/:uuid                  - Delete matter
GET    /api/matters/:uuid/activity         - Get matter activity log

# Notes
POST   /api/matters/:uuid/notes            - Create note
GET    /api/matters/:uuid/notes            - List notes
PUT    /api/matters/:uuid/notes/:noteId    - Update note
DELETE /api/matters/:uuid/notes/:noteId    - Delete note

# Time Entries
POST   /api/matters/:uuid/time-entries     - Create time entry
GET    /api/matters/:uuid/time-entries     - List time entries
PUT    /api/matters/:uuid/time-entries/:id - Update time entry
DELETE /api/matters/:uuid/time-entries/:id - Delete time entry

# Expenses
POST   /api/matters/:uuid/expenses         - Create expense
GET    /api/matters/:uuid/expenses         - List expenses
PUT    /api/matters/:uuid/expenses/:id     - Update expense
DELETE /api/matters/:uuid/expenses/:id     - Delete expense

# Milestones
POST   /api/matters/:uuid/milestones       - Create milestone
GET    /api/matters/:uuid/milestones       - List milestones
PUT    /api/matters/:uuid/milestones/:id   - Update milestone
DELETE /api/matters/:uuid/milestones/:id   - Delete milestone
POST   /api/matters/:uuid/milestones/reorder - Reorder milestones

# Practice Areas
GET    /api/practice-areas                 - List practice areas
POST   /api/practice-areas                 - Create practice area
PUT    /api/practice-areas/:id             - Update practice area
DELETE /api/practice-areas/:id             - Delete practice area
```

**File**: `src/modules/matters/routes.ts` (Optional)
- OpenAPI route definitions if using automatic docs

### Phase 7: Types

**File**: `src/modules/matters/types/matter.types.ts`

Export TypeScript types for:
- Matter with relations
- Matter list response
- Activity log entries
- Billing calculations
- Filter/query types

### Phase 8: Module Registration

**File**: `src/modules/matters/index.ts`
Export the matters app for registration in main app.

**Update**: Main app configuration to mount matters routes at `/api/matters`

### Phase 9: Database Migration

Create Drizzle migration:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Run schema sync:
```bash
pnpm run schemas:sync
```

This will auto-update `src/schema/index.ts` with the new schemas.

### Phase 10: Testing (Optional but Recommended)

Create test files:
- `src/modules/matters/__tests__/matters.service.test.ts`
- `src/modules/matters/__tests__/matters.http.test.ts`

---

## Key Differences from PHP Implementation

1. **Team → Organization**: TS project uses organizations instead of teams
2. **IDs**: PHP uses ULIDs, TS project uses UUIDs
3. **Activity Log**: Recommend creating a dedicated activity log table instead of frontend aggregation
4. **File Uploads**: Already handled by existing uploads module with `matterId` field
5. **Database ORM**: Drizzle instead of Eloquent
6. **Validation**: Zod instead of Laravel Form Requests

---

## Dependencies Checklist

Before implementation, verify these exist:
- [ ] Practice areas table/schema (needs to be created)
- [ ] Organizations schema (exists via better-auth)
- [ ] Users schema (exists via better-auth)
- [ ] Uploads module (exists, already has `matterId` field)

---

## Implementation Order

1. **Practice Areas** (dependency)
2. **Matters Core** (main table)
3. **Matter Assignees** (pivot table)
4. **Matter Notes**
5. **Matter Time Entries**
6. **Matter Expenses**
7. **Matter Milestones**
8. **Matter Activity Log**
9. **Services & Business Logic**
10. **HTTP Routes & Handlers**
11. **Testing**

---

## Estimated File Count

- **Schemas**: 7 files
- **Queries**: 6 files
- **Validations**: 6 files
- **Services**: 7 files
- **Types**: 1 file
- **HTTP**: 1 file
- **Routes** (optional): 1 file
- **Index**: 1 file

**Total**: ~30 files

---

## Next Steps

1. Review and approve this plan
2. Create practice areas module first (if not exists)
3. Begin with schema creation
4. Implement incrementally following the order above
5. Test each component as it's built
