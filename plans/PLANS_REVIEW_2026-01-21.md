# Plans Review & Cleanup - January 21, 2026

## Executive Summary

This document reviews all planning documents in the blawby-ts project and provides recommendations for cleanup, archival, and updates.

---

## Plans Analysis

### 1. ✅ KEEP & ACTIVE

#### MATTERS_IMPLEMENTATION_PLAN.md (Root Directory → Move to plans/)
- **Status**: Just created
- **Relevance**: High - Active implementation in progress
- **Action**: Move to `plans/MATTERS_IMPLEMENTATION_PLAN.md`
- **Notes**: Agent is currently implementing this plan in background

#### STRIPE_SUBSCRIPTIONS_PLAN.md
- **Status**: Active plan
- **Relevance**: High - Detailed subscription system plan
- **Action**: Keep as-is
- **Notes**: Comprehensive plan for platform billing (separate from Connect)

#### PREFERENCES_MODULE_IMPLEMENTATION.md
- **Status**: Implementation plan
- **Relevance**: Medium-High
- **Action**: Keep but may need status update
- **Notes**: Detailed plan for preferences module migration

#### WEBHOOK_IMPLEMENTATION_PLAN.md
- **Status**: ✅ Production Ready (December 2024)
- **Relevance**: High - Active system
- **Action**: Keep as reference
- **Notes**: Updated for Graphile Worker, marked as production ready

---

### 2. 📦 ARCHIVE (Move to plans/archive/)

#### GRAPHILE_WORKER_MIGRATION.md
- **Status**: ✅ Completed (December 2024)
- **Relevance**: Historical reference only
- **Action**: Move to `plans/archive/GRAPHILE_WORKER_MIGRATION.md`
- **Reason**: Migration completed, no longer an active plan
- **Keep**: Yes - good reference for understanding the migration

#### APP_ENV_MIGRATION.md (Root Directory → Archive)
- **Status**: Completed migration
- **Relevance**: Historical reference only
- **Action**: Move to `plans/archive/APP_ENV_MIGRATION.md`
- **Reason**: Migration completed, useful for understanding the change
- **Keep**: Yes - documents important architectural change

---

### 3. 🗑️ DELETE (Outdated/Redundant)

#### IMPLEMENTATION_STATUS.md
- **Status**: Outdated snapshot (dated 2025-01-27)
- **Relevance**: None - old status report
- **Action**: DELETE
- **Reason**: Point-in-time status report that's now outdated. Implementation status should be tracked in project management tools, not static docs.

---

### 4. 🔄 CONSOLIDATE & UPDATE

#### Stripe Plans (3 files - need consolidation)

**MASTER_IMPLEMENTATION_PLAN.md**
- **Status**: Master plan overview
- **Content**: High-level breakdown of 4 phases
- **Action**: Keep as master index, update with current status
- **Update Needed**: Add links to detailed plans, mark completed phases

**STRIPE_IMPLEMENTATION_PLAN.md**
- **Status**: Detailed implementation plan
- **Content**: Duplicate of master plan with more details (Laravel analysis, schemas)
- **Action**: MERGE into MASTER_IMPLEMENTATION_PLAN.md or DELETE
- **Reason**: Redundant with MASTER_IMPLEMENTATION_PLAN.md
- **Recommendation**: Delete and enhance MASTER_IMPLEMENTATION_PLAN.md instead

---

### 5. 📘 RECLASSIFY (Documentation, not Plans)

#### FRONTEND_API_IMPLEMENTATION.md
- **Status**: API documentation/guide
- **Content**: Better Auth setup, Axios config, API usage examples
- **Action**: Move to `docs/API_INTEGRATION_GUIDE.md`
- **Reason**: This is developer documentation, not an implementation plan
- **Keep**: Yes - valuable documentation for frontend developers

---

## Cleanup Actions Summary

### Immediate Actions

1. **Create Archive Directory**
   ```bash
   mkdir -p plans/archive
   ```

2. **Delete Outdated Files**
   - `plans/IMPLEMENTATION_STATUS.md` ❌

3. **Archive Completed Migrations**
   - `plans/GRAPHILE_WORKER_MIGRATION.md` → `plans/archive/`
   - `APP_ENV_MIGRATION.md` → `plans/archive/`

4. **Move Active Plans**
   - `MATTERS_IMPLEMENTATION_PLAN.md` → `plans/MATTERS_IMPLEMENTATION_PLAN.md`

5. **Consolidate Stripe Plans**
   - Delete `plans/STRIPE_IMPLEMENTATION_PLAN.md`
   - Update `plans/MASTER_IMPLEMENTATION_PLAN.md` with consolidated info

