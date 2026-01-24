/**
 * Matters Module
 *
 * Main entry point for the matters module
 */

import mattersApp from './http';

export default mattersApp;

// Export types
export * from './types/matter.types';

// Export schemas for migrations
export * from './database/schema';
