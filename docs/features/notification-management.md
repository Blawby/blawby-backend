# Notification management

Blawby has two durable records with different responsibilities:

- `notifications` records a product event, its intended user and organization, its channel, and its delivery lifecycle.
- `email_logs` records an individual rendered email/provider attempt. It is delivery evidence, not the user's notification inbox.

## Invariants

- Every notification belongs to one organization and one recipient user.
- Public API reads and read-state updates are scoped by both the active organization and authenticated user.
- Dashboard notifications are available immediately (`sent`); email notifications begin `pending`.
- Delivery status (`pending`, `sent`, `failed`, `skipped`) is independent from dashboard `read_at` state.
- A non-null deduplication key is unique per organization, recipient, and channel.
- Failed email notifications may transition to `sent` after a retry. `sent` and `skipped` are terminal.
- The product record stores user IDs, not recipient email addresses. Titles, bodies, and payloads must not contain legal facts or other sensitive case content; payloads should carry opaque resource IDs and safe routes.
- Email records require a registered template name. Provider message IDs and stable failure codes belong on the product record; raw provider errors remain in provider-attempt logging.

## API

- `GET /api/notifications` lists only the current user's dashboard notifications in the active organization. `unread_only`, `page`, and `limit` are supported.
- `PATCH /api/notifications/{id}/read` marks only that user's dashboard notification as read and is idempotent.

Creation and delivery-outcome methods are service-only. The browser cannot create arbitrary notifications or mutate delivery evidence.
