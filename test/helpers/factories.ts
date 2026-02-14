import { testDb } from './db';
import crypto from 'crypto';

/**
 * Factory functions for creating test data
 */

// Add more factories as needed for invoices, matters, etc.
export const factories = {
  // Example: Create test invoice
  async createInvoice(orgId: string, overrides = {}) {
    // Implementation based on your invoice schema
    return {};
  },

  // Example: Create test matter
  async createMatter(orgId: string, overrides = {}) {
    // Implementation based on your matter schema
    return {};
  },
};
