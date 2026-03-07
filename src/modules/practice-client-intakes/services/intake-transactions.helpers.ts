import { eq, sql } from 'drizzle-orm';

import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { parseMetadata } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type {
  CreatePracticeClientIntakeRequest,
  ClaimPracticeClientIntakeResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { userDetailsService } from '@/modules/user-details/services/user-details.service';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreatePracticeClientIntakeTxParams {
  request: CreatePracticeClientIntakeRequest & {
    clientIp?: string;
    userAgent?: string;
    origin?: string | null;
  };
  organizationId: string;
  validatedUserId?: string;
  intakeId: string;
  connectedAccountId?: string;
  paymentLinkId?: string | null;
  shouldBypassPayment: boolean;
}

export const executeCreatePracticeClientIntakeTx = async (
  tx: DbTransaction,
  params: CreatePracticeClientIntakeTxParams,
): Promise<SelectPracticeClientIntake> => {
  const {
    request,
    organizationId,
    validatedUserId,
    intakeId,
    connectedAccountId,
    paymentLinkId,
    shouldBypassPayment,
  } = params;

  // Create address record if provided
  let addressId: string | undefined;
  if (request.address) {
    const addressRecord = await upsertAddressTx(tx, {
      addressData: request.address,
      organizationId,
      userId: validatedUserId,
      type: 'client_intake',
    });
    addressId = addressRecord?.id;
  }

  // Store practice client intake in database
  return await practiceClientIntakesRepository.create(
    {
      id: intakeId,
      organization_id: organizationId,
      connected_account_id: connectedAccountId ?? null,
      stripe_payment_link_id: paymentLinkId,
      address_id: addressId,
      conversation_id: request.conversation_id,
      amount: request.amount,
      application_fee: fundRouterService.calculateApplicationFee(request.amount),
      currency: 'usd',
      status: shouldBypassPayment ? 'succeeded' : 'open',
      triage_status: 'pending_review',
      metadata: {
        email: request.email,
        name: request.name,
        phone: request.phone,
        on_behalf_of: request.on_behalf_of,
        opposing_party: request.opposing_party,
        description: request.description,
        address: request.address,
        ...(validatedUserId && { user_id: validatedUserId }),
      },
      client_ip: request.clientIp,
      user_agent: request.userAgent,
      urgency: request.urgency,
      desired_outcome: request.desired_outcome,
      court_date: request.court_date ? new Date(request.court_date) : undefined,
      has_documents: request.has_documents,
      income: request.income,
      household_size: request.household_size,
      case_strength: request.case_strength,
      ...(shouldBypassPayment && { succeeded_at: new Date() }),
    },
    tx,
  );
};

export interface ClaimPracticeClientIntakeTxParams {
  intakeId: string;
  userId: string;
}

export type ClaimIntakeAbort = {
  __claimIntakeResult: true;
  result: Result<ClaimPracticeClientIntakeResponse>;
};

export const isClaimIntakeAbort = (value: unknown): value is ClaimIntakeAbort => {
  return Boolean(
    value
    && typeof value === 'object'
    && '__claimIntakeResult' in value
    && (value as { __claimIntakeResult?: unknown }).__claimIntakeResult === true
    && 'result' in value,
  );
};

export const executeClaimPracticeClientIntakeTx = async (
  tx: DbTransaction,
  params: ClaimPracticeClientIntakeTxParams,
): Promise<Result<ClaimPracticeClientIntakeResponse>> => {
  const { intakeId, userId } = params;

  const rollbackWithResult = (resultValue: Result<ClaimPracticeClientIntakeResponse>): never => {
    throw {
      __claimIntakeResult: true,
      result: resultValue,
    } satisfies ClaimIntakeAbort;
  };

  await tx.execute(sql`
    SELECT 1
    FROM "practice_client_intakes"
    WHERE "id" = ${intakeId}
    FOR UPDATE
  `);

  const [lockedIntake] = await tx
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, intakeId))
    .limit(1);

  if (!lockedIntake) {
    rollbackWithResult(result.notFound('Practice client intake not found'));
  }

  if (lockedIntake.status !== 'succeeded') {
    rollbackWithResult(result.badRequest('Payment must be completed before claiming intake'));
  }

  const intakeMetadata = parseMetadata(lockedIntake.metadata) ?? { email: '', name: '' };
  if (!intakeMetadata.email || !intakeMetadata.name) {
    rollbackWithResult(result.badRequest('Intake metadata is incomplete'));
  }

  if (intakeMetadata.user_id && intakeMetadata.user_id !== userId) {
    rollbackWithResult(result.forbidden('This intake has already been claimed by another user'));
  }

  if (!intakeMetadata.user_id) {
    await tx
      .update(practiceClientIntakes)
      .set({
        metadata: {
          ...intakeMetadata,
          user_id: userId,
        },
        updated_at: new Date(),
      })
      .where(eq(practiceClientIntakes.id, intakeId));
  }

  const userDetailsResult = await userDetailsService.createUserDetailsFromIntake({
    organizationId: lockedIntake.organization_id,
    intakeId: lockedIntake.id,
    userId,
    email: intakeMetadata.email,
    name: intakeMetadata.name,
    phone: intakeMetadata.phone,
  });

  if (!userDetailsResult.success) {
    rollbackWithResult(
      result.fail(userDetailsResult.error.message, userDetailsResult.error.status, userDetailsResult.error.code),
    );
  }

  return result.ok({
    success: true,
    data: {
      intake_uuid: lockedIntake.id,
      organization_id: lockedIntake.organization_id,
    },
  });
};
