import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

const taskStatusEnum = z.enum(['pending', 'in_progress', 'complete', 'blocked']);
const taskPriorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

const createMatterTaskSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255),
    description: z.string().optional(),
    assignee_id: uuidValidator.nullable().optional(),
    due_date: z.iso.date().nullable().optional(),
    status: taskStatusEnum.default('pending'),
    priority: taskPriorityEnum.default('normal'),
    stage: z.string().min(1, 'Stage is required').max(100),
  })
  .strict();

const updateMatterTaskSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    assignee_id: uuidValidator.nullable().optional(),
    due_date: z.iso.date().nullable().optional(),
    status: taskStatusEnum.optional(),
    priority: taskPriorityEnum.optional(),
    stage: z.string().min(1).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided for update' });

const listMatterTasksQuerySchema = z.object({
  task_id: uuidValidator.optional(),
  assignee_id: uuidValidator.optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  stage: z.string().min(1).max(100).optional(),
});

const generateTasksFromTemplateSchema = z
  .object({
    template_name: z.string().min(1).max(120).optional(),
    tasks: z.array(createMatterTaskSchema).min(1),
  })
  .strict();

const matterTaskSchema = z
  .object({
    id: z.uuid(),
    matter_id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    assignee_id: z.uuid().nullable(),
    due_date: z.string().nullable(),
    status: taskStatusEnum,
    priority: taskPriorityEnum,
    stage: z.string(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .openapi('MatterTask');

export const matterTaskValidations = {
  taskStatusEnum,
  taskPriorityEnum,
  createMatterTaskSchema,
  updateMatterTaskSchema,
  listMatterTasksQuerySchema,
  generateTasksFromTemplateSchema,
  matterTaskSchema,
};
