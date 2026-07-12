import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { createSystemContext } from '@/shared/types/service-context';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['shared', 'auth', 'accepted-invitation-client-linker']);

const CLIENT_ROLE = 'client';
const DEFAULT_CLIENT_NAME = 'New Client';

interface AcceptedInvitationClientLinkParams {
  invitationId: string;
  organizationId: string;
  userId: string;
  email: string;
  role: string;
}

const linkAcceptedClientInvitation = async (
  params: AcceptedInvitationClientLinkParams
): Promise<{ linked: false; reason: 'non-client-role' } | { linked: true; clientId: string }> => {
  if (params.role !== CLIENT_ROLE) {
    return { linked: false, reason: 'non-client-role' };
  }

  const result = await clientsCrudService.createClient(
    {
      data: {
        name: DEFAULT_CLIENT_NAME,
        email: params.email,
        status: 'active',
      },
    },
    createSystemContext(params.organizationId)
  );

  logger.info('Linked accepted client invitation to CRM client {clientId}', {
    clientId: result.id,
    invitationId: params.invitationId,
    userId: params.userId,
    organizationId: params.organizationId,
  });

  return { linked: true, clientId: result.id };
};

export const acceptedInvitationClientLinker = {
  linkAcceptedClientInvitation,
};
