# Intake

Status: Implemented with planned builder and analytics work
Last verified: 2026-07-13

## Purpose

Intake captures a prospective client's legal need, contact information, payment where configured, and structured triage data before the person becomes an active client or matter.

## Actors

- Anonymous prospective client
- Practice staff
- AI intake service
- Stripe
- Email and background workers

## Entry points

- Practice-specific public intake URL
- Embedded intake widget
- Staff review and triage interface

## Core behavior

The intake experience is conversational rather than a fixed static form. Questions may adapt to prior answers. The system stores conversation data and derives structured fields used for triage, including contact details, key facts, dates, urgency, practice-area classification, and case-strength indicators.

Configured consultation fees may be collected during intake. Staff can review, accept, or decline submitted intakes. Acceptance may trigger invitation and downstream client, engagement, or matter workflows according to the current route used.

## Lifecycle

The exact enum is code-owned. Product behavior should distinguish:

- In progress
- Submitted
- Awaiting or undergoing staff review
- Accepted
- Declined
- Converted or linked to downstream records where applicable

Transitions must be idempotent and must preserve the submitted answers used for the decision.

## Main workflows

### Start intake

1. Visitor opens a practice-specific entry point.
2. Backend resolves the public practice configuration.
3. A conversation or intake session is created.
4. The assistant asks configured and adaptive questions.

### Submit intake

1. Required answers and contact details are validated.
2. Consultation payment is confirmed where required.
3. Intake becomes submitted.
4. AI enrichment runs synchronously or asynchronously.
5. Practice is notified.

### Triage

1. Authorized staff reviews original answers and enrichment.
2. Staff accepts or declines.
3. Decision, actor, timestamp, and reason where applicable are recorded.
4. Acceptance triggers only the documented downstream onboarding flow.

## Business rules

- Public intake access must be scoped to the intended practice.
- AI enrichment is advisory and must not replace staff judgment.
- Original client answers must remain distinguishable from inferred fields.
- Required payment must be confirmed before a payment-gated submission is treated as complete.
- Payment and submission retries must not create duplicate intakes or charges.
- Acceptance and decline must be mutually consistent.
- Sensitive intake data must not be exposed across practices.
- Conflict checks based on intake data are preliminary until reviewed.

## Permissions

Anonymous users may create and continue only their own intake session through the supported secure context. Practice members require explicit triage permissions. Clients should not gain general practice access merely by submitting an intake.

## Side effects

- AI enrichment
- Consultation payment
- Practice notification
- Invitation or onboarding workflow after acceptance
- Client, engagement, or matter linkage where implemented
- Audit activity

## Failure behavior

- Unknown or inactive practice: not found or unavailable.
- Invalid session: reject continuation without exposing other intake data.
- AI enrichment failure: retain the submitted intake and allow staff review without enrichment.
- Payment failure: do not mark a payment-required intake complete.
- Duplicate submit or webhook: return the existing outcome without duplicate side effects.
- Downstream onboarding failure: preserve the accepted intake and retry safely.

## Security and privacy

- Treat legal descriptions, contact data, and uploaded files as sensitive.
- Avoid presenting the chatbot as legal advice or as establishing an attorney-client relationship.
- Record consent and notices required by the intake experience.
- Apply upload validation and retention rules.

## Known limitations

- AI-assisted intake-template creation is not complete.
- Intake conversion analytics are not complete.
- Exact acceptance-to-engagement versus acceptance-to-matter behavior may differ by flow and must remain explicit in API and UI documentation.

## Acceptance criteria

- A visitor can submit an intake only to the intended practice.
- Original answers remain available even if enrichment fails.
- Payment-required submissions are not completed without confirmed payment.
- Staff decisions are attributable and idempotent.
- Accepted-intake retries do not duplicate users, invitations, clients, engagements, or matters.
- AI classifications are visibly advisory.

## Code ownership

Primary areas:

- `src/modules/practice-client-intakes/`
- intake-template and public route modules
- Cloudflare conversation and AI workers
- Stripe payment integration
- invitation, client, engagement, and matter integrations
- notification and background-job infrastructure