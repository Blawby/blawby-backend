import { createHash, randomBytes } from 'node:crypto';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const TOKEN_TTL_MS = 10 * 60 * 1_000;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const issue = async ({ intakeId, organizationId }: { intakeId: string; organizationId: string }): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  const stored = await practiceClientIntakesRepository.setInvitationPrefillToken(
    intakeId,
    organizationId,
    hashToken(token),
    new Date(Date.now() + TOKEN_TTL_MS)
  );
  if (!stored) {
    throw new HTTPException(404, { message: 'Practice client intake not found' });
  }
  return token;
};

const resolve = async (
  { token }: { token: string },
  ctx: ServiceContext
): Promise<{
  type: 'intake';
  intakeId: string;
  conversationId: string;
  email: string;
  orgName: string;
  orgSlug: string;
}> => {
  const intake = await practiceClientIntakesRepository.findByInvitationPrefillTokenHash(hashToken(token), new Date());
  const metadata = intake ? intakeSharedHelpers.parseMetadata(intake.metadata) : null;
  if (!intake || !metadata?.email || !intake.conversation_id) {
    throw new HTTPException(404, { message: 'Invitation link is invalid or expired' });
  }
  if (metadata.email.trim().toLowerCase() !== ctx.user.email.trim().toLowerCase()) {
    throw new HTTPException(403, { message: 'This invitation belongs to another email address' });
  }

  const organization = await organizationRepository.findById(intake.organization_id);
  if (!organization) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  return {
    type: 'intake',
    intakeId: intake.id,
    conversationId: intake.conversation_id,
    email: metadata.email,
    orgName: organization.name,
    orgSlug: organization.slug,
  };
};

const intakePrefillTokenService = { issue, resolve };

export { intakePrefillTokenService };
