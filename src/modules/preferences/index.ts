/**
 * Preferences Module
 *
 * Exports for the preferences module
 */

export { getAllPreferences, getCategoryPreferences, updateCategoryPreferences } from './handlers';
export { preferencesService } from './services/preferences.service';
export {
  generalPreferencesSchema,
  notificationPreferencesSchema,
  securityPreferencesSchema,
  accountPreferencesSchema,
  onboardingPreferencesSchema,
  profilePreferencesSchema,
  preferenceCategorySchema,
  updateUserDetailsSchema,
} from './validations/preferences.validation';
export { config } from './routes.config';

// Legacy exports for backward compatibility
export { getDetails, updateDetails } from './handlers';
export { preferencesService as preferences } from './services/preferences.service';
