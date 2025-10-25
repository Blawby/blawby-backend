/**
 * Email Event Registration
 *
 * Laravel-style event registration for email handlers
 */

import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

// Mock email service - replace with actual implementation
const sendEmail = async (params: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}): Promise<void> => {
  console.info('Sending email', params);
  // TODO: Implement actual email sending
};

export const EMAIL_EVENTS = {
  // Welcome email on signup (queued - external API call)
  [EventType.AUTH_USER_SIGNED_UP]: {
    handler: async (event: BaseEvent) => {
      const { email, name } = event.payload as { email: string; name: string };
      await sendEmail({
        to: email,
        subject: 'Welcome to Blawby!',
        template: 'welcome',
        data: { name },
      });
    },
    options: {
      priority: 5,
      shouldQueue: true, // Only queue external API calls
      queue: 'emails',
    },
  },
} as const;

export const registerEmailEvents = (): void => {
  console.info('Registering email event handlers...');
  for (const [eventType, config] of Object.entries(EMAIL_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }
  console.info(`Registered ${Object.keys(EMAIL_EVENTS).length} email handlers`);
};
