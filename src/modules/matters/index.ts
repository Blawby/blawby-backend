/**
 * Matters Module
 *
 * Main entry point for the matters module
 */

import mattersApp from '@/modules/matters/http';

export default mattersApp;

// Export internal types/schemas if needed, but primarily access via http/routes
export * from '@/modules/matters/types/matter.types';
export * from '@/modules/matters/database/schema/matters.schema';
