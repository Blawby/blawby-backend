# Graphile Worker Migration

**Date:** December 2024  
**Status:** ✅ Completed  
**Migration From:** BullMQ + Redis → Graphile Worker

## Overview

Migrated from BullMQ/Redis-based job queue to Graphile Worker, a PostgreSQL-native job queue system. This eliminates the Redis dependency while maintaining all existing functionality.

## Why Graphile Worker?

### Benefits

1. **Simplified Infrastructure**
   - No Redis dependency - uses existing PostgreSQL database
   - One less service to manage and monitor
   - Reduced infrastructure costs

2. **Automatic Schema Management**
   - Schema auto-creates on first worker start
   - No manual setup or migration scripts needed
   - Idempotent - safe to run multiple times

3. **Built-in Features**
   - Automatic retries with exponential backoff
   - Job deduplication via `jobKey`
   - PostgreSQL-native reliability

4. **Better Integration**
   - Uses same database connection
   - Consistent with existing Drizzle ORM setup
   - Easier monitoring and debugging

## Architecture

### Before (BullMQ + Redis)

```
Stripe Webhook → API → Save to DB → Queue to Redis → Worker Process
                                                      ↓
                                                 Process & Mark Complete
```

### After (Graphile Worker)

```
Stripe Webhook → API → Save to DB → Enqueue to PostgreSQL → Graphile Worker
                                                              ↓
                                                        Process & Mark Complete
```

## Implementation Details

### Components

