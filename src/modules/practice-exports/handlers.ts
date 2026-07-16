import type { getPracticeExportRoute, requestPracticeExportRoute } from '@/modules/practice-exports/routes';
import { practiceExportsService } from '@/modules/practice-exports/services/practice-exports.service';
import type { AppRouteHandler } from '@/shared/types/hono';
import { getServiceContext } from '@/shared/types/service-context';

export const requestPracticeExportHandler: AppRouteHandler<typeof requestPracticeExportRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const result = await practiceExportsService.requestExport({ data: c.req.valid('json') }, ctx);
  return c.json({ export: result }, 202);
};

export const getPracticeExportHandler: AppRouteHandler<typeof getPracticeExportRoute> = async (c) => {
  const ctx = getServiceContext(c);
  const { export_id } = c.req.valid('param');
  const result = await practiceExportsService.getExport({ id: export_id }, ctx);
  return c.json({ export: result }, 200);
};

export const handlers = { requestPracticeExportHandler, getPracticeExportHandler };
