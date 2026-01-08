# Stripe Webhook Implementation - Graphile Worker

**Last Updated:** December 2024  
**Status:** ✅ Production Ready  
**Queue System:** Graphile Worker (PostgreSQL-based)

**Note:** This project uses Graphile Worker (PostgreSQL-based) instead of BullMQ/Redis. See [GRAPHILE_WORKER_MIGRATION.md](./GRAPHILE_WORKER_MIGRATION.md) for migration details.

## Architecture Overview

```
Stripe → Webhook Endpoint → Verify Signature → Save to DB → Enqueue to PostgreSQL → Return 200 OK
                                                                          ↓
                                                            Graphile Worker Process (async)
                                                                          ↓
                                                            Fetch → Process → Mark Complete
```

**Key Principles:**
- Save webhook BEFORE queueing (data safety)
- Check idempotency BEFORE saving (prevent duplicates)
- Respond <100ms (Stripe requirement)
- Process async in worker (scalability)
- Auto-retry with exponential backoff (reliability)

---

## Phase 1: Dependencies & Setup

### Install Packages
```bash
pnpm add graphile-worker
```

### Environment Variables
```env
# Database (required for Graphile Worker)
DATABASE_URL="postgresql://user:password@localhost:5432/blawby"

# Graphile Worker (optional)
GRAPHILE_WORKER_SCHEMA="graphile_worker"  # Defaults to 'graphile_worker'

# Stripe
STRIPE_WEBHOOK_SECRET=whsec_...

# Worker
WEBHOOK_WORKER_CONCURRENCY=5  # Concurrent job processing
WEBHOOK_MAX_RETRIES=5  # Max retry attempts
```

---

## Phase 2: Database Schema

### Migration: `webhook_events` Table

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false NOT NULL,
  processed_at TIMESTAMP,
  error TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  received_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Critical indexes
CREATE UNIQUE INDEX idx_webhook_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_processed ON webhook_events(processed, created_at);
CREATE INDEX idx_webhook_event_type ON webhook_events(event_type);
```

**Why this schema:**
- `stripe_event_id` UNIQUE: Idempotency (prevent duplicate processing)
- `processed` boolean: Track processing state
- `payload` JSONB: Store full Stripe event for replay
- `retry_count`: Track retry attempts
- Indexes: Fast lookups for unprocessed webhooks

### Drizzle Schema

**File:** `src/modules/billing/schemas/webhook.schema.ts`

Create schema matching the migration with proper TypeScript types.

### Repository Pattern

**File:** `src/modules/billing/repositories/webhook.repository.ts`

Implement methods:
- `existsByStripeEventId(stripeEventId: string): Promise<boolean>` - Idempotency check
- `create(event: Stripe.Event)` - Save webhook
- `findById(id: string)` - Fetch webhook
- `markProcessed(id: string)` - Mark complete
- `markFailed(id: string, error: Error)` - Mark failed + increment retry

---

## Phase 3: Graphile Worker Setup

**Understanding Graphile Worker Architecture:**

```
API Server (produces jobs)          Worker Process (consumes jobs)
       ↓                                      ↓
   workerUtils.addJob()              Graphile Worker.run()
       ↓                                      ↓
       └─────────→  PostgreSQL  ←─────────────┘
              (graphile_worker schema)
```

- **WorkerUtils**: Used in API to ADD jobs (producer)
- **Worker Runner**: Separate process to PROCESS jobs (consumer)
- **PostgreSQL**: Job queue storage (same database as application)

### Graphile Worker Client

**File:** `src/shared/queue/graphile-worker.client.ts`

```typescript
import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';

let workerUtils: WorkerUtils | null = null;

export const getWorkerUtils = async (): Promise<WorkerUtils> => {
  if (!workerUtils) {
    const connectionString = process.env.DATABASE_URL;
    const schema = process.env.GRAPHILE_WORKER_SCHEMA || 'graphile_worker';
    
    workerUtils = await makeWorkerUtils({
      connectionString,
      schema,
    });
  }
  return workerUtils;
};
```

**Key Points:**
- Uses existing `DATABASE_URL` - no separate Redis needed
- Schema auto-creates on first worker start
- Singleton pattern ensures single connection

### Queue Configuration

**File:** `src/shared/queue/queue.config.ts`

Define task names and configuration:

```typescript
export const TASK_NAMES = {
  PROCESS_STRIPE_WEBHOOK: 'process-stripe-webhook',
  PROCESS_ONBOARDING_WEBHOOK: 'process-onboarding-webhook',
  PROCESS_EVENT_HANDLER: 'process-event-handler',
} as const;

