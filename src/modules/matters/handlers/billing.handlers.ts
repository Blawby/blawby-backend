import {
  getUnbilledTimeEntriesRoute,
  getUnbilledExpensesRoute,
  getUnbilledSummaryRoute,
} from '@/modules/matters/routes';
import { matterExpensesService } from '@/modules/matters/services/matter-expenses.service';
import { matterTimeEntriesService } from '@/modules/matters/services/matter-time-entries.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import { AppRouteHandler } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

export const getUnbilledTimeEntriesHandler: AppRouteHandler<typeof getUnbilledTimeEntriesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id: matter_id } = c.req.valid('param');
  const res = await matterTimeEntriesService.getUnbilledTimeEntries(practice_id, matter_id, user, c.req.header());
  const payload = res.success ? { success: true as const, data: { timeEntries: res.data } } : res;
  return response.fromResult(c, payload);
};

export const getUnbilledExpensesHandler: AppRouteHandler<typeof getUnbilledExpensesRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id: matter_id } = c.req.valid('param');
  const res = await matterExpensesService.getUnbilledExpenses(practice_id, matter_id, user, c.req.header());
  const payload = res.success ? { success: true as const, data: { expenses: res.data } } : res;
  return response.fromResult(c, payload);
};

export const getUnbilledSummaryHandler: AppRouteHandler<typeof getUnbilledSummaryRoute> = async (c) => {
  const user = c.get('user')!;
  const { practice_id, id: matter_id } = c.req.valid('param');
  const result = await mattersService.getUnbilledSummary(practice_id, matter_id, user, c.req.header());
  return response.fromResult(c, result);
};
