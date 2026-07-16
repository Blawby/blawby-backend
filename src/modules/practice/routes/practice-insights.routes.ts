import { practiceInsightsService } from '@/modules/practice/services/practice-insights.service';
import {
  practiceInsightsQuerySchema,
  practiceInsightsResponseSchema,
} from '@/modules/practice/types/practice-insights.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

export const getPracticeInsightsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/insights',
  tags: ['Practice'],
  summary: 'Get deterministic practice insights',
  description: 'Returns rules-based client check-in or matter-risk signals with the evidence behind each signal.',
  mcp: {
    name: 'get_practice_insights',
    scope: 'practice:read',
    schema: practiceInsightsQuerySchema.shape,
    handler: async (args, ctx) => {
      const { topic } = practiceInsightsQuerySchema.parse(args);
      return practiceInsightsService.getInsights({ topic }, ctx);
    },
  },
  request: {
    params: z.object({ practice_id: z.uuid() }),
    query: practiceInsightsQuerySchema,
  },
  responses: {
    200: {
      description: 'Practice insights',
      content: { 'application/json': { schema: practiceInsightsResponseSchema } },
    },
  },
});
