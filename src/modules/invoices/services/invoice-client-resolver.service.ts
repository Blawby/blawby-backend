import { and, or, eq, isNull } from 'drizzle-orm';
import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { StripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';
import type { ResolvedClientForInvoice } from '@/modules/invoices/types/invoices.types';
import { clients } from '@/modules/clients/database/schema/clients.schema';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { members, users } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { createSystemContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

/**
 * Resolves a client for invoice creation
 * Validates client exists and pre-loads connected account and matters
 */
const resolveClientForInvoice = async (
  organizationId: string,
  clientId: string,
  connectedAccountId: string
): Promise<Result<ResolvedClientForInvoice>> => {
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
    return result.notFound('Client not found or does not belong to this organization');
  }

  // Extract connected account
  const connectedAccount = clientDetails.organization?.stripeConnectedAccounts?.[0] ?? null;

  // Return normalized result
  return result.ok({
    id: clientDetails.id,
    user_id: clientDetails.user_id,
    name: clientDetails.user?.name ?? '',
    email: clientDetails.user?.email ?? '',
    status: clientDetails.status,
    organization_id: clientDetails.organization_id,
    connectedAccount,
    matters: clientDetails.matters ?? [],
  });
};

/**
 * Resolves a userId to a userDetails.id for the given org.
 * Used by client-facing invoice endpoints so the client never passes their own identifier.
 */
const resolveUserDetailId = async (organizationId: string, userId: string): Promise<Result<string>> => {
  const detail = await db.query.clients.findFirst({
    where: and(eq(clients.organization_id, organizationId), eq(clients.user_id, userId), isNull(clients.deleted_at)),
    columns: { id: true },
  });
  if (!detail) {
    return result.notFound('Client record not found in this organization');
  }
  return result.ok(detail.id);
};

export const invoiceClientResolver = {
  resolveClientForInvoice,
  resolveUserDetailId,
};
