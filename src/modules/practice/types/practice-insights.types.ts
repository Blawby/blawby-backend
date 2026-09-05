import { z } from '@hono/zod-openapi';

export const practiceInsightsQuerySchema = z.object({
  topic: z.enum(['client-checkins', 'matter-risk']),
});

export const clientCheckinSignalSchema = z.enum(['calm', 'anxious', 'frustrated', 'silent']);
export const matterRiskSignalSchema = z.enum(['urgent', 'warn', 'healthy', 'quiet']);

export const clientCheckinInsightSchema = z.object({
  client_id: z.uuid(),
  signal: clientCheckinSignalSchema,
  last_contact_at: z.iso.datetime({ offset: true }),
  last_contact_source: z.enum(['memo-event', 'memo', 'client-update']),
  recency_days: z.number().int().min(0),
  open_matter_count: z.number().int().min(0),
  highest_urgency: z.enum(['routine', 'time_sensitive', 'emergency']).nullable(),
  reasons: z.array(z.string()),
});

export const matterRiskInsightSchema = z.object({
  matter_id: z.uuid(),
  signal: matterRiskSignalSchema,
  last_activity_at: z.iso.datetime({ offset: true }),
  last_activity_source: z.enum(['activity-log', 'matter-update']),
  recency_days: z.number().int().min(0),
  tags: z.array(z.string()),
  reasons: z.array(z.string()),
});

export const practiceInsightsResponseSchema = z.discriminatedUnion('topic', [
  z.object({
    topic: z.literal('client-checkins'),
    generated_at: z.iso.datetime({ offset: true }),
    data: z.array(clientCheckinInsightSchema),
  }),
  z.object({
    topic: z.literal('matter-risk'),
    generated_at: z.iso.datetime({ offset: true }),
    data: z.array(matterRiskInsightSchema),
  }),
]);

export type PracticeInsightsTopic = z.infer<typeof practiceInsightsQuerySchema>['topic'];
export type ClientCheckinInsight = z.infer<typeof clientCheckinInsightSchema>;
export type MatterRiskInsight = z.infer<typeof matterRiskInsightSchema>;
