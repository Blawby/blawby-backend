import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { createIntakePaymentsService } from './services/intake-payments.service';
import {
  createIntakePaymentSchema,
  updateIntakePaymentSchema,
  slugParamSchema,
  ulidParamSchema,
} from './validations/intake-payments.validation';
import type { AppContext } from '@/shared/types/hono';

const app = new Hono<AppContext>();

// Initialize service
const intakePaymentsService = createIntakePaymentsService();

// GET /:slug/intake
// Public intake page - returns organization details and payment settings
app.get(
  '/:slug/intake',
  zValidator('param', slugParamSchema),
  async (c) => {
    const { slug } = c.req.valid('param');
    const result = await intakePaymentsService.getOrganizationIntakeSettings(slug);

    if (!result.success) {
      return c.json({ error: result.error }, 404);
    }

    return c.json(result.data);
  },
);

// POST /api/intake-payments/create
// Creates payment intent for intake payment
app.post(
  '/api/intake-payments/create',
  zValidator('json', createIntakePaymentSchema),
  async (c) => {
    const body = c.req.valid('json');
    const customerIp = c.req.header('x-forwarded-for')
      || c.req.header('cf-connecting-ip')
      || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    const result = await intakePaymentsService.createIntakePayment({
      ...body,
      customerIp,
      userAgent,
    });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result.data, 201);
  },
);

// PUT /api/intake-payments/:ulid
// Updates payment amount before confirmation
app.put(
  '/api/intake-payments/:ulid',
  zValidator('param', ulidParamSchema),
  zValidator('json', updateIntakePaymentSchema),
  async (c) => {
    const { ulid } = c.req.valid('param');
    const { amount } = c.req.valid('json');

    const result = await intakePaymentsService.updateIntakePayment(ulid, amount);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result.data);
  },
);

// GET /api/intake-payments/:ulid/status
// Gets payment status
app.get(
  '/api/intake-payments/:ulid/status',
  zValidator('param', ulidParamSchema),
  async (c) => {
    const { ulid } = c.req.valid('param');
    const result = await intakePaymentsService.getIntakePaymentStatus(ulid);

    if (!result.success) {
      return c.json({ error: result.error }, 404);
    }

    return c.json(result.data);
  },
);

export default app;
