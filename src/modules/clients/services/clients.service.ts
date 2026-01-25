import { getLogger } from '@logtape/logtape';
import { practiceClientsRepository } from '@/modules/clients/database/queries/practice-clients.queries';
import {
  type InsertPracticeClient,
  type SelectPracticeClient,
} from '@/modules/clients/database/schema/practice-clients.schema';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['clients', 'service']);

export interface AddressInput {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

const createClient = async (
  organizationId: string,
  data: Omit<InsertPracticeClient, 'organization_id' | 'stripe_customer_id'> & { address?: AddressInput },
  userId: string,
): Promise<Result<SelectPracticeClient>> => {
  return await db.transaction(async (tx) => {
    try {
      // 1. Get connected account for Stripe
      const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);

      let stripeCustomerId: string | undefined;

      if (connectedAccount?.stripe_account_id) {
        try {
          const stripeCustomer = await stripe.customers.create({
            email: data.email,
            name: data.name,
            phone: data.phone || undefined,
            metadata: {
              organization_id: organizationId,
              source: 'blawby_clients_api',
            },
          }, {
            stripeAccount: connectedAccount.stripe_account_id,
          });
          stripeCustomerId = stripeCustomer.id;
        } catch (stripeError) {
          logger.error('Failed to create Stripe customer for client {email}: {error}', {
            email: data.email,
            error: stripeError,
            organizationId,
          });
        }
      }

      // 2. Handle Address
      let addressId: string | undefined;
      if (data.address) {
        const address = await upsertAddressTx(tx as any, {
          addressData: {
            line1: data.address.line1,
            line2: data.address.line2,
            city: data.address.city,
            state: data.address.state,
            postal_code: data.address.postalCode,
            country: data.address.country,
          },
          organizationId,
          type: 'client',
        });
        addressId = address?.id;
      }

      // 3. Create Client
      const client = await practiceClientsRepository.create({
        ...data,
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
        address_id: addressId,
      } as any);

      // 4. Publish event
      void publishSimpleEvent(
        EventType.CLIENT_CREATED,
        userId,
        organizationId,
        {
          client_id: client.id,
          name: client.name,
          email: client.email,
          stripe_customer_id: client.stripe_customer_id,
        },
      );

      return ok(client);
    } catch (error) {
      logger.error('Failed to create client: {error}', { error, organizationId });
      return internalError('Failed to create client');
    }
  });
};

const updateClient = async (
  id: string,
  organizationId: string,
  data: Partial<InsertPracticeClient> & { address?: AddressInput },
  userId: string,
): Promise<Result<SelectPracticeClient>> => {
  return await db.transaction(async (tx) => {
    try {
      const client = await practiceClientsRepository.findById(id);
      if (!client || client.organization_id !== organizationId) {
        return notFound('Client not found');
      }

      // 1. Handle Address
      let address_id = client.address_id;
      if (data.address) {
        const address = await upsertAddressTx(tx as any, {
          addressData: {
            line1: data.address.line1,
            line2: data.address.line2,
            city: data.address.city,
            state: data.address.state,
            postal_code: data.address.postalCode,
            country: data.address.country,
          },
          organizationId,
          addressId: client.address_id,
          type: 'client',
        });
        address_id = address?.id ?? address_id;
      }

      // 2. Sync to Stripe if needed
      if (client.stripe_customer_id && (data.name || data.email || data.phone)) {
        const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
        if (connectedAccount?.stripe_account_id) {
          try {
            await stripe.customers.update(client.stripe_customer_id, {
              email: data.email || undefined,
              name: data.name || undefined,
              phone: data.phone || undefined,
            }, {
              stripeAccount: connectedAccount.stripe_account_id,
            });
          } catch (stripeError) {
            logger.error('Failed to update Stripe customer {customerId}: {error}', {
              customerId: client.stripe_customer_id,
              error: stripeError,
            });
          }
        }
      }

      const { address, ...clientData } = data;
      const updated = await practiceClientsRepository.update(id, {
        ...clientData,
        address_id,
      });
      if (!updated) return internalError('Failed to update client');

      void publishSimpleEvent(
        EventType.CLIENT_UPDATED,
        userId,
        organizationId,
        {
          client_id: updated.id,
          changes: Object.keys(data),
        },
      );

      return ok(updated);
    } catch (error) {
      logger.error('Failed to update client {id}: {error}', { id, error });
      return internalError('Failed to update client');
    }
  });
};

