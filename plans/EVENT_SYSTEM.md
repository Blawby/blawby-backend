# Laravel-Style Event System

## Overview

This application uses a Laravel-inspired event system that provides centralized event registration, handler priorities, queued processing, and propagation control.

## Key Features

- **Laravel Familiarity**: Same mental model as Laravel's EventServiceProvider
- **Centralized**: All event-handler mappings in one file per module
- **Scalable**: Easy to add new events/handlers
- **Functional**: Handlers defined inline, no separate files needed
- **Type Safe**: Full TypeScript support with proper types
- **Flexible**: Supports priorities, queuing, and propagation control
- **Clean**: No individual handler files cluttering the codebase
- **Observable**: Clear view of all event-handler relationships

## How to Register Events

### 1. Create Event Registration File

Create a file named `events.ts` in your module directory:

```typescript
// src/modules/your-module/events.ts
import { EventType } from '@/shared/events/enums/event-types';
import { subscribeToEvent } from '@/shared/events/event-consumer';
import type { BaseEvent } from '@/shared/events/schemas/events.schema';

export const YOUR_MODULE_EVENTS = {
  [EventType.SOME_EVENT]: {
    handler: async (event: BaseEvent) => {
      // Your handler logic here
      console.log('Event handled:', event);
    },
    options: {
      priority: 10,
      shouldQueue: true,
      queue: 'events',
    },
  },
} as const;

export const registerYourModuleEvents = (): void => {
  console.info('Registering your module event handlers...');
  
  for (const [eventType, config] of Object.entries(YOUR_MODULE_EVENTS)) {
    subscribeToEvent(eventType, config.handler, config.options);
  }
  
  console.info(`Registered ${Object.keys(YOUR_MODULE_EVENTS).length} handlers`);
};
```

### 2. Register in Boot System

Add your registration function to `src/boot/event-handlers.ts`:

```typescript
import { registerYourModuleEvents } from '@/modules/your-module/events';

export const bootEventHandlers = (): void => {
  // ... other registrations
  
  registerYourModuleEvents();
};
```

## Handler Options

### Priority
- **Default**: 0
- **Higher numbers**: Run first
- **Example**: Priority 100 runs before priority 10

```typescript
options: {
  priority: 100, // Critical - run first
}
```

### Queuing
- **shouldQueue**: Whether to process asynchronously
- **queue**: Queue name for async processing

```typescript
options: {
  shouldQueue: true,
  queue: 'events', // or 'emails', 'analytics', etc.
}
```

### Propagation Control
- **stopPropagation**: Stop other handlers after this one
- **Return false**: Also stops propagation

```typescript
options: {
  stopPropagation: true,
}

// Or return false from handler
handler: async (event: BaseEvent) => {
  if (criticalError) {
    return false; // Stops propagation
  }
}
```

## Event Types

All event types are defined in `src/shared/events/enums/event-types.ts`:

```typescript
export enum EventType {
  // Authentication events
  AUTH_USER_SIGNED_UP = 'auth.user_signed_up',
  AUTH_EMAIL_VERIFIED = 'auth.email_verified',
  
  // Stripe events
  STRIPE_CUSTOMER_CREATED = 'stripe.customer.created',
  STRIPE_CUSTOMER_UPDATED = 'stripe.customer.updated',
  
  // Add your events here
}
```

## Best Practices

### 1. Use Descriptive Handler Names
```typescript
// Good
handler: async (event: BaseEvent) => {
  await sendWelcomeEmail(event.payload);
}

// Avoid
handler: async (event: BaseEvent) => {
  // Generic handler logic
}
```

### 2. Handle Errors Gracefully
```typescript
handler: async (event: BaseEvent) => {
  try {
    await riskyOperation(event.payload);
  } catch (error) {
    console.error('Handler failed:', error);
    // Don't throw - let other handlers run
  }
}
```

### 3. Use Appropriate Priorities
```typescript
// Critical operations first
options: { priority: 100 }

// Normal operations
options: { priority: 10 }

// Cleanup operations last
options: { priority: -10 }
```

### 4. Queue Heavy Operations
```typescript
// For database operations, API calls, etc.
options: {
  shouldQueue: true,
  queue: 'events',
}
```

## Examples

### User Signup Handler
```typescript
[EventType.AUTH_USER_SIGNED_UP]: {
  handler: async (event: BaseEvent) => {
    const { email, name } = event.payload as { email: string; name: string };
    
    // Create Stripe customer
    await stripeCustomerService.createStripeCustomerForUser({
      userId: event.actorId!,
      email,
      name,
      source: 'platform_signup',
    });
  },
  options: {
    priority: 10,
    shouldQueue: true,
    queue: 'events',
  },
}
```

### Critical Error Handler
```typescript
[EventType.STRIPE_CUSTOMER_SYNC_FAILED]: {
  handler: async (event: BaseEvent) => {
    console.error('Stripe customer sync failed', event.payload);
    // Trigger alerts
    await alertService.sendCriticalAlert(event);
    return false; // Stop propagation
  },
  options: {
    priority: 100,
    shouldQueue: false,
    stopPropagation: true,
  },
}
```

## Migration from Old System

1. **Identify old handlers**: Find individual handler files
2. **Create events.ts**: Consolidate handlers into registration file
3. **Update boot system**: Replace old registration calls
4. **Test thoroughly**: Ensure all events still work
5. **Remove old files**: Delete individual handler files

## Troubleshooting

### Handler Not Running
- Check if event is registered in boot system
- Verify event type matches exactly
- Check console for registration messages

### Queued Handler Not Processing
- Ensure worker is running in production
- Check Redis connection
- Verify queue configuration

### Handler Running Out of Order
- Check priority values
- Higher numbers run first
- Default priority is 0

This event system provides a clean, scalable way to handle application events while maintaining the familiar Laravel patterns developers expect.
