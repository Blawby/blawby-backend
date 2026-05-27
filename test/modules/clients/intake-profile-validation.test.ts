import { describe, it, expect } from 'vitest';
import { updateIntakeProfileSchema } from '@/modules/clients/validations/client-intake-profiles.validation';

describe('updateIntakeProfileSchema', () => {
  it('accepts an empty body (no-op partial merge)', () => {
    expect(updateIntakeProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts intake metadata fields', () => {
    const result = updateIntakeProfileSchema.safeParse({
      date_of_birth: '1990-04-15',
      preferred_contact_method: 'text',
      referral_source: 'Google',
      intake_date: '2026-05-26',
      eligibility_status: 'eligible',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid eligibility_status', () => {
    expect(updateIntakeProfileSchema.safeParse({ eligibility_status: 'maybe' }).success).toBe(false);
  });

  it('rejects an invalid preferred_contact_method', () => {
    expect(updateIntakeProfileSchema.safeParse({ preferred_contact_method: 'fax' }).success).toBe(false);
  });

  it('rejects a non-ISO date_of_birth', () => {
    expect(updateIntakeProfileSchema.safeParse({ date_of_birth: '04/15/1990' }).success).toBe(false);
  });

  describe('discount (Stripe Coupon model)', () => {
    it('accepts a percent_off discount', () => {
      expect(updateIntakeProfileSchema.safeParse({ percent_off: 12.5 }).success).toBe(true);
    });

    it('accepts a 100% percent_off discount', () => {
      expect(updateIntakeProfileSchema.safeParse({ percent_off: 100 }).success).toBe(true);
    });

    it('accepts an amount_off discount with currency', () => {
      expect(updateIntakeProfileSchema.safeParse({ amount_off: 5000, currency: 'usd' }).success).toBe(true);
    });

    it('accepts clearing the discount with all fields null', () => {
      expect(
        updateIntakeProfileSchema.safeParse({ amount_off: null, percent_off: null, currency: null }).success
      ).toBe(true);
    });

    it('rejects percent_off above 100', () => {
      expect(updateIntakeProfileSchema.safeParse({ percent_off: 150 }).success).toBe(false);
    });

    it('rejects percent_off of 0 or below', () => {
      expect(updateIntakeProfileSchema.safeParse({ percent_off: 0 }).success).toBe(false);
    });

    it('rejects a non-integer amount_off', () => {
      expect(updateIntakeProfileSchema.safeParse({ amount_off: 49.99, currency: 'usd' }).success).toBe(false);
    });

    it('rejects amount_off without currency', () => {
      expect(updateIntakeProfileSchema.safeParse({ amount_off: 5000 }).success).toBe(false);
    });

    it('rejects setting both amount_off and percent_off', () => {
      expect(
        updateIntakeProfileSchema.safeParse({ amount_off: 5000, currency: 'usd', percent_off: 10 }).success
      ).toBe(false);
    });

    it('rejects currency on a percent_off discount', () => {
      expect(updateIntakeProfileSchema.safeParse({ percent_off: 10, currency: 'usd' }).success).toBe(false);
    });

    it('rejects currency provided on its own', () => {
      expect(updateIntakeProfileSchema.safeParse({ currency: 'usd' }).success).toBe(false);
    });

    it('rejects a bad currency length', () => {
      expect(updateIntakeProfileSchema.safeParse({ amount_off: 5000, currency: 'dollars' }).success).toBe(false);
    });
  });
});
