import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  practiceClientIntakesSchema,
  type InsertPracticeClientIntake,
  type SelectPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getActiveTx } from '@/shared/database/uow';
import { escapeLikeWildcards } from '@/shared/utils/database';

const { practiceClientIntakes } = practiceClientIntakesSchema;

const buildIntakeConditions = ({
  organizationId,
  status,
  search,
  from,
  to,
}: {
  organizationId: string;
  status?: string;
  search?: string;
  from?: Date;
  to?: Date;
}) => {
  const triageStatuses = ['pending_review', 'accepted', 'declined'];
  const conditions = [eq(practiceClientIntakes.organization_id, organizationId)];

  if (status) {
    if (triageStatuses.includes(status)) {
      conditions.push(eq(practiceClientIntakes.triage_status, status));
    } else {
      conditions.push(eq(practiceClientIntakes.status, status));
    }
  }

  if (search) {
    const escapedSearch = escapeLikeWildcards(search);
    conditions.push(
      or(
        ilike(sql`${practiceClientIntakes.metadata}->>'email'`, `%${escapedSearch}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'name'`, `%${escapedSearch}%`),
        ilike(sql`${practiceClientIntakes.metadata}->>'opposing_party'`, `%${escapedSearch}%`)
      )!
    );
  }

  if (from) {
    conditions.push(gte(practiceClientIntakes.created_at, from));
  }

  if (to) {
    conditions.push(lte(practiceClientIntakes.created_at, to));
  }

  return and(...conditions.filter((c): c is NonNullable<typeof c> => c !== undefined));
};

const create = async (data: InsertPracticeClientIntake): Promise<SelectPracticeClientIntake> => {
  const [row] = await getActiveTx().insert(practiceClientIntakes).values(data).returning();
  return row;
};

const findByKrabiClawRequestKey = async (
  organizationId: string,
  requestKey: string
): Promise<SelectPracticeClientIntake | undefined> => {
  const [intake] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(
      and(
        eq(practiceClientIntakes.organization_id, organizationId),
        eq(practiceClientIntakes.krabiclaw_request_key, requestKey)
      )
    )
    .limit(1);
  return intake;
};

const createWithKrabiClawRequestKey = async (
  data: InsertPracticeClientIntake & { krabiclaw_request_key: string }
): Promise<SelectPracticeClientIntake> => {
  const [intake] = await getActiveTx()
    .insert(practiceClientIntakes)
    .values(data)
    .onConflictDoNothing({
      target: [practiceClientIntakes.organization_id, practiceClientIntakes.krabiclaw_request_key],
      where: sql`${practiceClientIntakes.krabiclaw_request_key} IS NOT NULL`,
    })
    .returning();
  if (intake) {
    return intake;
  }

  const existing = await findByKrabiClawRequestKey(data.organization_id, data.krabiclaw_request_key);
  if (!existing) {
    throw new Error('Failed to create idempotent krabiclaw intake');
  }
  return existing;
};

const findById = async (id: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, id))
    .limit(1);
  return row;
};

const findByIdForUpdate = async (id: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.id, id))
    .for('update')
    .limit(1);
  return row;
};

const findByInvitationPrefillTokenHash = async (tokenHash: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.invitation_prefill_token_hash, tokenHash))
    .limit(1);
  return row;
};

const findByStripePaymentLinkId = async (linkId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_link_id, linkId))
    .limit(1);
  return row;
};

const findByStripePaymentIntentId = async (intentId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_payment_intent_id, intentId))
    .limit(1);
  return row;
};

const findByStripeCheckoutSessionId = async (sessionId: string): Promise<SelectPracticeClientIntake | undefined> => {
  const [row] = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(eq(practiceClientIntakes.stripe_checkout_session_id, sessionId))
    .limit(1);
  return row;
};

/**
 * Conditionally attach a Stripe Checkout Session id to an intake that has none yet. The
 * `IS NULL` guard makes this a compare-and-set: only the first caller to reach this row wins,
 * and every other concurrent caller (any `requestKey`/session pairing) gets back `undefined`
 * instead of overwriting an already-attached session id. Callers must re-read the row to learn
 * which session id actually won (R10).
 */
const attachCheckoutSessionIfAbsent = async (
  id: string,
  sessionId: string
): Promise<SelectPracticeClientIntake | undefined> => {
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({ stripe_checkout_session_id: sessionId, updated_at: new Date() })
    .where(and(eq(practiceClientIntakes.id, id), isNull(practiceClientIntakes.stripe_checkout_session_id)))
    .returning();
  return updated;
};

