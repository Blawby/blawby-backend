/**
 * Practice Client Intakes Module
 *
 * Main entry point for the practice client intakes module
 */

import practiceClientIntakesApp from '@/modules/practice-client-intakes/http';

export default practiceClientIntakesApp;

// Export types
export * from '@/modules/practice-client-intakes/types/practice-client-intakes.types';

// Export schemas for migrations
export * from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
