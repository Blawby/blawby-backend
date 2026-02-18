import { describe, it, expect, beforeAll } from 'vitest';
import { createTestUser } from '@/test/helpers/auth';
import { preferencesService } from '@/modules/preferences/services/preferences.service';
import { DEFAULT_NOTIFICATION_PREFERENCES, DEFAULT_ONBOARDING_PREFERENCES } from '@/modules/preferences/types/preferences.types';

describe('Preferences Service', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  it('should create default preferences for a new user', async () => {
    const result = await preferencesService.initializeUserPreferences(userId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.user_id).toBe(userId);
    expect(result.data.notifications).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(result.data.onboarding).toEqual(DEFAULT_ONBOARDING_PREFERENCES);
  });

  it('should return existing preferences if already initialized', async () => {
    // First call was in previous test, ensuring idempotency
    const result = await preferencesService.initializeUserPreferences(userId);
    expect(result.success).toBe(true);
  });



  it('should retrieve full preference object', async () => {
    const result = await preferencesService.getPreferences(userId);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.user_id).toBe(userId);
    expect(result.data.notifications).toBeDefined();
  });

  it('should return error for non-existent user preferences (if not initialized)', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const result = await preferencesService.getPreferences(nonExistentId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Preferences not found');
    }
  });



  it('should update general preferences', async () => {
    const updateData = { theme: 'dark', language: 'es' };
    const result = await preferencesService.updatePreferencesByCategory(userId, 'general', updateData);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toMatchObject(updateData);

    // Verify persistence
    const stored = await preferencesService.getPreferencesByCategory(userId, 'general');
    expect(stored.success).toBe(true);
    if (stored.success) {
      expect(stored.data).toMatchObject(updateData);
    }



    const notificationUpdateData = {
      messages_email: false,
      system_email: false, // Trying to disable system email
      system_push: false   // Trying to disable system push
    };

    const notificationResult = await preferencesService.updatePreferencesByCategory(userId, 'notifications', notificationUpdateData);

    expect(notificationResult.success).toBe(true);
    if (!notificationResult.success) return;

    // User preference respected
    expect(notificationResult.data.messages_email).toBe(false);
    // System preferences enforced
    expect(notificationResult.data.system_email).toBe(true);
    expect(notificationResult.data.system_push).toBe(true);
  });



  it('should retrieve specific category data', async () => {
    const result = await preferencesService.getPreferencesByCategory(userId, 'general');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should have the data we updated in previous test
    expect(result.data.theme).toBe('dark');
  });

  it('should apply defaults for notifications category', async () => {
    const result = await preferencesService.getPreferencesByCategory(userId, 'notifications');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Check default field presence
    expect(result.data.matters_email).toBeDefined();
  });
});
