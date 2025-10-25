/**
 * Onboarding Module
 *
 * Handles Stripe Connect onboarding for organizations including:
 * - Creating onboarding sessions
 * - Managing connected accounts
 * - Tracking onboarding status
 */

export { default as onboardingApp } from './http';
export * from './services/onboarding.service';
export * from './validations/onboarding.validation';
export * from './types/onboarding.types';
