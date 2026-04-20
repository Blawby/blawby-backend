import { z } from '@hono/zod-openapi';
import { matterValidations } from '@/modules/matters/validations/matters.validation';
import { addressSchema } from '@/shared/validations/address';

// Public request schema - clientIp and userAgent are injected server-side from headers
const createPracticeClientIntakeSchema = z.object({
  slug: z.string().min(1).max(100),
  amount: z.number().int().min(0).max(99999999).openapi({
    description: 'Consultation amount submitted by the client.',
    example: 15000,
  }), // $0.00 to $999,999.99
  email: z.email().max(255),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  on_behalf_of: z.string().max(200).optional(),
  opposing_party: z.string().max(200).optional().openapi({
    description: 'Name of the opposing party in the legal matter',
    example: 'John Doe',
  }),
  description: z.string().max(500).optional(),
  user_id: z.uuid().optional(),
  practice_service_uuid: z.uuid().optional().openapi({
    description: 'Optional practice service UUID selected by the client.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  address: addressSchema.optional().openapi({
    description: 'Client address information',
  }),
  conversation_id: z.uuid().optional().openapi({
    description: 'Conversation ID associated with the client intake',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
  desired_outcome: z.string().optional(),
  court_date: z.iso.datetime().optional(),
  has_documents: z.boolean().optional(),
  income: z.number().int().optional(),
  household_size: z.number().int().optional(),
  case_strength: z.number().min(0).max(1).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional().openapi({
    description: 'Template-defined intake answers that do not map to first-class intake columns.',
  }),
});

const updatePracticeClientIntakeSchema = z.object({
  amount: z.number().int().min(0).max(99999999).optional(),
  urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
  desired_outcome: z.string().optional(),
  court_date: z.iso.datetime().optional(),
  has_documents: z.boolean().optional(),
  income: z.number().int().optional(),
  household_size: z.number().int().optional(),
  case_strength: z.number().min(0).max(1).optional(),
});

const slugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

const uuidParamSchema = z.object({
  uuid: z.uuid(), // UUID format
});

const stripeCheckoutSessionIdSchema = z
  .string()
  .min(1)
  .regex(/^cs_[A-Za-z0-9_]+$/, 'Invalid Stripe Checkout Session ID format');

const checkoutSessionStatusQuerySchema = z.object({
  session_id: stripeCheckoutSessionIdSchema,
});

const claimPracticeClientIntakeSchema = z.object({
  session_id: stripeCheckoutSessionIdSchema,
});

// Response schemas for OpenAPI
const practiceClientIntakeSettingsResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      organization: z.object({
        id: z.uuid(),
        name: z.string(),
        slug: z.string(),
        logo: z.string().optional(),
      }),
      settings: z.object({
        payment_link_enabled: z.boolean().openapi({
          description:
            'Whether payment links should be shown for this intake. True only when the practice has payment links enabled and the practice consultation_fee > 0.',
        }),
        consultation_fee: z.number().int().nonnegative().openapi({
          description:
            'Consultation fee (in cents) from practice_details.consultation_fee — backend source of truth for intake payment flows.',
        }),
      }),
      service_area: z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            key: z.string(),
          })
        )
        .openapi({
          description: 'Practice services configured for the organization.',
          example: [
            { id: '9f7a2c1f-8e5c-4b8a-9d7f-1234567890ab', name: 'Family Law', key: 'FAMILY_LAW' },
            { id: '7f7a2c1f-8e5c-4b8a-9d7f-1234567890cd', name: 'Immigration', key: 'IMMIGRATION' },
          ],
        }),
      connected_account: z.object({
        id: z.uuid(),
        charges_enabled: z.boolean(),
      }),
    })
    .optional(),
  error: z.string().optional(),
});

const createPracticeClientIntakeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      uuid: z.uuid(),
      payment_link_url: z.url().nullable().optional(),
      amount: z.number(),
      currency: z.string(),
      status: z.string(),
      organization: z.object({
        name: z.string(),
        logo: z.string().optional(),
      }),
      urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
      desired_outcome: z.string().optional(),
      court_date: z.date().optional(),
      has_documents: z.boolean().optional(),
      income: z.number().int().optional(),
      household_size: z.number().int().optional(),
      case_strength: z.number().min(0).max(1).optional(),
    })
    .optional(),
  error: z.string().optional(),
});

const createPracticeClientIntakeCheckoutSessionResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      url: z.url(),
      session_id: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});

const updatePracticeClientIntakeResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const practiceClientIntakeStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      uuid: z.uuid(),
      organization_id: z.uuid(),
      amount: z.number(),
      currency: z.string(),
      status: z.string().openapi({ example: 'succeeded' }),
      triage_status: z.enum(['pending_review', 'accepted', 'declined']).openapi({
        description: 'Practice triage decision state',
        example: 'pending_review',
      }),
      triage_reason: z.string().nullable(),
      triage_decided_at: z.date().nullable(),
      address_id: z.uuid().optional().openapi({
        description: 'ID of the created address record',
        example: '123e4567-e89b-12d3-a456-426614174000',
      }),
      conversation_id: z.uuid().optional().openapi({
        description: 'Conversation ID associated with the client intake',
        example: '123e4567-e89b-12d3-a456-426614174000',
      }),
      stripe_charge_id: z.string().optional(),
      metadata: z
        .object({
          email: z.string(),
          name: z.string(),
          phone: z.string().optional(),
          on_behalf_of: z.string().optional(),
          opposing_party: z.string().optional(),
          description: z.string().optional(),
          user_id: z.uuid().optional(),
          practice_service_uuid: z.uuid().optional(),
          custom_fields: z.record(z.string(), z.unknown()).optional(),
          address: addressSchema.optional().openapi({
            example: {
              line1: '123 Client St',
              city: 'New York',
              state: 'NY',
              postal_code: '10001',
              country: 'US',
            },
          }),
        })
        .optional(),
      succeeded_at: z.date().nullable(),
      created_at: z.date(),
      urgency: z.enum(['routine', 'time_sensitive', 'emergency']).optional(),
      desired_outcome: z.string().optional(),
      court_date: z.date().nullable(),
      has_documents: z.boolean().optional(),
      income: z.number().int().nullable(),
      household_size: z.number().int().nullable(),
      case_strength: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

const practiceClientIntakePostPayStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      paid: z.boolean(),
      intake_uuid: z.uuid().optional(),
      organization_id: z.uuid().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

const claimPracticeClientIntakeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      intake_uuid: z.uuid(),
      organization_id: z.uuid(),
    })
    .optional(),
  error: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
        code: z.string(),
      })
    )
    .optional(),
});

const notFoundResponseSchema = z.object({
  error: z.string(),
});

const internalServerErrorResponseSchema = z.object({
  error: z.string(),
});

const triggerIntakeInvitationResponseSchema = z.object({
  message: z.string(),
});

const listIntakesQuerySchema = z.object({
  status: z
    .enum(['open', 'succeeded', 'expired', 'canceled', 'failed', 'converted', 'pending_review', 'accepted', 'declined'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

const listIntakesResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      intakes: z.array(
        z.object({
          uuid: z.uuid(),
          organization_id: z.uuid(),
          amount: z.number(),
          currency: z.string(),
          status: z.string(),
          triage_status: z.enum(['pending_review', 'accepted', 'declined']),
          triage_reason: z.string().nullable(),
          triage_decided_at: z.date().nullable(),
          conversation_id: z.uuid().nullable(),
          stripe_charge_id: z.string().nullable(),
          urgency: z.enum(['routine', 'time_sensitive', 'emergency']).nullable(),
          court_date: z.date().nullable(),
          case_strength: z.number().nullable(),
          desired_outcome: z.string().nullable(),
          has_documents: z.boolean().nullable(),
          income: z.number().int().nullable(),
          household_size: z.number().int().nullable(),
          metadata: z.object({
            email: z.string(),
            name: z.string(),
            phone: z.string().optional(),
            on_behalf_of: z.string().optional(),
            opposing_party: z.string().optional(),
            description: z.string().optional(),
            custom_fields: z.record(z.string(), z.unknown()).optional(),
          }),
          succeeded_at: z.date().nullable(),
          created_at: z.date(),
        })
      ),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      total_pages: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});

const convertIntakeSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  responsible_attorney_id: z.uuid().optional(),
  practice_service_id: z.uuid().optional(),
  billing_type: z.enum(['hourly', 'fixed', 'contingency', 'pro_bono']).optional(),
  status: matterValidations.matterStatusEnum.optional(),
  open_date: z.iso.date().optional(),
});

const convertIntakeResponseSchema = z.object({
  matter_id: z.uuid(),
  matter: matterValidations.matterSchema,
});

const updateIntakeTriageStatusSchema = z
  .object({
    status: z.enum(['accepted', 'declined']),
    reason: z.string().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'declined' && !value.reason?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Reason is required when declining an intake',
      });
    }
  });

const updateIntakeTriageStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      uuid: z.uuid(),
      conversation_id: z.uuid().nullable().optional(),
      triage_status: z.enum(['pending_review', 'accepted', 'declined']),
      triage_reason: z.string().nullable().optional(),
      triage_decided_at: z.date().nullable().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export const intakeValidations = {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
  checkoutSessionStatusQuerySchema,
  claimPracticeClientIntakeSchema,
  practiceClientIntakeSettingsResponseSchema,
  createPracticeClientIntakeResponseSchema,
  createPracticeClientIntakeCheckoutSessionResponseSchema,
  updatePracticeClientIntakeResponseSchema,
  practiceClientIntakeStatusResponseSchema,
  practiceClientIntakePostPayStatusResponseSchema,
  claimPracticeClientIntakeResponseSchema,
  triggerIntakeInvitationResponseSchema,
  listIntakesQuerySchema,
  listIntakesResponseSchema,
  convertIntakeSchema,
  convertIntakeResponseSchema,
  updateIntakeTriageStatusSchema,
  updateIntakeTriageStatusResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
};
