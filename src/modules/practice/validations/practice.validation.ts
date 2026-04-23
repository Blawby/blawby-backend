import { z } from '@hono/zod-openapi';
import { addressSchema } from '@/shared/validations/address';
import {
  nameValidator,
  slugValidator,
  urlValidator,
  phoneValidator,
  currencyValidator,
} from '@/shared/validations/common';

// Practice details validation schemas
const businessPhoneSchema = phoneValidator.optional();
const businessEmailSchema = z.email().optional();
const consultationFeeSchema = currencyValidator.optional();
const paymentUrlSchema = urlValidator.optional();
const calendlyUrlSchema = urlValidator.optional();
const billingIncrementMinutesSchema = z.number().int().min(1).max(60).openapi({
  description: 'Billing increment in minutes',
  example: 15,
});

// Practice module specific param schemas
const practiceIdParamSchema = z.object({
  uuid: z.uuid().refine((val) => val.length > 0, 'Invalid practice UUID'),
});

const supportedStatesItemSchema = z.object({
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .openapi({ example: 'US' }),
  states: z
    .array(
      z
        .string()
        .min(1)
        .max(10)
        .transform((val) => val.toUpperCase())
    )
    .optional()
    .refine((items) => !items || new Set(items).size === items.length, {
      message: 'States must be unique',
    })
    .openapi({ example: ['NY', 'NJ'] }),
});

// Combined practice details schema
const practiceDetailsValidationSchema = z.object({
  business_phone: businessPhoneSchema,
  business_email: businessEmailSchema,
  consultation_fee: consultationFeeSchema,
  payment_url: paymentUrlSchema,
  calendly_url: calendlyUrlSchema,
  website: urlValidator.optional().openapi({ example: 'https://example.com' }),
  intro_message: z.string().optional().openapi({ example: 'Welcome to our practice' }),
  overview: z.string().optional().openapi({ example: 'We specialize in family law' }),
  accent_color: z.string().optional().openapi({ example: '#3B82F6' }),
  is_public: z.boolean().optional().openapi({ example: true }),
  billing_increment_minutes: billingIncrementMinutesSchema.optional(),
  services: z
    .array(z.object({ id: z.string().optional(), name: z.string(), key: z.string() }))
    .optional()
    .openapi({ example: [{ id: '1', name: 'Service 1', key: 'SERVICE_1' }] }),
  // Nested Address
  address: addressSchema.optional(),
  supported_states: z
    .array(supportedStatesItemSchema)
    .optional()
    .refine((items) => !items || new Set(items.map((i) => i.country)).size === items.length, {
      message: 'Country codes must be unique',
    })
    .openapi({
      description: 'List of supported countries and states',
      example: [{ country: 'US', states: ['NY', 'NJ'] }, { country: 'CA', states: ['ON'] }, { country: 'GB' }],
    }),
  service_states: z
    .array(
      z
        .string()
        .length(2)
        .regex(/^[A-Z]{2}$/)
    )
    .optional()
    .refine((items) => !items || new Set(items).size === items.length, {
      message: 'State codes must be unique',
    })
    .openapi({
      description: 'US states where the practice is licensed to practice (2-letter codes)',
      example: ['NC', 'SC', 'VA'],
    }),
});

/**
 * Generic helper to check if any fields from a Zod schema are present and contain values
 */
const isAnyFieldProvided = (
  data: Record<string, unknown>,
  schema: z.ZodObject,
  options: { treatEmptyStringAsProvided?: boolean } = {}
): boolean => {
  const { treatEmptyStringAsProvided = false } = options;
  return Object.keys(schema.shape).some((key) => {
    if (!Object.hasOwn(data, key)) {
      return false;
    }
    const value = data[key];
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).length > 0;
    }
    if (typeof value === 'string') {
      return treatEmptyStringAsProvided ? true : value.trim().length > 0;
    }
    return true; // Booleans, numbers, non-empty arrays
  });
};

