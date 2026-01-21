import { z } from 'zod';
import { uuidValidator } from '@/shared/validations/common';

// Matter validation schemas
export const createMatterSchema = z.object({
  customerId: uuidValidator,
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().optional(),
  billingType: z.enum(['hourly', 'fixed', 'contingency']),
  totalFixedPrice: z.number().int().min(0).optional(), // in cents
  contingencyPercentage: z.number().min(0).max(100).optional(),
  settlementAmount: z.number().int().min(0).optional(), // in cents
  practiceAreaId: uuidValidator.optional(),
  adminHourlyRate: z.number().int().min(0).optional(), // in cents
  attorneyHourlyRate: z.number().int().min(0).optional(), // in cents
  paymentFrequency: z.enum(['project', 'milestone']).optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  assigneeIds: z.array(uuidValidator).optional(), // User IDs to assign
  milestones: z.array(z.object({
    description: z.string().min(1).max(255),
    amount: z.number().int().min(0), // in cents
    dueDate: z.string().or(z.date()),
    order: z.number().int().min(0).default(0),
  })).optional(),
}).refine(
  (data) => {
    if (data.billingType === 'fixed' && !data.totalFixedPrice) {
      return false;
    }
    if (data.billingType === 'contingency' && !data.contingencyPercentage) {
      return false;
    }
    if (data.billingType === 'hourly' && !data.adminHourlyRate && !data.attorneyHourlyRate) {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid billing configuration for the selected billing type',
  },
);

export const updateMatterSchema = z.object({
  customerId: uuidValidator.optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  billingType: z.enum(['hourly', 'fixed', 'contingency']).optional(),
  totalFixedPrice: z.number().int().min(0).optional(),
  contingencyPercentage: z.number().min(0).max(100).optional(),
  settlementAmount: z.number().int().min(0).optional(),
  practiceAreaId: uuidValidator.optional(),
  adminHourlyRate: z.number().int().min(0).optional(),
  attorneyHourlyRate: z.number().int().min(0).optional(),
  paymentFrequency: z.enum(['project', 'milestone']).optional(),
  status: z.enum(['draft', 'active']).optional(),
  assigneeIds: z.array(uuidValidator).optional(),
});

export const matterIdParamSchema = z.object({
  uuid: uuidValidator,
});

export const listMattersQuerySchema = z.object({
  status: z.enum(['draft', 'active']).optional(),
  practiceAreaId: uuidValidator.optional(),
  customerId: uuidValidator.optional(),
  assigneeId: uuidValidator.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Infer types
export type CreateMatterRequest = z.infer<typeof createMatterSchema>;
export type UpdateMatterRequest = z.infer<typeof updateMatterSchema>;
export type ListMattersQuery = z.infer<typeof listMattersQuerySchema>;
