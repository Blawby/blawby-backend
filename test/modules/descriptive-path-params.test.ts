import { describe, expect, it } from 'vitest';
import { refundRequestRoutes } from '@/modules/invoices/routes/refund-requests.routes';
import {
  deleteIntakeTemplateRoute,
  getIntakeTemplateRoute,
  updateIntakeTemplateRoute,
} from '@/modules/practice/routes/intake-templates.routes';

describe('descriptive path parameters', () => {
  it('names refund request path parameters after the resource', () => {
    expect(refundRequestRoutes.cancelRefundRequestRoute.path).toContain('{refund_request_id}');
    expect(refundRequestRoutes.reviewRefundRequestRoute.path).toContain('{refund_request_id}');
    expect(refundRequestRoutes.executeRefundRoute.path).toContain('{refund_request_id}');
    expect(Object.values(refundRequestRoutes).every((route) => !route.path.includes('{id}'))).toBe(true);
    expect(Object.keys(refundRequestRoutes.reviewRefundRequestRoute.mcp.schema ?? {})).toContain('id');
  });

  it('names intake template path parameters after the resource', () => {
    expect(getIntakeTemplateRoute.path).toContain('{intake_template_id}');
    expect(updateIntakeTemplateRoute.path).toContain('{intake_template_id}');
    expect(deleteIntakeTemplateRoute.path).toContain('{intake_template_id}');
    expect([getIntakeTemplateRoute, updateIntakeTemplateRoute, deleteIntakeTemplateRoute]).not.toContainEqual(
      expect.objectContaining({ path: expect.stringContaining('{id}') })
    );
    expect(Object.keys(getIntakeTemplateRoute.mcp.schema ?? {})).toEqual(['id']);
  });
});
