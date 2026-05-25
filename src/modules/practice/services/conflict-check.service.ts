import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { and, eq, gt, isNull, isNotNull, sql } from 'drizzle-orm';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { db } from '@/shared/database';
import { ConflictCheckCompleted } from '@/shared/events/definitions/engagement-contracts';
import type { ServiceContext } from '@/shared/types/service-context';
import type {
  ConflictCheckInput,
  ConflictCheckResult,
  ConflictCheckStatus,
  ConflictCheckWarning,
} from '@/modules/practice/types/conflict-check.types';

const logger = getLogger(['practice', 'conflict-check-service']);

const SIMILARITY_THRESHOLD = 0.35;
const CONFLICT_THRESHOLD = 0.7;

const normalizeTerms = (input: ConflictCheckInput): string[] => {
  const terms = [input.name, ...(input.aliases ?? []), input.opposing_party ?? '']
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);

  return [...new Set(terms)];
};

const getSuggestedAction = (status: ConflictCheckStatus): string => {
  const suggestedActions: Record<ConflictCheckStatus, string> = {
    clear: 'No conflicts found. You may proceed with this matter.',
    review_required: 'Potential conflicts found. Review the matches before proceeding.',
    conflicted: 'Likely conflict detected. Do not proceed without attorney review.',
    insufficient_data: 'Provide a full name (at least 3 characters) for an accurate conflict check.',
  };

  return suggestedActions[status];
};

const buildWarnings = async (organizationId: string, input: ConflictCheckInput): Promise<ConflictCheckWarning[]> => {
  if (!input.state && !input.practice_service_key) {
    return [];
  }

  const details = await findPracticeDetailsByOrganization(organizationId);
  if (!details) {
    return [];
  }

  const warnings: ConflictCheckWarning[] = [];

  if (input.state) {
    const state = input.state.toUpperCase();
    const supported = details.supported_states ?? [];
    const serviceStates = details.service_states ?? [];

    const inSupportedStates = supported.some((entry) => !entry.states || entry.states.includes(state));
    const inServiceStates = serviceStates.includes(state);

    if (!inSupportedStates && !inServiceStates) {
      warnings.push({
        type: 'unsupported_state',
        message: `Practice does not serve clients in ${state}.`,
      });
    }
  }

  if (input.practice_service_key) {
    const services = details.services ?? [];
    const offered = services.some((s) => s.key === input.practice_service_key);

    if (services.length > 0 && !offered) {
      warnings.push({
        type: 'unsupported_service',
        message: `Practice does not offer the requested service (${input.practice_service_key}).`,
      });
    }
  }

  return warnings;
};

