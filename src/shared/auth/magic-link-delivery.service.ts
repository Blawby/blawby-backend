import { getMagicLinkDeliveryContext } from '@/shared/auth/magic-link-delivery-context';
import { queueManager } from '@/shared/queue/queue.manager';
import { EMAIL_TEMPLATES } from '@/shared/services/email/email.types';

const deliverMagicLink = async ({ email, url }: { email: string; url: string }): Promise<void> => {
  const context = getMagicLinkDeliveryContext();
  if (context?.kind === 'intake_accepted') {
    await queueManager.addEmailJob(
      EMAIL_TEMPLATES.INTAKE_ACCEPTED,
      email,
      `Your case has been accepted — ${context.practiceName}`,
      {
        recipientEmail: email,
        recipientName: context.recipientName,
        practiceName: context.practiceName,
        magicLinkUrl: url,
      },
      // One acceptance per intake: retried deliveries reuse the same job and provider send.
      { idempotencyKey: `intake-accepted:${context.intakeId}` }
    );
    return;
  }

  await queueManager.addEmailJob(EMAIL_TEMPLATES.MAGIC_LINK, email, 'Sign in to Blawby', {
    url,
    year: new Date().getFullYear(),
  });
};

export const magicLinkDeliveryService = {
  deliverMagicLink,
};
