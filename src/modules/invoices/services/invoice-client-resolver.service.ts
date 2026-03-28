import { and, or, eq, isNull } from 'drizzle-orm';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type { ResolvedClientForInvoice } from '@/modules/invoices/types/invoices.types';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { clientsSetupService } from '@/modules/clients/services/clients-setup.service';
import { members, users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { createSystemContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'client-resolver-service']);

/**
 * Resolves a client for invoice creation
 * Validates client exists and pre-loads connected account and matters
 */
const resolveClientForInvoice = async (
  organizationId: string,
  clientId: string,
  connectedAccountId: string
): Promise<ResolvedClientForInvoice> => {
  // 1. Try to find existing user_details by ID or UserID
  let clientDetails = await db.query.clients.findFirst({
    where: and(
      or(eq(clients.id, clientId), eq(clients.user_id, clientId)),
      eq(clients.organization_id, organizationId),
      isNull(clients.deleted_at)
    ),
    with: {
      user: true,
      organization: {
        with: {
          stripeConnectedAccounts: {
            where: (acc, { eq: eqOp }) => eqOp(acc.id, connectedAccountId),
          },
        },
      },
      matters: true,
    },
  });

  // 2. Auto-vivify if missing but user is a member
  if (!clientDetails) {
    const [memberMatch] = await db
      .select({
        user: users,
        organizationId: members.organizationId,
      })
      .from(users)
      .innerJoin(members, and(eq(users.id, members.userId), eq(members.organizationId, organizationId)))
      .where(eq(users.id, clientId))
      .limit(1);

    if (memberMatch) {
      const [newDetail] = await db
        .insert(clients)
        .values({
          organization_id: organizationId,
          user_id: memberMatch.user.id,
          name: memberMatch.user.name,
          email: memberMatch.user.email,
          status: 'active',
        })
        .returning();

      void clientsSetupService
        .ensureClientSetup({ id: newDetail.id }, createSystemContext(organizationId, 'system'))
        .catch((error) => {
          logger.error('Failed to auto-setup client after auto-vivification {clientId} {organizationId}: {error}', {
            clientId: newDetail.id,
            organizationId,
            error,
          });
        });

      clientDetails = await db.query.clients.findFirst({
        where: eq(clients.id, newDetail.id),
        with: {
          user: true,
          organization: {
            with: {
              stripeConnectedAccounts: {
                where: (acc, { eq: eqOp }) => eqOp(acc.id, connectedAccountId),
              },
            },
          },
          matters: true,
        },
      });
    }
  }

  if (!clientDetails) {
    throw new HTTPException(404, { message: 'Client not found or does not belong to this organization' });
  }

  const connectedAccount = clientDetails.organization?.stripeConnectedAccounts?.[0] ?? null;

  return {
    id: clientDetails.id,
    user_id: clientDetails.user_id,
    name: clientDetails.user?.name ?? '',
    email: clientDetails.user?.email ?? '',
    status: clientDetails.status,
    organization_id: clientDetails.organization_id,
    connectedAccount,
    matters: clientDetails.matters ?? [],
  };
};

/**
 * Resolves a userId to a client id for the given org.
 * Used by client-facing invoice endpoints so the client never passes their own identifier.
 */
const resolveUserDetailId = async (organizationId: string, userId: string): Promise<string> => {
  const detail = await db.query.clients.findFirst({
    where: and(eq(clients.organization_id, organizationId), eq(clients.user_id, userId), isNull(clients.deleted_at)),
    columns: { id: true },
  });

  if (!detail) {
    throw new HTTPException(404, { message: 'Client record not found in this organization' });
  }

  return detail.id;
};

export const invoiceClientResolver = {
  resolveClientForInvoice,
  resolveUserDetailId,
};