export const graphileWorkerConfig = {
  maxAttempts: Number(process.env.WEBHOOK_MAX_RETRIES) || 5,
  concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5,
  schema: process.env.GRAPHILE_WORKER_SCHEMA || 'graphile_worker',
} as const;
```

**Retry Behavior:**
- Automatic retries with exponential backoff
- Configurable `maxAttempts` per job
- Failed jobs stored in `graphile_worker.jobs` table

### Queue Manager

**File:** `src/shared/queue/queue.manager.ts`

Functions to enqueue jobs:

```typescript
import { getWorkerUtils } from './graphile-worker.client';
import { TASK_NAMES, graphileWorkerConfig } from './queue.config';

export const addWebhookJob = async (
  webhookId: string,
  eventId: string,
  eventType: string,
): Promise<void> => {
  const workerUtils = await getWorkerUtils();
  
  await workerUtils.addJob(
    TASK_NAMES.PROCESS_STRIPE_WEBHOOK,
    { webhookId, eventId, eventType },
    {
      jobKey: eventId, // Deduplication (replaces BullMQ's jobId)
      maxAttempts: graphileWorkerConfig.maxAttempts,
    },
  );
};
```

**Key Points:**
- `workerUtils.addJob()` adds jobs to PostgreSQL queue
- `jobKey` provides deduplication (same as BullMQ's `jobId`)
- No separate Redis connection needed

---

## Phase 4: Webhook Endpoint

### Route Handler

**File:** `src/modules/billing/routes/webhooks/stripe.post.ts`

**Critical Configuration:**
```typescript
config: {
  rawBody: true  // MUST have raw body for signature verification
}
```

**Flow:**
1. Extract `stripe-signature` header (validate exists)
2. Verify signature using `stripe.webhooks.constructEvent(rawBody, signature, secret)`
3. Check idempotency: `webhookRepository.existsByStripeEventId(event.id)`
4. If duplicate, return `{ received: true, duplicate: true }`
5. Save to database: `webhookRepository.create(event)`
6. Queue job: `fastify.queue.addWebhookJob(webhook.id, event.id, event.type)`
7. Return `{ received: true }` with 200 status

**Error Handling:**
- Signature verification fails → Return 400
- Any other error → Log but still return 200 (webhook saved, will retry)

**Target Response Time:** <100ms

### Route Configuration

**File:** `src/modules/billing/routes/webhooks/routes.config.ts`

```typescript
export default {
  '/stripe': {
    POST: {
      protected: false, // Public endpoint
      rateLimit: { max: 100, timeWindow: '1 minute' }
    }
  }
}
```

---

## Phase 5: Worker Process

### Worker Implementation

**File:** `src/workers/webhook.worker.ts`

Create BullMQ Worker that consumes jobs from the queue:

```typescript
import { Worker } from 'bullmq';
import { redisConnection } from '@/shared/queue/redis.client';
import { QUEUE_NAMES, JOB_NAMES } from '@/shared/queue/queue.config';

const worker = new Worker(
  QUEUE_NAMES.STRIPE_WEBHOOKS,  // Listen to this queue
  async (job) => {
    // Job processing logic here
    const { webhookId, eventId, eventType } = job.data;
    // ... process webhook ...
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 5,
  }
);
```

**Key Points:**
- `Worker` class CONSUMES jobs (different from `Queue` which ADDS jobs)
- Both use same Redis connection
- Concurrency controls parallel job processing
- Worker runs as separate Node.js process

**Job Processing Logic:**
1. Extract `webhookId` from job data
2. Fetch webhook from database: `webhookRepository.findById(webhookId)`
3. Check if already processed (skip if yes)
4. Call `webhookProcessor.process(webhook)`
5. Mark as processed: `webhookRepository.markProcessed(webhookId)`
6. On error: Mark failed and re-throw (BullMQ will auto-retry)

**Event Listeners:**
- `completed` → Log success
- `failed` → Log error
- `error` → Log worker error

**Graceful Shutdown:**
Handle SIGINT/SIGTERM to close worker and Redis connection cleanly.

### Package.json Scripts

Add:
```json
{
  "worker": "tsx src/workers/webhook.worker.ts",
  "worker:dev": "tsx --watch src/workers/webhook.worker.ts"
}
```

---

## Phase 6: Webhook Processing Logic

### Processor Service

**File:** `src/modules/billing/services/webhook-processor.service.ts`

Main entry point that routes events to handlers:

```typescript
class WebhookProcessor {
  async process(webhook: WebhookEvent) {
    const event = webhook.payload as Stripe.Event;
    
    switch (event.type) {
      case 'account.updated':
        await accountUpdatedHandler.handle(event);
        break;
      case 'capability.updated':
        await capabilityUpdatedHandler.handle(event);
        break;
      default:
        // Log unhandled event type
    }
  }
}
```

### Event Handlers

Create handler files in `src/modules/billing/handlers/`:

**`account-updated.handler.ts`:**
- Extract account data from event
- Update `stripe_connected_accounts` table:
  - `charges_enabled`
  - `payouts_enabled`
  - `details_submitted`
  - `requirements` (JSONB)
  - `capabilities` (JSONB)
  - `updated_at`
- Log success

**`capability-updated.handler.ts`:**
- Extract capability data from event
- Find connected account by `account_id`
- Update capabilities JSONB field
- Log success

**Handler Pattern:**
Each handler should:
- Have a `handle(event: Stripe.Event)` method
- Extract typed data from event
- Update database
- Log actions
- Be idempotent (safe to run multiple times)

---

## Phase 7: Monitoring

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

Or use the helper function:

```typescript
import { getWebhookQueueStats } from '@/shared/queue/queue.manager';

