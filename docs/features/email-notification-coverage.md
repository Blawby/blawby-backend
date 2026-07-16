# Email and notification coverage

## Delivery contract

`EMAIL_DELIVERY_MODE` is required in staging and production:

- `log_only` renders the real template and writes a durable `email_logs` success record without calling Resend.
- `provider` requires `RESEND_API_KEY`, calls Resend with a stable idempotency key from the Graphile job, and durably records the outcome.

Development and test default to `log_only`. CI must not use provider mode.

## Current legal-practice coverage

| Workflow | Client email | Practice email | Status |
| --- | --- | --- | --- |
| Intake submitted | Confirmation | New-intake notification | Covered |
| Intake accepted / declined | Decision | — | Covered |
| Practice invitation | — | Invitation | Covered |
| Engagement sent / accepted / declined / signed copy | Covered | Covered where applicable | Covered |
| Matter opened / closed | Covered | — | Covered |
| Invoice payment request / receipt / refund | Covered | Covered where applicable | Covered |
| Conflict review required | — | Review notification | Covered |
| Consultation booked / changed / cancelled | Missing | Missing | Follow-up required |
| Client document requested / uploaded / reviewed | Missing | Missing | Follow-up required |
| Invoice overdue / payment failed | Missing | Missing | Follow-up required |
| Trust balance low / adjustment review | Missing | Missing | Follow-up required |
| Practice subscription billing problem | — | Missing | Follow-up required |
| Security-sensitive account event | Partial auth coverage | — | Needs product review |

Subjects must avoid sensitive matter facts. Automated email must not imply representation before explicit acceptance. Action links must be signed or authenticated and templates must use the shared URL sanitizer.

## Durable ownership

Graphile Worker owns retries. Each queued email receives a stable idempotency key, which is reused for provider retries. `email_logs` remains the email-delivery audit table; a future dashboard notification domain should be separate because product notifications and provider attempts have different lifecycles.
