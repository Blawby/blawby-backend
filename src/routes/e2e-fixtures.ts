import { z } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { config } from '@/shared/config';
import { e2eEmailCaptureService } from '@/shared/services/email/e2e-email-capture.service';
import type { AppContext } from '@/shared/types/hono';

const app = new Hono<AppContext>();

const emailQuerySchema = z.object({
  to: z.email(),
});

const isEnabled = (): boolean =>
  config.e2e.fixturesEnabled &&
  config.env.isStaging &&
  !config.env.isProduction &&
  typeof config.e2e.fixtureSecret === 'string' &&
  config.e2e.fixtureSecret.length > 0;

app.get('/emails/latest-invitation', async (c) => {
  if (!isEnabled()) {
    return c.notFound();
  }

  if (c.req.header('x-e2e-fixture-secret') !== config.e2e.fixtureSecret) {
    return c.json({ error: 'Forbidden', message: 'Invalid E2E fixture secret' }, 403);
  }

  const parsedQuery = emailQuerySchema.safeParse({ to: c.req.query('to') });
  if (!parsedQuery.success) {
    return c.json({ error: 'Bad Request', message: 'A valid to email query parameter is required' }, 400);
  }

  if (!e2eEmailCaptureService.isAllowedRecipient(parsedQuery.data.to)) {
    return c.json({ error: 'Forbidden', message: 'Recipient is not an allowed E2E email address' }, 403);
  }

  const invitation = await e2eEmailCaptureService.findLatestPracticeInvitation(parsedQuery.data.to);
  if (!invitation) {
    return c.json({ error: 'Not Found', message: 'No captured practice invitation email found' }, 404);
  }

  return c.json({
    to: parsedQuery.data.to,
    invite_link: invitation.inviteLink,
    captured_at: invitation.capturedAt.toISOString(),
  });
});

export default app;
