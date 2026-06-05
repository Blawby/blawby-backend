/**
 * Preferences Module
 *
 * Exports for the preferences module
 */

import { preferencesHandlers } from '@/modules/preferences/handlers';
import http from '@/modules/preferences/http';
import { preferencesService } from '@/modules/preferences/services/preferences.service';
import { preferenceValidations } from '@/modules/preferences/validations/preferences.validation';

export { preferencesHandlers, preferencesService, preferenceValidations };

export default http;