const stats = await getWebhookQueueStats();
// { waiting: 0, active: 2, completed: 150, failed: 1 }
```

### Logging

Graphile Worker provides comprehensive logging:
- Connection status on worker start
- Job start/success/error events
- Detailed error messages for debugging

### Advanced Monitoring

Query Graphile Worker tables directly for detailed monitoring:

```sql
-- View all jobs for a task
SELECT * FROM graphile_worker.jobs 
WHERE task_identifier = 'process-stripe-webhook'
ORDER BY created_at DESC
LIMIT 100;

-- View failed jobs
SELECT * FROM graphile_worker.jobs 
WHERE attempts >= max_attempts
ORDER BY created_at DESC;

-- View active jobs
SELECT * FROM graphile_worker.jobs 
WHERE locked_at IS NOT NULL;
```

Or build a custom admin dashboard using the `getQueueStats()` function.

---

## Phase 8: Testing

### Local Testing Setup

**1. Start PostgreSQL:**
```bash
# Ensure PostgreSQL is running (required for Graphile Worker)
# Graphile Worker uses the same DATABASE_URL as the application
```

**2. Start API Server:**
```bash
pnpm run dev
```

**3. Start Worker (separate terminal):**
```bash
pnpm run worker:dev
```

**Note:** Graphile Worker automatically creates the `graphile_worker` schema on first start.

**4. Forward Stripe Webhooks:**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks
stripe listen --forward-to localhost:3000/api/billing/webhooks/stripe

# Copy the webhook secret to .env
```

**5. Trigger Test Events:**
```bash
stripe trigger account.updated
stripe trigger capability.updated
```

**6. Verify:**
- Check API logs: "Webhook received" and "Webhook job queued"
- Check database: `SELECT * FROM webhook_events`
- Check Graphile Worker jobs: `SELECT * FROM graphile_worker.jobs`
- Check worker logs: "Starting job" and "Job completed successfully"

### Test Checklist

- [ ] Webhook endpoint responds 200 OK in <100ms
- [ ] Duplicate webhooks return `duplicate: true`
- [ ] Webhooks saved to database before queueing
- [ ] Jobs appear in `graphile_worker.jobs` table
- [ ] Worker processes jobs successfully
- [ ] Database updated correctly
- [ ] Failed jobs retry automatically
- [ ] Queue statistics queryable via `getQueueStats()`

---

## Phase 9: Production Deployment

### No Setup Required

Graphile Worker automatically creates the schema on first run. No manual setup needed.

**Deployment Steps:**
1. Run database migrations: `pnpm run db:migrate`
2. Start worker: `pnpm run worker`
3. Schema auto-creates on first worker start

### Process Management (PM2)

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      name: 'blawby-api',
      script: 'pnpm',
      args: 'run start',
      instances: 2,
      exec_mode: 'cluster',
    },
    {
      name: 'blawby-worker',
      script: 'pnpm',
      args: 'run worker',
      instances: 1, // Graphile Worker handles concurrency internally
      exec_mode: 'fork',
    },
  ],
};
```

**Commands:**
```bash
pm2 start ecosystem.config.js
pm2 monit
pm2 logs blawby-worker
```

**Note:** Graphile Worker handles concurrency via the `concurrency` config option, so typically only one worker instance is needed.

### Stripe Webhook Configuration

1. Stripe Dashboard → Webhooks
2. Add endpoint: `https://yourdomain.com/api/billing/webhooks/stripe`
3. Select events:
   - `account.updated`
   - `account.external_account.created`
   - `account.external_account.updated`
   - `capability.updated`
