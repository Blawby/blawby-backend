import { and, or, eq, isNull } from 'drizzle-orm';
import type { ResolvedClientForInvoice } from '@/modules/invoices/types/invoices.types';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { members, users } from '@/schema/better-auth-schema';
import { HTTPException } from 'hono/http-exception';
import { db } from '@/shared/database';
import { createSystemContext } from '@/shared/types/service-context';

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
            where: eq(stripeConnectedAccounts.id, connectedAccountId),
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
      // Minimal DB-only insert to get the ID required for Foreign Key
      const [newDetail] = await db
        .insert(clients)
        .values({
          organization_id: organizationId,
          user_id: memberMatch.user.id,
          status: 'active',
        })
        .returning();

      // Fire-and-forget background processing for Stripe and events
      void clientsCrudService.ensureClientSetup({ id: newDetail.id }, createSystemContext(organizationId, 'system'));

      // Re-fetch to populate relations for the remainder of the process
      clientDetails = await db.query.clients.findFirst({
        where: eq(clients.id, newDetail.id),
        with: {
          user: true,
          organization: {
            with: {
              stripeConnectedAccounts: {
                where: eq(stripeConnectedAccounts.id, connectedAccountId),
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

  // Extract connected account
  const connectedAccount = clientDetails.organization?.stripeConnectedAccounts?.[0] ?? null;

  // Return normalized result
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
 * Resolves a userId to a userDetails.id for the given org.
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
} as const;
