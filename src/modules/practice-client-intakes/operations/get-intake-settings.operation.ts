import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { intakeTemplatesRepository } from '@/modules/practice/database/queries/intake-templates.repository';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { findPracticeDetailsByOrganization } from '@/modules/practice/database/queries/practice-details.repository';
import { mapIntakeTemplateFieldToPublicSettings } from '@/modules/practice/utils/intake-template.utils';
import { onboardingRepository } from '@/modules/onboarding/database/queries/onboarding.repository';
import { connectedAccountsService } from '@/modules/onboarding/services/connected-accounts.service';
import type { IntakeSettingsResponse } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['practice-client-intakes', 'get-intake-settings-operation']);

/**
 * `'enforce'` preserves the existing Blawby subscription requirement. `'bypass'` is for a facade
 * caller that has already run its own entitlement check (KrabiClaw) and is exempt only from
 * Blawby's local subscription check (U6/U8) — it is never derived from request input, only set
 * by the code path that already verified entitlement.
 */
export type IntakeSubscriptionPolicy = 'enforce' | 'bypass';

/**
 * Load public intake settings for an organization already resolved by the caller
 * (existing route resolves by slug; the facade resolves organizationId directly).
 */
export const getIntakeSettings = async (
  {
    organizationId,
    templateSlug,
    subscriptionPolicy,
  }: { organizationId: string; templateSlug?: string; subscriptionPolicy: IntakeSubscriptionPolicy },
  ctx: LegalOperationContext
): Promise<IntakeSettingsResponse> => {
  assertLegalOperationTenant(ctx, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for '${organizationId}'` });
  }

  if (subscriptionPolicy === 'enforce' && !organization.activeSubscriptionId) {
    throw new HTTPException(403, { message: 'Organization does not have an active subscription' });
  }

  const connectedAccount = await onboardingRepository.findByOrganizationId(organization.id);
  if (!connectedAccount) {
    throw new HTTPException(403, { message: 'Organization does not have a connected Stripe account' });
  }

  if (!(await connectedAccountsService.isAccountActive(connectedAccount))) {
    throw new HTTPException(403, { message: 'Connected account is not ready to accept payments' });
  }

  const [practiceDetails, defaultTemplate, requestedTemplate] = await Promise.all([
    findPracticeDetailsByOrganization(organization.id),
    intakeTemplatesRepository.findPublishedDefaultByOrganization(organization.id),
    templateSlug
      ? intakeTemplatesRepository.findPublishedByOrganizationAndSlug(organization.id, templateSlug)
      : Promise.resolve(undefined),
  ]);

  // Use the requested template when found; fall back to the practice default.
  const resolvedTemplate = requestedTemplate ?? defaultTemplate;

  if (!resolvedTemplate) {
    logger.warn('No published intake template for organization {organizationId}', { organizationId });
    throw new HTTPException(503, { message: 'Intake configuration is being set up, please try again shortly' });
  }

  const consultationFee = practiceDetails?.consultation_fee ?? 0;
  const serviceArea = (practiceDetails?.services ?? []).map((service) => ({
    id: service.id,
    name: service.name,
    key: service.key,
  }));

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo ?? undefined,
    },
    settings: {
      payment_link_enabled: Boolean(organization.paymentLinkEnabled) && consultationFee > 0,
      consultation_fee: consultationFee,
    },
    service_area: serviceArea,
    connected_account: {
      id: connectedAccount.id,
      charges_enabled: connectedAccount.charges_enabled,
    },
    intake_template: {
      id: resolvedTemplate.id,
      slug: resolvedTemplate.slug,
      name: resolvedTemplate.name,
      intro_message: resolvedTemplate.intro_message,
      legal_disclaimer: resolvedTemplate.legal_disclaimer,
      payment_link_enabled: resolvedTemplate.payment_link_enabled,
      consultation_fee: resolvedTemplate.consultation_fee,
      fields: resolvedTemplate.fields.map(mapIntakeTemplateFieldToPublicSettings),
    },
  };
};
