import { eq } from 'drizzle-orm';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import type { AddressData } from '@/modules/practice/types/addresses.types';
import type { db } from '@/shared/database';

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
    addressId?: string | null;
    type?: string;
  }
) => {
  const { addressData, organizationId, addressId, type = 'practice_location' } = params;

  const dataToSave = {
    line1: addressData.line1,
    line2: addressData.line2,
    city: addressData.city,
    state: addressData.state,
    postal_code: addressData.postal_code,
    country: addressData.country,
  };

  if (addressId) {
    const [updatedAddress] = await tx
      .update(addresses)
      .set({ ...dataToSave, updated_at: new Date() })
      .where(eq(addresses.id, addressId))
      .returning();

    return updatedAddress;
  } else {
    const [newAddress] = await tx
      .insert(addresses)
      .values({
        organization_id: organizationId,
        type,
        ...dataToSave,
      })
      .returning();

    return newAddress;
  }
};