4. Copy webhook secret to production `.env`

### Health Check

Add to health endpoint:
- Graphile Worker connection status (via database query)
- Unprocessed webhook count (from `graphile_worker.jobs` table)
- Return `degraded` if >1000 unprocessed

Alert if:
- Database connection issues
- Unprocessed webhooks >1000
- Worker process crashed
- Failed jobs >100 (may indicate systemic issue)

---

## Key Implementation Notes

### Critical Requirements

1. **Raw Body for Signature Verification**
   - Must have `rawBody: true` in route config
   - Cannot use parsed JSON body for verification

2. **Idempotency is Essential**
   - Check `stripe_event_id` before saving
   - Use UNIQUE constraint on database
   - Use Stripe event ID as job ID in queue

3. **Always Return 200 OK**
   - Even on errors (prevents Stripe retries)
   - Only return 400 if signature invalid

4. **Save Before Queue**
   - Webhook must persist to DB before queueing
   - Guarantees no data loss

5. **Separate Worker Process**
   - Worker MUST be separate from API server
   - Can scale workers independently
   - Graphile Worker schema auto-creates on first start

### Common Pitfalls to Avoid

❌ **Don't:**
- Process webhooks synchronously in endpoint
- Use parsed JSON for signature verification
- Queue before saving to database
- Lose raw body in middleware
- Return errors to Stripe (causes retries)

✅ **Do:**
- Save webhook immediately
- Check idempotency first
- Use raw body for verification
- Return 200 quickly (<100ms)
- Process asynchronously in worker

---

## File Structure Summary

```
src/
├── modules/billing/
│   ├── routes/
│   │   └── webhooks/
│   │       ├── stripe.post.ts           # Webhook endpoint
│   │       └── routes.config.ts         # Route config
│   ├── repositories/
│   │   └── webhook.repository.ts        # Database operations
│   ├── schemas/
│   │   └── webhook.schema.ts            # Drizzle schema
│   ├── services/
│   │   └── webhook-processor.service.ts # Processing logic
│   └── handlers/
│       ├── account-updated.handler.ts   # Event handler
│       └── capability-updated.handler.ts # Event handler
├── shared/
│   ├── queue/
│   │   ├── graphile-worker.client.ts    # Graphile Worker client
│   │   ├── queue.manager.ts             # Job queue management
│   │   ├── queue.config.ts              # Queue configuration
│   │   ├── queue.manager.ts             # Queue manager
│   │   └── bull-board.ts                # Monitoring UI
│   └── plugins/
│       └── queue.plugin.ts              # Fastify plugin
└── workers/
    └── webhook.worker.ts                # Worker process

database/migrations/
└── YYYY_MM_DD_create_webhook_events.sql # Migration
```

---

## Scaling Strategy

### Current (MVP)
- Single API server
- Single worker process
- Single PostgreSQL database

### Medium Scale (1000+ webhooks/day)
- 2-3 API servers (load balanced)
- 2-3 worker processes (adjust concurrency per worker)
- PostgreSQL with read replicas

### Large Scale (10,000+ webhooks/day)
- Multiple API servers
- Multiple worker processes on separate servers
- PostgreSQL cluster for HA
- Dead letter queue for failed jobs (query `graphile_worker.jobs`)
- Webhook replay system

---

## Success Criteria

✅ **Implementation Complete When:**
- [ ] Webhooks save to database before queueing
- [ ] Idempotency prevents duplicate processing
- [ ] Response time <100ms
- [ ] Worker processes jobs asynchronously
- [ ] Failed jobs retry automatically
- [ ] Queue statistics queryable
- [ ] All tests pass
- [ ] Documentation updated

✅ **Production Ready When:**
- [ ] Graphile Worker schema created (auto-creates on first start)
- [ ] Worker process under PM2 or similar
- [ ] Health checks implemented
- [ ] Alerts configured
- [ ] Stripe webhook endpoint registered
- [ ] Tested with real Stripe events
- [ ] Monitoring for job queue health

---

## Resources

- **Graphile Worker Docs:** https://github.com/graphile/worker
- **Stripe Webhooks:** https://stripe.com/docs/webhooks
- **Graphile Worker Examples:** https://github.com/graphile/worker/tree/main/examples
- **Stripe CLI:** https://stripe.com/docs/stripe-cli

---

## Support

For questions or issues during implementation:
1. Check Graphile Worker documentation
2. Review Stripe webhook best practices
3. Test with Stripe CLI before production
4. Monitor `graphile_worker.jobs` table for queue health
5. See [GRAPHILE_WORKER_MIGRATION.md](./GRAPHILE_WORKER_MIGRATION.md) for migration details