const listClients = async (params: {
  organizationId: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Result<{ data: SelectPracticeClient[]; total: number }>> => {
  try {
    const result = await practiceClientsRepository.listClients(params);
    return ok(result);
  } catch (error) {
    logger.error('Failed to list clients: {error}', { error, organizationId: params.organizationId });
    return internalError('Failed to list clients');
  }
};

const getClient = async (id: string, organizationId: string): Promise<Result<SelectPracticeClient>> => {
  try {
    const client = await practiceClientsRepository.findById(id);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }
    return ok(client);
  } catch (error) {
    logger.error('Failed to get client {id}: {error}', { id, error });
    return internalError('Failed to get client');
  }
};

const deleteClient = async (id: string, organizationId: string, userId: string): Promise<Result<void>> => {
  try {
    const client = await practiceClientsRepository.findById(id);
    if (!client || client.organization_id !== organizationId) {
      return notFound('Client not found');
    }

    await practiceClientsRepository.softDelete(id, userId);

    void publishSimpleEvent(
      EventType.CLIENT_DELETED,
      userId,
      organizationId,
      { client_id: id },
    );

    return ok(undefined);
  } catch (error) {
    logger.error('Failed to delete client {id}: {error}', { id, error });
    return internalError('Failed to delete client');
  }
};

const createClientFromIntake = async (params: {
  organizationId: string;
  intakeId: string;
  email: string;
  name: string;
  phone?: string;
  metadata?: any;
}): Promise<Result<SelectPracticeClient>> => {
  const {
    organizationId, intakeId, email, name, phone,
  } = params;

  try {
    const existingClient = await practiceClientsRepository.findByEmail(organizationId, email);

    if (existingClient) {
      if (!existingClient.intake_id) {
        await practiceClientsRepository.update(existingClient.id, {
          intake_id: intakeId,
          status: 'active',
          updated_at: new Date(),
        });
      }
      return ok(existingClient);
    }

    const connectedAccount = await onboardingRepository.findByOrganizationId(organizationId);
    let stripeCustomerId: string | undefined;

    if (connectedAccount?.stripe_account_id) {
      try {
        const stripeCustomer = await stripe.customers.create({
          email,
          name,
          phone,
          metadata: {
            organization_id: organizationId,
            intake_id: intakeId,
            source: 'blawby_intake',
          },
        }, {
          stripeAccount: connectedAccount.stripe_account_id,
        });
        stripeCustomerId = stripeCustomer.id;
      } catch (stripeError) {
        logger.error('Failed to create Stripe customer from intake for {email}: {error}', {
          email,
          error: stripeError,
        });
      }
    }

    const client = await practiceClientsRepository.create({
      organization_id: organizationId,
      intake_id: intakeId,
      email,
      name,
      phone,
      stripe_customer_id: stripeCustomerId,
      status: 'active',
      event_name: 'client_intake_success',
    });

    void publishSimpleEvent(
      EventType.CLIENT_CREATED,
      'system',
      organizationId,
      {
        client_id: client.id,
        intake_id: intakeId,
        source: 'intake',
      },
    );

    return ok(client);
  } catch (error) {
    logger.error('Failed to create client from intake {intakeId}: {error}', { intakeId, error });
    return internalError('Failed to create client from intake');
  }
};

export const clientsService = {
  createClient,
  updateClient,
  listClients,
  getClient,
  deleteClient,
  createClientFromIntake,
};
