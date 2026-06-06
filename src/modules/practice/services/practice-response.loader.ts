import { findAddressesByIds } from '@/modules/practice/database/queries/address.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganizations } from '@/modules/practice/database/queries/practice-details.repository';
import { practiceServicesRepository } from '@/modules/practice/database/queries/practice-services.repository';
import type { PracticeDetails, PracticeService } from '@/modules/practice/database/schema/practice.schema';
import { serializePractice } from '@/modules/practice/serializers/practice.serializer';
import type { PracticeResponse } from '@/modules/practice/types/practice.types';
import type { Address } from '@/shared/validations/address';

const toResponseAddress = (address: Awaited<ReturnType<typeof findAddressesByIds>>[number]): Address => ({
  line1: address.line1 ?? undefined,
  line2: address.line2 ?? undefined,
  city: address.city ?? undefined,
  state: address.state ?? undefined,
  postal_code: address.postal_code ?? undefined,
  country: address.country ?? undefined,
});

const groupServicesByOrganization = (services: PracticeService[]): Map<string, PracticeService[]> => {
  const servicesByOrganization = new Map<string, PracticeService[]>();

  for (const service of services) {
    const current = servicesByOrganization.get(service.organization_id) ?? [];
    current.push(service);
    servicesByOrganization.set(service.organization_id, current);
  }

  return servicesByOrganization;
};

export const loadPracticeResponsesForOrganizationIds = async (
  organizationIds: string[]
): Promise<PracticeResponse[]> => {
  if (organizationIds.length === 0) {
    return [];
  }

  const organizations = await organizationRepository.findByIds(organizationIds);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const orderedOrganizations = organizationIds
    .map((organizationId) => organizationsById.get(organizationId))
    .filter((organization): organization is NonNullable<typeof organization> => Boolean(organization));

  const [details, services] = await Promise.all([
    findPracticeDetailsByOrganizations(organizationIds),
    practiceServicesRepository.findServicesByOrganizations(organizationIds),
  ]);
  const detailsByOrganization = new Map<string, PracticeDetails>(
    details.map((practiceDetails) => [practiceDetails.organization_id, practiceDetails])
  );
  const addressIds = details
    .map((practiceDetails) => practiceDetails.address_id)
    .filter((addressId): addressId is string => addressId !== null);
  const addresses = await findAddressesByIds(addressIds);
  const addressesById = new Map(addresses.map((address) => [address.id, toResponseAddress(address)]));
  const servicesByOrganization = groupServicesByOrganization(services);

  return orderedOrganizations.flatMap((organization) => {
    const practiceDetails = detailsByOrganization.get(organization.id);
    if (!practiceDetails) {
      return [];
    }
    const address = practiceDetails.address_id ? (addressesById.get(practiceDetails.address_id) ?? null) : null;

    return [
      serializePractice({
        organization,
        details: practiceDetails,
        services: (servicesByOrganization.get(organization.id) ?? []).map((service) => ({
          id: service.id,
          name: service.name,
          key: service.key,
        })),
        address,
      }),
    ];
  });
};

export const loadPracticeResponseById = async (organizationId: string): Promise<PracticeResponse | null> => {
  const [practice] = await loadPracticeResponsesForOrganizationIds([organizationId]);
  return practice ?? null;
};
