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

const isEmailJobInput = (input: unknown): input is EmailJobInput => {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const i = input as Record<string, unknown>;
  return typeof i.payload === 'object' && i.payload !== null;
};

/**
 * Process an email job from the queue
 */
export const processEmail: Task = async (input, helpers) => {
  if (!isEmailJobInput(input)) {
    helpers.logger.error('❌ Invalid email job input', { input });
    return;
  }

  const { payload: emailPayload } = input;

  helpers.logger.info(`📧 Processing email: ${emailPayload.template}`);

  try {
    const result = await sendEmail(emailPayload);

    if (!result.success) {
      helpers.logger.error(`❌ Email failed: ${result.error}`);
      throw new Error(result.error);
    }

    helpers.logger.info(`✅ Email sent: ${result.messageId}`);
  } catch (error) {
    helpers.logger.error('❌ Email processing error:', { error });
    throw error; // Re-throw so Graphile Worker can retry
  }
};
