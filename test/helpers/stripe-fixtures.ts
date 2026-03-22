import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { Stripe } from 'stripe';

const FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'stripe');

/**
 * Load a Stripe fixture from JSON file
 */
export function loadStripeFixture<T>(filename: string): T {
  const filePath = join(FIXTURES_DIR, filename);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Mock Stripe checkout session retrieve to return a specific fixture
 */
export function mockStripeSessionRetrieveWithFixture(
  sessionId: string,
  fixtureFile: string = 'checkout-session-paid.json'
) {
  const fixture = loadStripeFixture<Stripe.Checkout.Session>(fixtureFile);
  
  // Override the session ID to match the requested one
  const sessionWithId = {
    ...fixture,
    id: sessionId,
  };

  const checkout = Reflect.get(stripe, 'checkout');
  const sessions = Reflect.get(checkout, 'sessions');
  const retrieveSession = Reflect.get(sessions, 'retrieve');
  
  if (!isMockResolvedValueFunction(retrieveSession)) {
    throw new Error('Expected mocked Stripe checkout.sessions.retrieve');
  }

  retrieveSession.mockResolvedValue(sessionWithId);
}

/**
 * Mock Stripe checkout session create to return a session with given params
 */
export function mockStripeSessionCreateWithFixture(
  params: {
    id?: string;
    url?: string;
    status?: string;
    paymentStatus?: string;
  } = {}
) {
  const fixture = loadStripeFixture<Stripe.Checkout.Session>('checkout-session-open.json');
  
  const sessionWithParams = {
    ...fixture,
    id: params.id ?? fixture.id,
    url: params.url ?? fixture.url,
    status: params.status ?? fixture.status,
    payment_status: params.paymentStatus ?? fixture.payment_status,
  } as Stripe.Checkout.Session;

  const checkout = Reflect.get(stripe, 'checkout');
  const sessions = Reflect.get(checkout, 'sessions');
  const createSession = Reflect.get(sessions, 'create');
  
  if (!isMockResolvedValueFunction(createSession)) {
    throw new Error('Expected mocked Stripe checkout.sessions.create');
  }

  createSession.mockResolvedValue(sessionWithParams);
}

const isMockResolvedValueFunction = (
  value: unknown
): value is {
  mockResolvedValue: (value: unknown) => unknown;
} => typeof value === 'function' && 'mockResolvedValue' in value;

// Re-export stripe for convenience
export { stripe } from '@/shared/utils/stripe-client';
