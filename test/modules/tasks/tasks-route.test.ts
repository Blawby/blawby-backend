import { describe, expect, it } from 'vitest';
import { listPracticeTasksQuery, listPracticeTasksRoute } from '@/modules/tasks/routes';

describe('practice tasks route contract', () => {
  it('is mounted relative to the canonical /api/tasks module path', () => {
    expect(listPracticeTasksRoute.path).toBe('/{practice_id}');
    expect(listPracticeTasksRoute.method).toBe('get');
  });

  it('accepts every supported filter and coerces bounded pagination', () => {
    const result = listPracticeTasksQuery.safeParse({
      task_id: '11111111-1111-4111-8111-111111111111',
      assignee_id: '22222222-2222-4222-8222-222222222222',
      status: 'in_progress',
      priority: 'urgent',
      stage: 'discovery',
      due_before: '2026-08-01',
      page: '2',
      limit: '50',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ page: 2, limit: 50, priority: 'urgent', stage: 'discovery' });
    }
  });

  it('rejects invalid identifiers, filters, and unbounded pagination', () => {
    expect(listPracticeTasksQuery.safeParse({ task_id: 'not-a-uuid' }).success).toBe(false);
    expect(listPracticeTasksQuery.safeParse({ priority: 'critical' }).success).toBe(false);
    expect(listPracticeTasksQuery.safeParse({ stage: ' ' }).success).toBe(false);
    expect(listPracticeTasksQuery.safeParse({ limit: '101' }).success).toBe(false);
  });
});
