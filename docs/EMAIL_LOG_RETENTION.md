# Email Log Retention Policy

## Scope

This policy applies to `public.email_logs`, which stores operational email delivery logs.

PII-bearing columns:
- `recipient_email`
- `template_data`

Audit metadata retained:
- `subject`
- `template_name`
- `status`
- `message_id`
- `error_message`
- `sent_at`
- `created_at`

## Retention Period

- Default retention period for PII in `email_logs`: **90 days** from row creation.
- Each row gets `expires_at = now() + interval '90 days'` by default.

## Cleanup Mechanism

- A daily worker task (`cleanup-email-logs`) runs at `03:00` server time.
- Rows with `expires_at <= now()` and `is_anonymized = false` are soft-anonymized:
  - `recipient_email` is replaced with a redacted value.
  - `template_data` is replaced with an empty object.
  - `deleted_at` is set to the anonymization timestamp.
  - `is_anonymized` is set to `true`.

This preserves operational auditability while removing retained PII after the configured period.
