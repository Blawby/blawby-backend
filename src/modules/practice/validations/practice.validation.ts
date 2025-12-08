import { z } from '@hono/zod-openapi';
import {
  nameValidator,
  slugValidator,
  urlValidator,
  emailValidator,
  phoneValidator,
  currencyValidator,
} from '@/shared/validations/common';

// Practice details validation schemas
export const businessPhoneSchema = phoneValidator.optional();
export const businessEmailSchema = emailValidator.optional();
export const consultationFeeSchema = currencyValidator.optional();
export const paymentUrlSchema = urlValidator.optional().or(z.literal(''));
export const calendlyUrlSchema = urlValidator.optional().or(z.literal(''));


// Practice module specific param schemas
export const practiceIdParamSchema = z.object({
  uuid: z.uuid().refine((val) => val.length > 0, 'Invalid practice UUID'),
});


// Combined practice details schema
export const practiceDetailsValidationSchema = z.object({
  business_phone: businessPhoneSchema,
  business_email: businessEmailSchema,
  consultation_fee: consultationFeeSchema,
  payment_url: paymentUrlSchema,
  calendly_url: calendlyUrlSchema,
});

// Complete practice schemas
export const createPracticeSchema = z.object({
  // Organization fields (required)
  name: nameValidator,
  slug: slugValidator,
  logo: urlValidator.optional().or(z.literal('')),
  metadata: z.record(z.string(), z.any()).optional(),

  // Practice details
  ...practiceDetailsValidationSchema.shape,
});

export const updatePracticeSchema = z
  .object({
    // Organization fields (all optional for updates)
    name: nameValidator.optional(),
    slug: slugValidator.optional(),
    logo: urlValidator.optional().or(z.literal('')),
    metadata: z.record(z.string(), z.any()).optional(),

    // Practice details
    ...practiceDetailsValidationSchema.shape,
  })
  .refine(
    (data) => {
      // Ensure at least one field is provided for update
      const hasOrgField = data.name || data.slug || data.logo || data.metadata;
      const hasPracticeField
        = data.business_phone
        || data.business_email
        || data.consultation_fee
        || data.payment_url
        || data.calendly_url;
      return hasOrgField || hasPracticeField;
    },
    {
      message: 'At least one field must be provided to update the practice',
    },
  );

// Response schemas with OpenAPI metadata
export const practiceResponseSchema = z
  .object({
    id: z.string().uuid().openapi({
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
    metadata: z.record(z.string(), z.any()).nullable().openapi({
      example: { key: 'value' },
    }),
    business_phone: z.string().nullable().openapi({
      example: '+1234567890',
    }),
    business_email: z.string().email().nullable().openapi({
      example: 'contact@example.com',
    }),
    consultation_fee: z.number().nullable().openapi({
      example: 100.0,
    }),
    payment_url: z.string().url().nullable().openapi({
      example: 'https://payment.example.com',
    }),
    calendly_url: z.string().url().nullable().openapi({
      example: 'https://calendly.com/example',
    }),
    created_at: z.date().openapi({
      example: '2024-01-01T00:00:00Z',
    }),
    updated_at: z.date().openapi({
      example: '2024-01-01T00:00:00Z',
    }),
  })
  .openapi('PracticeResponse');

export const practiceListResponseSchema = z
  .object({
    practices: z.array(practiceResponseSchema).openapi({
      example: [],
    }),
  })
  .openapi('PracticeListResponse');

export const practiceSingleResponseSchema = z
  .object({
    practice: practiceResponseSchema,
  })
  .openapi('PracticeSingleResponse');

export const setActivePracticeResponseSchema = z
  .object({
    result: z.object({
      success: z.boolean().openapi({
        example: true,
      }),
      message: z.string().openapi({
        example: 'Practice set as active',
      }),
    }),
  })
  .openapi('SetActivePracticeResponse');

// Error response schemas
export const errorResponseSchema = z
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
        }),
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

export const notFoundResponseSchema = z
  .object({
    error: z.string().openapi({
      example: 'Not Found',
    }),
    message: z.string().openapi({
      example: 'Practice not found',
    }),
  })
  .openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z
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
export const practiceQuerySchema = z.object({
  includeDetails: z.coerce.boolean().default(true),
});

// Member validation schemas
export const memberRoleSchema = z.enum(['owner', 'admin', 'attorney', 'paralegal', 'member']);

export const updateMemberRoleSchema = z.object({
  member_id: z.uuid().openapi({
    description: 'Member ID to update (from listMembers response)',
    example: 'member_123e4567-e89b-12d3-a456-426614174000',
  }),
  role: memberRoleSchema.openapi({
    description: 'New role for the member',
    example: 'admin',
  }),
});

export const memberListItemSchema = z.object({
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

export const membersListResponseSchema = z.object({
  members: z.array(memberListItemSchema),
});

// Invitation validation schemas
export const createInvitationSchema = z.object({
  email: z.email(),
  role: memberRoleSchema,
});

export const invitationListItemSchema = z.object({
  id: z.string().openapi({
    description: 'Invitation ID',
    example: 'inv_1234567890',
  }),
  organization_id: z.string().uuid().openapi({
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

export const invitationsListResponseSchema = z.object({
  invitations: z.array(invitationListItemSchema),
});

export const acceptInvitationResponseSchema = z.object({
  success: z.boolean(),
  organization: z.any(), // Organization object from Better Auth
});

// Infer types from schemas
export type CreatePracticeRequest = z.infer<typeof createPracticeSchema>;
export type UpdatePracticeRequest = z.infer<typeof updatePracticeSchema>;
export type PracticeQueryParams = z.infer<typeof practiceQuerySchema>;
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>;