1. **Queue Manager** (`src/shared/queue/queue.manager.ts`)
   - Replaced BullMQ `Queue` with Graphile Worker `makeWorkerUtils`
   - Maintains same API: `addWebhookJob()`, `addOnboardingWebhookJob()`
   - Uses `jobKey` for deduplication (replaces BullMQ's `jobId`)

2. **Graphile Worker Client** (`src/shared/queue/graphile-worker.client.ts`)
   - Singleton pattern for `makeWorkerUtils`
   - Manages connection lifecycle
   - Provides connection logging

3. **Worker Process** (`src/workers/webhook.worker.ts`)
   - Replaced BullMQ `Worker` with Graphile Worker `run()`
   - Processes all task types: webhooks, onboarding, events
   - Handles graceful shutdown

4. **Task Definitions** (`src/workers/tasks/`)
   - Converted BullMQ job processors to Graphile Worker tasks
   - Each task exports a function matching Graphile Worker's task signature
   - Tasks auto-discovered from `tasks/` directory

### Task Structure

```typescript
// Before: BullMQ job processor
async function processStripeWebhookJob(job: { data: {...} }): Promise<void> {
  // Process job
}

// After: Graphile Worker task
export const processStripeWebhook: Task = async (
  payload: ProcessStripeWebhookPayload,
  helpers,
): Promise<void> => {
  // Process task
};
```

### Job Enqueueing

```typescript
// Before: BullMQ
const queue = getWebhookQueue();
await queue.add('process-webhook', data, { jobId: eventId });

// After: Graphile Worker
const workerUtils = await getWorkerUtils();
await workerUtils.addJob('process-stripe-webhook', data, {
  jobKey: eventId,  // Deduplication
  maxAttempts: 5,
});
```

## Migration Steps

1. ✅ Installed `graphile-worker` package
2. ✅ Created Graphile Worker client utility
3. ✅ Replaced queue manager with Graphile Worker
4. ✅ Converted job processors to task functions
5. ✅ Updated worker process to use Graphile Worker runner
6. ✅ Updated event queue handler
7. ✅ Added package.json scripts
8. ✅ Deprecated Redis client (kept for backward compatibility)
9. ✅ Added comprehensive logging

## Configuration

### Environment Variables

**Removed:**
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

**Added:**
- `GRAPHILE_WORKER_SCHEMA` (optional, defaults to `graphile_worker`)

**Kept:**
- `WEBHOOK_WORKER_CONCURRENCY` (now used by Graphile Worker)
- `WEBHOOK_MAX_RETRIES` (now used by Graphile Worker)

### Package.json Scripts

```json
{
  "worker": "tsx src/workers/webhook.worker.ts",
  "worker:dev": "tsx watch src/workers/webhook.worker.ts",
  "dev:full": "concurrently \"ENABLE_QUEUE=true pnpm run dev\" \"pnpm run worker:dev\""
}
```

## Deployment

### No Setup Required

Graphile Worker automatically creates the schema on first run. No manual setup needed.

**Deployment Steps:**
1. Run database migrations: `pnpm run db:migrate`
2. Start worker: `pnpm run worker`
3. Schema auto-creates on first start

**Railway/Production:**
- Run worker as separate service/container
- Worker auto-creates schema on first start
- No manual schema setup needed

## Monitoring

### Queue Statistics

Query Graphile Worker's `jobs` table directly:

```sql
SELECT 
  COUNT(*) FILTER (WHERE attempts = 0 AND locked_at IS NULL) as waiting,
  COUNT(*) FILTER (WHERE locked_at IS NOT NULL) as active,
  COUNT(*) FILTER (WHERE attempts > 0 AND attempts < max_attempts) as completed,
  COUNT(*) FILTER (WHERE attempts >= max_attempts) as failed
FROM graphile_worker.jobs
WHERE task_identifier = 'process-stripe-webhook';
```

Or use the `getQueueStats()` function:

```typescript
import { getWebhookQueueStats } from '@/shared/queue/queue.manager';

const stats = await getWebhookQueueStats();
console.log(stats); // { waiting: 0, active: 2, completed: 150, failed: 1 }
```

## Logging

Comprehensive logging added throughout:

- **Connection logs**: Database connection status
- **Job queuing logs**: Success/error when enqueueing jobs
- **Job processing logs**: Start, success, error for each job
- **Worker lifecycle logs**: Startup, shutdown, errors

## Backward Compatibility

- Redis client kept (deprecated) for transition period
- Legacy queue functions throw helpful errors pointing to new API
- Event handler registration unchanged

## Files Changed

### New Files
- `src/shared/queue/graphile-worker.client.ts`
- `src/workers/tasks/process-stripe-webhook.ts`
- `src/workers/tasks/process-onboarding-webhook.ts`
- `src/workers/tasks/process-event-handler.ts`
- `src/shared/events/event-handler-registry.ts`

### Modified Files
- `src/shared/queue/queue.manager.ts` - Complete rewrite
- `src/shared/queue/queue.config.ts` - Updated for Graphile Worker
- `src/workers/webhook.worker.ts` - Complete rewrite
- `src/workers/event-listener.worker.ts` - Simplified (no longer a worker)
- `src/shared/events/queue-handler.ts` - Updated to use Graphile Worker
- `src/boot/workers.ts` - Updated (workers run as separate process)
- `package.json` - Added scripts and dependencies

### Deprecated Files
- `src/shared/queue/redis.client.ts` - Marked as deprecated

## Testing

### Manual Testing

1. **Start worker**: `pnpm run worker:dev`
2. **Enqueue job**: Call `addWebhookJob()` from API
3. **Verify processing**: Check logs and database
4. **Test retries**: Force job failure, verify retry
5. **Test deduplication**: Enqueue same job twice, verify only one processed

### Monitoring

- Check `graphile_worker.jobs` table for job status
- Monitor worker logs for processing status
- Verify webhook events marked as processed

## Rollback Plan

If needed, can rollback by:
1. Revert to BullMQ code from git history
2. Restore Redis connection
3. Update environment variables
4. Restart services

## Success Criteria

- ✅ All webhooks process successfully
- ✅ Event handlers queue and process correctly
- ✅ No performance degradation
- ✅ Monitoring and logging work as expected
- ✅ Redis dependency completely removed
- ✅ Zero data loss during migration

## Future Improvements

- Add job priority support
- Add scheduled jobs (cron-like)
- Add job batching for high-volume scenarios
- Add job result storage for audit trail

