/**
 * Preferences Module
 *
 * Exports for the preferences module
 */

export { getAllPreferences, getCategoryPreferences, updateCategoryPreferences } from '@/modules/preferences/handlers';
export { preferencesService } from '@/modules/preferences/services/preferences.service';
export {
  preferenceValidations,
} from '@/modules/preferences/validations/preferences.validation';
export { config } from '@/modules/preferences/routes.config';

// Legacy exports for backward compatibility
export { getDetails, updateDetails } from '@/modules/preferences/handlers';
export { preferencesService as preferences } from '@/modules/preferences/services/preferences.service';
export { getUserDetails, updateUserDetails } from '@/modules/preferences/services/preferences.service';
