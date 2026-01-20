/**
 * Process Email Task
 *
 * Graphile Worker task handler for sending emails asynchronously
 */

import type { Task } from 'graphile-worker';
import { sendEmail } from '@/shared/services/email';
import type { EmailJobPayload } from '@/shared/services/email';

interface EmailJobInput {
  payload: EmailJobPayload;
}

/**
 * Process an email job from the queue
 */
export const processEmail: Task = async (payload, helpers) => {
  const { payload: emailPayload } = payload as EmailJobInput;

  helpers.logger.info(`📧 Processing email: ${emailPayload.template} to ${emailPayload.to}`);

  try {
    const result = await sendEmail(emailPayload);

    if (!result.success) {
      helpers.logger.error(`❌ Email failed: ${result.error}`);
      throw new Error(result.error);
    }

    helpers.logger.info(`✅ Email sent: ${result.messageId}`);
  } catch (error) {
    helpers.logger.error(`❌ Email processing error:`, { error });
    throw error; // Re-throw so Graphile Worker can retry
  }
};