const runConflictCheck = async (
  { data }: { data: ConflictCheckInput },
  ctx: ServiceContext
): Promise<ConflictCheckResult> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');

  const normalizedName = data.name.trim();
  if (normalizedName.length < 3) {
    return {
      status: 'insufficient_data',
      conflicting_matters: [],
      conflicting_contacts: [],
      warnings: [],
      suggested_next_action: getSuggestedAction('insufficient_data'),
    };
  }

  const terms = normalizeTerms(data);
  const matterMatches = new Map<
    string,
    {
      matter_id: string;
      title: string;
      similarity_score: number;
      match_field: 'on_behalf_of' | 'opposing_party';
    }
  >();
  const contactMatches = new Map<
    string,
    {
      client_id: string;
      name: string;
      similarity_score: number;
      date_of_birth: string | null;
    }
  >();

  for (const term of terms) {
    const [onBehalfMatches, opposingMatches, clientMatches] = await Promise.all([
      db
        .select({
          matter_id: matters.id,
          title: matters.title,
          similarity_score: sql<number>`similarity(${matters.on_behalf_of}, ${term})`,
        })
        .from(matters)
        .where(
          and(
            eq(matters.organization_id, ctx.organizationId),
            isNull(matters.deleted_at),
            isNotNull(matters.on_behalf_of),
            gt(sql<number>`similarity(${matters.on_behalf_of}, ${term})`, SIMILARITY_THRESHOLD)
          )
        )
        .limit(25),
      db
        .select({
          matter_id: matters.id,
          title: matters.title,
          similarity_score: sql<number>`similarity(${matters.opposing_party}, ${term})`,
        })
        .from(matters)
        .where(
          and(
            eq(matters.organization_id, ctx.organizationId),
            isNull(matters.deleted_at),
            isNotNull(matters.opposing_party),
            gt(sql<number>`similarity(${matters.opposing_party}, ${term})`, SIMILARITY_THRESHOLD)
          )
        )
        .limit(25),
      db
        .select({
          client_id: clients.id,
          name: clients.name,
          similarity_score: sql<number>`similarity(${clients.name}, ${term})`,
          date_of_birth: clients.date_of_birth,
        })
        .from(clients)
        .where(
          and(
            eq(clients.organization_id, ctx.organizationId),
            isNull(clients.deleted_at),
            isNotNull(clients.name),
            gt(sql<number>`similarity(${clients.name}, ${term})`, SIMILARITY_THRESHOLD)
          )
        )
        .limit(25),
    ]);

    for (const row of onBehalfMatches) {
      const existing = matterMatches.get(row.matter_id);
      if (!existing || row.similarity_score > existing.similarity_score) {
        matterMatches.set(row.matter_id, {
          matter_id: row.matter_id,
          title: row.title,
          similarity_score: row.similarity_score,
          match_field: 'on_behalf_of',
        });
      }
    }

    for (const row of opposingMatches) {
      const existing = matterMatches.get(row.matter_id);
      if (!existing || row.similarity_score > existing.similarity_score) {
        matterMatches.set(row.matter_id, {
          matter_id: row.matter_id,
          title: row.title,
          similarity_score: row.similarity_score,
          match_field: 'opposing_party',
        });
      }
    }

    for (const row of clientMatches) {
      const existing = contactMatches.get(row.client_id);
      if (!existing || row.similarity_score > existing.similarity_score) {
        contactMatches.set(row.client_id, {
          client_id: row.client_id,
          name: row.name ?? 'Unknown',
          similarity_score: row.similarity_score,
          date_of_birth: row.date_of_birth,
        });
      }
    }
  }

  const conflicting_matters = [...matterMatches.values()].sort((a, b) => b.similarity_score - a.similarity_score);

  const conflicting_contacts = [...contactMatches.values()]
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .map(({ date_of_birth, ...rest }) => ({
      ...rest,
      dob_match: data.date_of_birth && date_of_birth ? data.date_of_birth === date_of_birth : null,
    }));

  const highestScore = Math.max(
    ...conflicting_matters.map((item) => item.similarity_score),
    ...conflicting_contacts.map((item) => item.similarity_score),
    0
  );

  let status: ConflictCheckStatus = 'clear';
  if (conflicting_matters.length > 0 || conflicting_contacts.length > 0) {
    status = highestScore >= CONFLICT_THRESHOLD ? 'conflicted' : 'review_required';
  }

  const warnings = await buildWarnings(ctx.organizationId, data);

  const result: ConflictCheckResult = {
    status,
    conflicting_matters,
    conflicting_contacts,
    warnings,
    suggested_next_action: getSuggestedAction(status),
  };

  if (data.matter_id) {
    const matterId = data.matter_id;
    const organization = await organizationRepository.findById(ctx.organizationId);
    const billingEmail = organization?.billingEmail;

    await db.transaction(async (tx) => {
      await tx
        .update(matters)
        .set({
          last_conflict_check_at: new Date(),
          last_conflict_check_result: {
            status: result.status,
            conflicting_matters: result.conflicting_matters,
            conflicting_contacts: result.conflicting_contacts,
            warnings: result.warnings,
            suggested_next_action: result.suggested_next_action,
            checked_at: new Date().toISOString(),
          },
          updated_at: new Date(),
        })
        .where(and(eq(matters.id, matterId), eq(matters.organization_id, ctx.organizationId)));

      if (!billingEmail) {
        logger.warn('Skipping ConflictCheckCompleted event: missing billingEmail', {
          organizationId: ctx.organizationId,
          matterId,
        });
      } else {
        await ctx.emit(
          ConflictCheckCompleted,
          {
            matter_id: matterId,
            organization_id: ctx.organizationId,
            result_status: result.status,
            practice_name: organization?.name ?? '',
            practice_email: billingEmail,
          },
          tx
        );
      }
    });
  }

  logger.info('Conflict check completed', {
    organizationId: ctx.organizationId,
    status: result.status,
    matterCount: result.conflicting_matters.length,
    contactCount: result.conflicting_contacts.length,
    warningCount: result.warnings.length,
  });

  return result;
};

export const conflictCheckService = {
  runConflictCheck,
};
