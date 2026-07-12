import type { OrgTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import { matterTasksService } from '@/modules/matters/services/matter-tasks.service';
import { listPracticeTasksRoute } from '@/modules/tasks/routes';
import { requireAuth } from '@/shared/middleware/auth';
import { injectAbility } from '@/shared/middleware/inject-ability';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { createHonoApp } from '@/shared/router/factory';
import { getServiceContext } from '@/shared/types/service-context';

const app = createHonoApp();

app.use('*', requireAuth(), requireOrgMembership(), injectAbility());

app.openapi(listPracticeTasksRoute, async (c) => {
  const query = c.req.valid('query');
  const filters: OrgTaskListFilters = {
    taskId: query.task_id,
    assigneeId: query.assignee_id,
    status: query.status,
    priority: query.priority,
    stage: query.stage,
    dueBefore: query.due_before,
    page: query.page,
    limit: query.limit,
  };
  const result = await matterTasksService.listOrganizationTasks({ filters }, getServiceContext(c));
  return c.json(result, 200);
});

export default app;
