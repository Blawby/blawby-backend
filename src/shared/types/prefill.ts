import { z } from 'zod';

/**
 * Discriminated union for data passed to the frontend for prefilling forms.
 * Used for both organization invitations and client intake flows.
 */
export const prefillDataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('invitation'),
    id: z.string().describe('The invitation ID'),
    email: z.email(),
    orgName: z.string(),
    orgSlug: z.string(),
    inviterName: z.string(),
  }),
  z.object({
    type: z.literal('intake'),
    intakeId: z.string().describe('The intake ID'),
    conversationId: z.string().describe('The conversation ID'),
    email: z.email().optional(),
    orgName: z.string().optional(),
    orgSlug: z.string().optional(),
  }),
]);

export type PrefillData = z.infer<typeof prefillDataSchema>;