const update = async (id: string, data: Partial<SelectPracticeClientIntake>): Promise<SelectPracticeClientIntake> => {
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({ ...data, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  if (!updated) throw new Error(`PracticeClientIntake not found for id: ${id}`);
  return updated;
};

const updateStatus = async (id: string, status: string): Promise<SelectPracticeClientIntake> => {
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({ status, updated_at: new Date() })
    .where(eq(practiceClientIntakes.id, id))
    .returning();
  if (!updated) {
    throw new Error(`PracticeClientIntake not found for id: ${id}`);
  }
  return updated;
};

const setInvitationPrefillToken = async (id: string, organizationId: string, tokenHash: string): Promise<boolean> => {
  const result = await getActiveTx()
    .update(practiceClientIntakes)
    .set({
      invitation_prefill_token_hash: tokenHash,
      updated_at: new Date(),
    })
    .where(and(eq(practiceClientIntakes.id, id), eq(practiceClientIntakes.organization_id, organizationId)));
  return result.rowCount === 1;
};

const findByOrganizationId = async ({
  organizationId,
  status,
  search,
  from,
  to,
  page = 1,
  limit = 20,
}: {
  organizationId: string;
  status?: string;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}): Promise<{ intakes: SelectPracticeClientIntake[]; total: number }> => {
  const whereClause = buildIntakeConditions({ organizationId, status, search, from, to });

  const [totalResult] = await getActiveTx()
    .select({ count: sql<number>`count(*)` })
    .from(practiceClientIntakes)
    .where(whereClause);

  const total = Number(totalResult?.count ?? 0);

  const intakes = await getActiveTx()
    .select()
    .from(practiceClientIntakes)
    .where(whereClause)
    .orderBy(desc(practiceClientIntakes.created_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return { intakes, total };
};

const getStats = async (
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ totalAmount: number; count: number; succeededCount: number }> => {
  const whereClause = buildIntakeConditions({ organizationId, from: startDate, to: endDate });

  const results = await getActiveTx()
    .select({ totalAmount: practiceClientIntakes.amount, status: practiceClientIntakes.status })
    .from(practiceClientIntakes)
    .where(whereClause);

  const totalAmount = results.reduce((sum, row) => sum + row.totalAmount, 0);
  const count = results.length;
  const succeededCount = results.filter((row) => row.status === 'succeeded').length;

  return {
    totalAmount,
    count,
    succeededCount,
  };
};

const requestEnrichment = async (
  id: string,
  organizationId: string
): Promise<SelectPracticeClientIntake | undefined> => {
  const now = new Date();
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({
      enrichment_status: 'pending',
      enrichment_version: sql`${practiceClientIntakes.enrichment_version} + 1`,
      enrichment_error_code: null,
      enrichment_requested_at: now,
      updated_at: now,
    })
    .where(and(eq(practiceClientIntakes.id, id), eq(practiceClientIntakes.organization_id, organizationId)))
    .returning();
  return updated;
};

const claimEnrichment = async (
  id: string,
  organizationId: string,
  version: number
): Promise<SelectPracticeClientIntake | undefined> => {
  const claimToken = crypto.randomUUID();
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({
      enrichment_status: 'processing',
      enrichment_attempt_count: sql`${practiceClientIntakes.enrichment_attempt_count} + 1`,
      enrichment_claim_token: claimToken,
      enrichment_error_code: null,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(practiceClientIntakes.id, id),
        eq(practiceClientIntakes.organization_id, organizationId),
        eq(practiceClientIntakes.enrichment_version, version),
        inArray(practiceClientIntakes.enrichment_status, ['pending', 'processing', 'failed'])
      )
    )
    .returning();
  return updated;
};

const completeEnrichment = async (
  id: string,
  organizationId: string,
  version: number,
  claimToken: string,
  data: {
    transcriptSummary: string;
    urgency: 'routine' | 'time_sensitive' | 'emergency';
    desiredOutcome: string | null;
    model: string;
  }
): Promise<SelectPracticeClientIntake | undefined> => {
  const now = new Date();
  const [updated] = await getActiveTx()
    .update(practiceClientIntakes)
    .set({
      transcript_summary: data.transcriptSummary,
      urgency: data.urgency,
      desired_outcome: data.desiredOutcome,
      enrichment_status: 'succeeded',
      enrichment_model: data.model,
      enrichment_error_code: null,
      enriched_at: now,
      updated_at: now,
    })
    .where(
      and(
        eq(practiceClientIntakes.id, id),
        eq(practiceClientIntakes.organization_id, organizationId),
        eq(practiceClientIntakes.enrichment_version, version),
        eq(practiceClientIntakes.enrichment_status, 'processing'),
        eq(practiceClientIntakes.enrichment_claim_token, claimToken)
      )
    )
    .returning();
  return updated;
};

const failEnrichment = async (
  id: string,
  organizationId: string,
  version: number,
  claimToken: string,
  errorCode: string
): Promise<boolean> => {
  const result = await getActiveTx()
    .update(practiceClientIntakes)
    .set({ enrichment_status: 'failed', enrichment_error_code: errorCode, updated_at: new Date() })
    .where(
      and(
        eq(practiceClientIntakes.id, id),
        eq(practiceClientIntakes.organization_id, organizationId),
        eq(practiceClientIntakes.enrichment_version, version),
        eq(practiceClientIntakes.enrichment_status, 'processing'),
        eq(practiceClientIntakes.enrichment_claim_token, claimToken)
      )
    );
  return result.rowCount === 1;
};

export const practiceClientIntakesRepository = {
  create,
  findByKrabiClawRequestKey,
  createWithKrabiClawRequestKey,
  findById,
  findByIdForUpdate,
  findByInvitationPrefillTokenHash,
  findByStripePaymentLinkId,
  findByStripePaymentIntentId,
  findByStripeCheckoutSessionId,
  attachCheckoutSessionIfAbsent,
  update,
  updateStatus,
  setInvitationPrefillToken,
  findByOrganizationId,
  getStats,
  requestEnrichment,
  claimEnrichment,
  completeEnrichment,
  failEnrichment,
};

export type PracticeClientIntakesRepository = typeof practiceClientIntakesRepository;
