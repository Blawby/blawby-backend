import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import onboardingApp from '@/modules/onboarding/http';
import { onboardingService } from '@/modules/onboarding/services/onboarding.service';

// Mock the service
vi.mock('@/modules/onboarding/services/onboarding.service');

describe('Onboarding API', () => {
  const practiceId = '123e4567-e89b-12d3-a456-426614174000';
  
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('user', { id: '789a1234-b56c-78d9-e012-345678901234', email: 'test@example.com' } as any);
    await next();
  });
  app.route('/api/onboarding', onboardingApp);
  
  const request = supertest(getRequestListener(app.fetch));

  it('GET /api/onboarding/organization/:practiceId/status should return status', async () => {
    const mockStatus = {
      practice_uuid: practiceId,
      stripe_account_id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    };

    vi.mocked(onboardingService.getOnboardingStatus).mockResolvedValue({
      success: true,
      data: mockStatus,
    } as any);

    const res = await request
      .get(`/api/onboarding/organization/${practiceId}/status`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockStatus);
  });

  it('POST /api/onboarding/connected-accounts should create account', async () => {
    const mockResponse = {
      url: 'https://stripe.com/onboard',
      practice_uuid: practiceId,
      stripe_account_id: 'acct_123',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
    };

    vi.mocked(onboardingService.createConnectedAccount).mockResolvedValue({
      success: true,
      data: mockResponse,
    } as any);

    const res = await request
      .post('/api/onboarding/connected-accounts')
      .send({
        practice_email: 'test@example.com',
        practice_uuid: practiceId,
        refresh_url: 'https://example.com/refresh',
        return_url: 'https://example.com/return',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockResponse);
  });
});
