/**
 * Practice Client Intakes Module
 *
 * Main entry point for the practice client intakes module
 */

import practiceClientIntakesApp from './http';

export default practiceClientIntakesApp;

// Export types
export * from './types/practice-client-intakes.types';

// Export schemas for migrations
export * from './database/schema/practice-client-intakes.schema';
