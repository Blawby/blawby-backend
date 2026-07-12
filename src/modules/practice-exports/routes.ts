import { practiceExportsService } from '@/modules/practice-exports/services/practice-exports.service';
import {
  createPracticeExportSchema,
  practiceExportJobSchema,
  practiceExportParamsSchema,
} from '@/modules/practice-exports/types/practice-exports.types';
import { routeBuilder } from '@/shared/router/route-builder';
import { z } from '@hono/zod-openapi';

const practiceParamsSchema = z.object({ practice_id: z.uuid() });

export const requestPracticeExportRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/exports',
  tags: ['Practice Exports'],
  summary: 'Request a durable practice export',
  mcp: {
    name: 'request_practice_export',
    scope: 'practice:write',
    approval: {
      required: true,
      message: 'Approve creating a durable practice data export?',
      confirm_title: 'Create export',
    },
    schema: createPracticeExportSchema.shape,
    handler: async (args, ctx) =>
      practiceExportsService.requestExport({ data: createPracticeExportSchema.parse(args) }, ctx),
  },
  request: {
    params: practiceParamsSchema,
    body: { content: { 'application/json': { schema: createPracticeExportSchema } } },
  },
  responses: {
    202: {
      description: 'Export durably queued',
      content: { 'application/json': { schema: z.object({ export: practiceExportJobSchema }) } },
    },
  },
});

export const getPracticeExportRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/exports/{export_id}',
  tags: ['Practice Exports'],
  summary: 'Get export state and an expiring download URL after completion',
  mcp: {
    name: 'get_practice_export',
    scope: 'practice:read',
    schema: { export_id: z.uuid() },
    handler: async (args, ctx) => practiceExportsService.getExport({ id: z.uuid().parse(args.export_id) }, ctx),
  },
  request: { params: practiceExportParamsSchema },
  responses: {
    200: {
      description: 'Export state',
      content: { 'application/json': { schema: z.object({ export: practiceExportJobSchema }) } },
    },
  },
});

export const routes = { requestPracticeExportRoute, getPracticeExportRoute };
