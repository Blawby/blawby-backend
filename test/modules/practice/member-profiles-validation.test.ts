import { describe, it, expect } from 'vitest';
import { updateMemberProfileSchema } from '@/modules/practice/validations/member-profiles.validation';

describe('updateMemberProfileSchema', () => {
  it('accepts an empty body (no-op partial merge)', () => {
    expect(updateMemberProfileSchema.safeParse({}).success).toBe(true);
  });

  it('accepts full routing metadata', () => {
    const result = updateMemberProfileSchema.safeParse({
      practice_areas: ['Family Law', 'Criminal Defense'],
      service_counties: ['Wake', 'Durham'],
      max_capacity: 25,
      accepting_clients: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty arrays', () => {
    expect(updateMemberProfileSchema.safeParse({ practice_areas: [], service_counties: [] }).success).toBe(true);
  });

  it('accepts max_capacity of null (no cap)', () => {
    expect(updateMemberProfileSchema.safeParse({ max_capacity: null }).success).toBe(true);
  });

  it('accepts max_capacity of 0', () => {
    expect(updateMemberProfileSchema.safeParse({ max_capacity: 0 }).success).toBe(true);
  });

  it('rejects a negative max_capacity', () => {
    expect(updateMemberProfileSchema.safeParse({ max_capacity: -1 }).success).toBe(false);
  });

  it('rejects a non-integer max_capacity', () => {
    expect(updateMemberProfileSchema.safeParse({ max_capacity: 2.5 }).success).toBe(false);
  });

  it('rejects empty strings in practice_areas', () => {
    expect(updateMemberProfileSchema.safeParse({ practice_areas: [''] }).success).toBe(false);
  });

  it('rejects non-string practice areas', () => {
    expect(updateMemberProfileSchema.safeParse({ practice_areas: [123] }).success).toBe(false);
  });

  it('rejects a non-boolean accepting_clients', () => {
    expect(updateMemberProfileSchema.safeParse({ accepting_clients: 'yes' }).success).toBe(false);
  });

  it('rejects too many practice_areas', () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `Area ${i}`);
    expect(updateMemberProfileSchema.safeParse({ practice_areas: tooMany }).success).toBe(false);
  });
});