// Complete practice schemas
const createPracticeSchema = z.object({
  // Organization fields (required)
  name: nameValidator,
  slug: slugValidator,
  logo: urlValidator.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  // Practice details
  ...practiceDetailsValidationSchema.shape,
});

const updatePracticeSchemaBase = z.object({
  // Organization fields (all optional for updates)
  name: nameValidator.optional(),
  slug: slugValidator.optional(),
  logo: urlValidator.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  // Practice details
  ...practiceDetailsValidationSchema.shape,
});

const updatePracticeSchema = updatePracticeSchemaBase.refine(
  (data) => isAnyFieldProvided(data, updatePracticeSchemaBase, { treatEmptyStringAsProvided: true }),
  {
    message: 'At least one field must be provided to update the practice',
  }
);

// Response schemas with OpenAPI metadata
const practiceResponseSchema = z
  .object({
    id: z.uuid().openapi({
      description: 'Organization ID (UUID)',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    name: z.string().openapi({
      example: 'My Practice',
    }),
    slug: z.string().openapi({
      example: 'my-practice',
    }),
    logo: z.string().nullable().openapi({
      example: 'https://example.com/logo.png',
    }),
    metadata: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        example: { key: 'value' },
      }),
    business_phone: z.string().nullable().openapi({
      description: 'Business phone number',
      example: '+1234567890',
    }),
    business_email: z.email().nullable().openapi({
      description: 'Business email address',
      example: 'contact@example.com',
    }),
    website: z.string().nullable().openapi({
      description: 'Practice website URL',
      example: 'https://example.com',
    }),
    consultation_fee: z.number().nullable().openapi({
      description: 'Consultation fee (in cents or primary currency unit)',
      example: 25000,
    }),
    payment_url: z.string().nullable().openapi({
      description: 'Direct payment URL',
      example: 'https://payment.example.com/pay',
    }),
    calendly_url: z.string().nullable().openapi({
      description: 'Calendly scheduling URL',
      example: 'https://calendly.com/practice',
    }),
    intro_message: z.string().nullable().openapi({
      description: 'Brief welcome message for clients',
      example: 'Welcome to our law firm',
    }),
    overview: z.string().nullable().openapi({
      description: 'Detailed practice overview or biography',
      example: 'We specialize in family and corporate law with over 20 years of experience.',
    }),
    accent_color: z.string().nullable().openapi({
      description: 'Practice accent color for theming',
      example: '#3B82F6',
    }),
    is_public: z.boolean().openapi({
      description: 'Whether the practice details are publicly visible',
      example: true,
    }),
    payment_link_enabled: z.boolean().nullable().openapi({
      description: 'Whether the practice has payment links enabled',
      example: true,
    }),
    billing_increment_minutes: billingIncrementMinutesSchema.openapi({
      description: 'Billing increment in minutes for time entry dropdowns',
      example: 15,
    }),
    created_at: z.date().openapi({
      format: 'date-time',
      description: 'Organization creation timestamp',
      example: '2024-01-01T00:00:00Z',
    }),
    updated_at: z.date().optional().openapi({
      format: 'date-time',
      description: 'Organization last update timestamp',
      example: '2024-01-01T00:00:00Z',
    }),
  })
  .openapi('PracticeResponse');

const practiceListResponseSchema = z
  .object({
    practices: z.array(practiceResponseSchema).openapi({
      example: [],
    }),
  })
  .openapi('PracticeListResponse');

const practiceSingleResponseSchema = z
  .object({
    practice: practiceResponseSchema,
  })
  .openapi('PracticeSingleResponse');

const setActivePracticeResponseSchema = z
  .object({
    success: z.boolean().openapi({
      example: true,
    }),
  })
  .openapi('SetActivePracticeResponse');

// Error response schemas
const errorResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Bad Request',
    }),
    message: z.string().openapi({
      example: 'Invalid request data',
    }),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          code: z.string(),
        })
      )
      .optional()
      .openapi({
        example: [
          {
            field: 'name',
            message: 'Invalid name',
            code: 'invalid_string',
          },
        ],
      }),
  })
  .openapi('ErrorResponse');

const notFoundResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Not Found',
    }),
    message: z.string().openapi({
      example: 'Practice not found',
    }),
  })
  .openapi('NotFoundResponse');

const internalServerErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Internal Server Error',
    }),
    message: z.string().openapi({
      example: 'An error occurred',
    }),
  })
  .openapi('InternalServerErrorResponse');

// Query schemas
const practiceQuerySchema = z.object({
  includeDetails: z.coerce.boolean().default(true),
});

// Member validation schemas
const memberRoleSchema = z.enum(['owner', 'admin', 'attorney', 'paralegal', 'member', 'client']);

const updateMemberRoleSchema = z.object({
  member_id: z.uuid().openapi({
    description: 'Member ID to update (from listMembers response)',
    example: 'member_123e4567-e89b-12d3-a456-426614174000',
  }),
  role: memberRoleSchema.openapi({
    description: 'New role for the member',
    example: 'admin',
  }),
});

const memberListItemSchema = z.object({
  id: z.uuid().openapi({
    description: 'Member ID (use this for updateMemberRole)',
    example: 'member_123e4567-e89b-12d3-a456-426614174000',
  }),
  user_id: z.uuid().openapi({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  email: z.email().openapi({
    description: 'User email',
    example: 'user@example.com',
  }),
  name: z.string().nullable().openapi({
    description: 'User name',
    example: 'John Doe',
  }),
  role: memberRoleSchema.openapi({
    description: 'Member role',
    example: 'admin',
  }),
  joined_at: z.number().openapi({
    description: 'Timestamp when member joined (Unix timestamp in milliseconds)',
    example: 1704067200000,
  }),
});

const membersListResponseSchema = z.object({
  members: z.array(memberListItemSchema),
});

// Invitation validation schemas
const createInvitationSchema = z.object({
  email: z.email(),
  role: memberRoleSchema,
});

const invitationListItemSchema = z.object({
  id: z.uuid().openapi({
    description: 'Invitation ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  organization_id: z.uuid().openapi({
    description: 'Organization ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  organization_name: z.string().openapi({
    description: 'Organization name',
    example: 'My Practice',
  }),
  email: z.email().openapi({
    description: 'Invited email address',
    example: 'user@example.com',
  }),
  role: memberRoleSchema.nullable().openapi({
    description: 'Invited role',
    example: 'admin',
  }),
  status: z.enum(['pending', 'accepted', 'declined']).openapi({
    description: 'Invitation status',
    example: 'pending',
  }),
  expires_at: z.number().openapi({
    description: 'Expiration timestamp (Unix timestamp in milliseconds)',
    example: 1704672000000,
  }),
  created_at: z.number().openapi({
    description: 'Creation timestamp (Unix timestamp in milliseconds)',
    example: 1704067200000,
  }),
});

const invitationsListResponseSchema = z.object({
  invitations: z.array(invitationListItemSchema),
});

const acceptInvitationResponseSchema = z.object({
  success: z.boolean(),
  organization: z.unknown(), // Organization object from Better Auth
});

// Practice Details API schemas
const createPracticeDetailsSchema = practiceDetailsValidationSchema.refine(
  (data) => isAnyFieldProvided(data, practiceDetailsValidationSchema),
  {
    message: 'At least one practice detail field must be provided',
  }
);

const updatePracticeDetailsSchema = practiceDetailsValidationSchema;

const practiceDetailsResponseSchema = z
  .object({
    id: z.uuid().openapi({
      description: 'Practice Details ID',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    user_id: z.uuid().openapi({
      description: 'User ID of the creator',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    address_id: z.uuid().nullable().openapi({
      description: 'Linked Address ID',
      example: '123e4567-e89b-12d3-a456-426614174000',
    }),
    business_phone: z.string().nullable().openapi({
      example: '+1234567890',
    }),
    business_email: z.email().nullable().openapi({
      example: 'contact@example.com',
    }),
    consultation_fee: z.number().nullable().openapi({
      example: 100.0,
    }),
    payment_url: z.url().nullable().openapi({
      example: 'https://payment.example.com',
    }),
    calendly_url: z.url().nullable().openapi({
      example: 'https://calendly.com/example',
    }),
    website: z.string().nullable().openapi({ example: 'https://example.com' }),
    intro_message: z.string().nullable().openapi({ example: 'Welcome' }),
    overview: z.string().nullable().openapi({ example: 'Overview text' }),
    accent_color: z.string().nullable().openapi({ example: '#3B82F6' }),
    is_public: z.boolean().openapi({ example: true }),
    organization_id: z.uuid().openapi({
      description: 'Organization UUID for the practice',
      example: '9f7a2c1f-8e5c-4b8a-9d7f-1234567890ab',
    }),
    services: z
      .array(z.object({ id: z.string(), name: z.string(), key: z.string() }))
      .nullable()
      .openapi({ example: [{ id: '1', name: 'Service 1', key: 'SERVICE_1' }] }),
    address: addressSchema.nullable().openapi({
      description: 'Practice or organizational address',
      example: {
        line1: '123 Business Way',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
    }),
    name: z.string().openapi({
      example: 'My Practice',
    }),
    logo: z.url().nullable().openapi({
      example: 'https://example.com/logo.png',
    }),
    payment_link_enabled: z.boolean().openapi({
      example: true,
    }),
    billing_increment_minutes: billingIncrementMinutesSchema.openapi({
      description: 'Billing increment in minutes for time entry dropdowns',
      example: 15,
    }),
    created_at: z.date().openapi({
      description: 'Practice details creation timestamp',
      format: 'date-time',
      example: '2024-01-01T00:00:00Z',
    }),
    updated_at: z.date().optional().openapi({
      format: 'date-time',
      description: 'Practice details last update timestamp',
      example: '2024-01-01T00:00:00Z',
    }),
    supported_states: z
      .array(
        z.object({
          country: z.string().openapi({ example: 'US' }),
          states: z
            .array(z.string())
            .optional()
            .openapi({ example: ['NY', 'NJ'] }),
        })
      )
      .nullable()
      .openapi({
        description: 'List of supported countries and states',
        example: [{ country: 'US', states: ['NY', 'NJ'] }, { country: 'CA', states: ['ON'] }, { country: 'GB' }],
      }),
    service_states: z
      .array(z.string())
      .nullable()
      .openapi({
        description: 'US states where the practice is licensed to practice (2-letter codes)',
        example: ['NC', 'SC', 'VA'],
      }),
  })
  .openapi('PracticeDetailsResponse');

const practiceDetailsSingleResponseSchema = practiceDetailsResponseSchema;

const practiceDetailsCreateResponseSchema = practiceDetailsResponseSchema;

const practiceDetailsUpdateResponseSchema = practiceDetailsResponseSchema;

const slugParamSchema = z.object({
  slug: z.string(),
});

export const practiceValidations = {
  createPracticeSchema,
  updatePracticeSchema,
  practiceIdParamSchema,
  practiceDetailsValidationSchema,
  practiceResponseSchema,
  practiceListResponseSchema,
  practiceSingleResponseSchema,
  setActivePracticeResponseSchema,
  errorResponseSchema,
  notFoundResponseSchema,
  internalServerErrorResponseSchema,
  practiceQuerySchema,
  updateMemberRoleSchema,
  memberRoleSchema,
  memberListItemSchema,
  membersListResponseSchema,
  createInvitationSchema,
  invitationListItemSchema,
  invitationsListResponseSchema,
  acceptInvitationResponseSchema,
  createPracticeDetailsSchema,
  updatePracticeDetailsSchema,
  practiceDetailsResponseSchema,
  practiceDetailsSingleResponseSchema,
  practiceDetailsCreateResponseSchema,
  practiceDetailsUpdateResponseSchema,
  slugParamSchema,
  supportedStatesItemSchema,
  hasPracticeDetails: (data: Partial<z.infer<typeof practiceDetailsValidationSchema>>) =>
    isAnyFieldProvided(data, practiceDetailsValidationSchema),
};
