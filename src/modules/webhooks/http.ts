import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppContext } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';
import {
  verifyAndStore,
  processWebhookAsync,
} from '@/modules/webhooks/services/onboarding-webhooks.service';

const webhooksApp = new OpenAPIHono<AppContext>();

/**
 * POST /api/webhooks/stripe/connected-accounts
 * Dedicated endpoint for Stripe Connect webhooks (using different signing secret)
 */
webhooksApp.post('/stripe/connected-accounts', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = Buffer.from(await c.req.arrayBuffer());

  if (!signature) {
    return response.badRequest(c, 'Missing stripe-signature header');
  }

  try {
    // 1. Verify signature using STRIPE_CONNECT_WEBHOOK_SECRET
    // 2. Store event in database
    const { event, alreadyProcessed, webhookId } = await verifyAndStore(
      body,
      signature,
      c.req.header(),
      c.req.url,
    );

    if (alreadyProcessed) {
      console.log(`Webhook already processed: ${event.id}`);
      return c.json({ received: true });
    }

    // 3. Process asynchronously via Graphile Worker
    await processWebhookAsync(event.id, webhookId, event.type);

    return c.json({ received: true });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return response.badRequest(c, `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
});

export default webhooksApp;
