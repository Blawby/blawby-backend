import type { z } from 'zod';
import {
  createSubscriptionSchema,
  cancelSubscriptionSchema,
} from '../validations/subscription.validation';

export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionSchema>;
export type CancelSubscriptionBody = z.infer<typeof cancelSubscriptionSchema>;