6. **Reclassify Documentation**
   - Create `docs/` directory if needed
   - Move `plans/FRONTEND_API_IMPLEMENTATION.md` → `docs/API_INTEGRATION_GUIDE.md`

---

## Final Directory Structure

```
blawby-ts/
├── plans/
│   ├── MASTER_IMPLEMENTATION_PLAN.md          (Updated - Stripe master plan)
│   ├── STRIPE_SUBSCRIPTIONS_PLAN.md           (Keep - Platform billing)
│   ├── PREFERENCES_MODULE_IMPLEMENTATION.md   (Keep - Active plan)
│   ├── WEBHOOK_IMPLEMENTATION_PLAN.md         (Keep - Reference)
│   ├── MATTERS_IMPLEMENTATION_PLAN.md         (Moved from root)
│   ├── PLANS_REVIEW_2026-01-21.md            (This document)
│   └── archive/
│       ├── GRAPHILE_WORKER_MIGRATION.md
│       └── APP_ENV_MIGRATION.md
├── docs/
│   └── API_INTEGRATION_GUIDE.md               (Moved from plans/)
└── (root clean - no plan files)
```

---

## Status Updates Needed

### MASTER_IMPLEMENTATION_PLAN.md
**Current Status** (as of January 2026):
- Phase 1 (Onboarding): ✅ ~85% Complete
- Phase 2 (Payments): ⚠️ ~40% Complete
- Phase 3 (Subscriptions): ❌ 0% (Use STRIPE_SUBSCRIPTIONS_PLAN.md instead)
- Phase 4 (Payouts): ❌ 0%

**Recommended Updates**:
1. Add "Last Updated" header
2. Mark Phase 1 as "Mostly Complete - See WEBHOOK_IMPLEMENTATION_PLAN.md"
3. Reference STRIPE_SUBSCRIPTIONS_PLAN.md for subscription system
4. Add link to archived GRAPHILE_WORKER_MIGRATION.md
5. Add current priorities and next steps

### PREFERENCES_MODULE_IMPLEMENTATION.md
**Status Check Needed**:
- Has this been implemented?
- If yes, archive it
- If no, update status

### WEBHOOK_IMPLEMENTATION_PLAN.md
**Current Status**: ✅ Production Ready (December 2024)
- No updates needed
- Keep as reference for webhook implementation

---

## Implementation Timeline

| Task | Priority | Estimated Time |
|------|----------|----------------|
| Create archive directory | High | 1 min |
| Delete IMPLEMENTATION_STATUS.md | High | 1 min |
| Archive completed migrations | High | 2 min |
| Move MATTERS_IMPLEMENTATION_PLAN.md | High | 1 min |
| Delete STRIPE_IMPLEMENTATION_PLAN.md | Medium | 1 min |
| Move FRONTEND_API_IMPLEMENTATION.md to docs/ | Medium | 2 min |
| Update MASTER_IMPLEMENTATION_PLAN.md | Medium | 10 min |
| Check PREFERENCES status | Low | 5 min |
| **Total** | | **~25 min** |

---

## Benefits of Cleanup

1. **Clarity**: Clear separation between active plans, archives, and documentation
2. **Maintainability**: Easier to find relevant planning documents
3. **Accuracy**: Remove outdated snapshots that could mislead developers
4. **Organization**: Logical structure with plans/, docs/, and plans/archive/
5. **Discoverability**: Documentation properly categorized for frontend developers

---

## Recommendations

### For Future Plans

1. **Use Status Headers**: All plans should have a status header:
   ```markdown
   # Plan Title
   **Status**: Draft | In Progress | Completed | Archived
   **Last Updated**: YYYY-MM-DD
   ```

2. **Archive After Completion**: Move completed plans to `plans/archive/` directory

3. **Separate Docs from Plans**:
   - Plans = Implementation roadmaps (temporary)
   - Docs = Developer guides (permanent)

4. **Regular Reviews**: Review plans quarterly to:
   - Archive completed plans
   - Delete outdated snapshots
   - Update status of active plans

5. **Use Project Management Tools**: Status reports should live in project management tools (GitHub Projects, Linear, etc.), not as static markdown files

---

## Next Steps

1. Execute cleanup actions listed above
2. Update MASTER_IMPLEMENTATION_PLAN.md with current status
3. Verify PREFERENCES_MODULE_IMPLEMENTATION.md status
4. Create docs/README.md to index documentation
5. Add .gitignore rule for temporary planning files if needed

---

## Questions for Review

1. Has the preferences module been implemented? (Check PREFERENCES_MODULE_IMPLEMENTATION.md)
2. Should we keep both Stripe plans or consolidate?
3. Are there any other planning files outside the plans/ directory?
4. Should we create a CONTRIBUTING.md that references the plans/ structure?

---

**Review Completed**: January 21, 2026
**Next Review Due**: April 2026
