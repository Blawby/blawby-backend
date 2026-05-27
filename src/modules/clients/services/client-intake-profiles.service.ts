import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { clientIntakeProfilesRepository } from '@/modules/clients/database/queries/client-intake-profiles.queries';
import { clientsRepository } from '@/modules/clients/database/queries/clients.queries';
import type {
  InsertClientIntakeProfile,
  SelectClientIntakeProfile,
} from '@/modules/clients/database/schema/client-intake-profiles.schema';
import type { UpdateIntakeProfileInput } from '@/modules/clients/validations/client-intake-profiles.validation';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['clients', 'intake-profile-service']);

type UpsertProfilePayload = Partial<Omit<InsertClientIntakeProfile, 'id' | 'client_id' | 'created_at' | 'updated_at'>>;

const assertClientInOrg = async (clientId: string, ctx: ServiceContext): Promise<void> => {
  const client = await clientsRepository.findById(clientId);
  if (!client || client.organization_id !== ctx.organizationId) {
    throw new HTTPException(404, { message: 'Client not found' });
  }
};

/**
 * Build the column payload. Non-discount fields merge individually. The
 * discount (amount_off / percent_off / currency) is written as a unit whenever
 * any of its fields is provided, so the unused side is always cleared.
 */
const buildUpsertPayload = (data: UpdateIntakeProfileInput): UpsertProfilePayload => {
  const { amount_off, percent_off, currency, ...rest } = data;
  const payload: UpsertProfilePayload = { ...rest };

  if ('amount_off' in data || 'percent_off' in data || 'currency' in data) {
    payload.amount_off = amount_off ?? null;
    payload.percent_off = percent_off ?? null;
    payload.currency = currency ?? null;
  }

  return payload;
};

const getProfile = async (params: { clientId: string }, ctx: ServiceContext): Promise<SelectClientIntakeProfile> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'ClientIntakeProfile');

  const { clientId } = params;

  try {
    await assertClientInOrg(clientId, ctx);

    const profile = await clientIntakeProfilesRepository.findByClientId(clientId);
    if (!profile) {
      throw new HTTPException(404, { message: 'Intake profile not found' });
    }

    return profile;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get client intake profile: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to get client intake profile' });
  }
};

const upsertProfile = async (
  params: { clientId: string; data: UpdateIntakeProfileInput },
  ctx: ServiceContext
): Promise<SelectClientIntakeProfile> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'ClientIntakeProfile');

  const { clientId, data } = params;

  try {
    await assertClientInOrg(clientId, ctx);

    return await clientIntakeProfilesRepository.upsert(clientId, buildUpsertPayload(data));
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to upsert client intake profile: {error}', { error, organizationId: ctx.organizationId });
    throw new HTTPException(500, { message: 'Failed to save client intake profile' });
  }
};

export const clientIntakeProfilesService = {
  getProfile,
  upsertProfile,
};
