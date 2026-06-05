import { eq, and, inArray } from 'drizzle-orm';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import { db } from '@/shared/database';

export const findAddressesByIds = async (addressIds: string[]): Promise<(typeof addresses.$inferSelect)[]> =>
  addressIds.length === 0 ? [] : await db.select().from(addresses).where(inArray(addresses.id, addressIds));

/**
 * Upsert an address within a transaction.
 * If addressId is provided, updates the existing address.
 * Otherwise, inserts a new address.
 */
export const upsertAddressTx = async (
  tx: typeof db,
  params: {
    addressData: AddressData;
    organizationId: string;
    userId?: string | null;
    addressId?: string | null;
    type?: string;
  }
): Promise<typeof addresses.$inferSelect | undefined> => {
  const { addressData, organizationId, userId, addressId: providedAddressId, type = 'practice_location' } = params;
  let targetAddressId = providedAddressId;

  // If no addressId provided but userId is present, try to find existing address of this type
  if (!targetAddressId && userId) {
    const existing = await tx.query.addresses.findFirst({
      where: and(
        eq(addresses.user_id, userId),
        eq(addresses.organization_id, organizationId),
        eq(addresses.type, type)
      ),
    });
    targetAddressId = existing?.id;
  }

  const dataToSave = {
    line1: addressData.line1,
    line2: addressData.line2,
    city: addressData.city,
    state: addressData.state,
    postal_code: addressData.postal_code,
    country: addressData.country,
  };

  if (targetAddressId) {
    const [updatedAddress] = await tx
      .update(addresses)
      .set({ ...dataToSave, updated_at: new Date() })
      .where(and(eq(addresses.id, targetAddressId), eq(addresses.organization_id, organizationId)))
      .returning();

    return updatedAddress;
  } else {
    const [newAddress] = await tx
      .insert(addresses)
      .values({
        organization_id: organizationId,
        user_id: userId,
        type,
        ...dataToSave,
      })
      .returning();

    return newAddress;
  }
};
