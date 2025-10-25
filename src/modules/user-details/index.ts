/**
 * User Details Module
 *
 * Exports for the user details module
 */

export { getDetails, updateDetails } from './handlers';
export { getUserDetails, updateUserDetails } from './services/user-details.service';
export { updateUserDetailsSchema } from './validations/user-details.validation';
export { config } from './routes.config';
