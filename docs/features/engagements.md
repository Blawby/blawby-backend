# Engagements

Status: Implemented with remaining signature and payment gaps
Last verified: 2026-07-13

## Purpose

An engagement records the proposed scope, fee structure, risk review, and terms governing the practice-client relationship. Client acceptance creates the operational bridge from intake to matter.

## Actors

- Practice owner, attorney, or authorized staff
- Prospective or invited client
- AI drafting service
- Email and background workers

## Preconditions

- Practice and client or intake data exist.
- Staff has permission to create and send engagements.
- The selected template belongs to the practice.
- Client review access is tied to the intended recipient.

## Core behavior

Implemented capabilities include reusable templates, structured proposal data, AI-assisted placeholder resolution and polishing, formatted preview, draft and send workflows, client acknowledgments, canvas signature capture, acceptance metadata, conflict and jurisdiction status, and matter creation after acceptance.

Cryptographically verifiable e-signatures, signed PDF generation, and payment-method collection during acceptance are not complete.

## Lifecycle

Canonical product states:

```text
draft -> sent -> accepted
              -> declined
```

The code-owned enum may contain additional states. Any additional state must document allowed incoming and outgoing transitions.

## Main workflows

### Create draft

1. Staff selects an intake or client.
2. Backend pre-fills available identity and matter information.
3. Staff chooses a practice-owned template or starts without one.
4. Staff defines scope, fee structure, and risk-review fields.
5. Draft is persisted.

### Generate letter

1. Backend resolves supported placeholders from structured data.
2. AI may polish the text.
3. Unresolved placeholders must not silently become factual claims.
4. Staff reviews and edits the result before sending.

### Send

1. Backend validates required fields and recipient access.
2. Engagement transitions from draft to sent.
3. Client receives a review link or portal notification.
4. Delivery activity is recorded.

### Accept

1. Client opens the authorized review page.
2. Client reviews terms and completes required acknowledgments.
3. Client supplies the supported signature representation.
4. Backend records acceptance time, identity, and available request metadata.
5. Backend creates or links the matter exactly once.
6. Engagement becomes immutable except through an explicit amendment process.

### Decline

Client or staff records decline according to permitted workflow. Decline must not create a matter.

## Business rules

- Templates are practice-scoped.
- AI-generated text requires staff review before sending.
- Sent terms must be preserved so later edits cannot change what the client accepted.
- Acceptance must be idempotent.
- Matter creation must be idempotent and linked to the accepted engagement.
- Required acknowledgments must be complete before acceptance.
- Conflict and jurisdiction review fields must remain distinguishable from final legal determinations.
- A declined engagement cannot later be accepted unless explicitly reopened or resent under a documented transition.

## Permissions

Staff permissions should distinguish creating, editing, generating, sending, withdrawing, and viewing engagements. Clients may view and act only on engagements addressed to their authenticated identity or valid secure review context.

## Side effects

- AI generation requests
- Email or portal notification
- Acceptance audit record
- Signature image or representation storage
- Matter creation
- Client workspace activation where configured

## Failure behavior

- Invalid template ownership: reject.
- Missing required terms: validation error.
- AI failure: preserve draft and permit manual editing.
- Duplicate acceptance: return the existing accepted result without duplicate matter creation.
- Expired or unauthorized review access: reject without revealing other client data.
- Matter-creation failure after acceptance: retain recoverable state and retry safely.

## Security and compliance

- Preserve the exact sent and accepted content.
- Record actor, timestamp, and relevant request metadata.
- Do not describe the canvas signature as universally court-admissible.
- Protect review links and signature data as sensitive records.

## Known limitations

- No confirmed cryptographic e-signature binding.
- No confirmed signed PDF artifact.
- Payment-method collection at acceptance is incomplete.
- Amendment, withdrawal, and resend behavior requires further code-level verification.

## Acceptance criteria

- Staff can create, preview, and send a practice-scoped engagement.
- Clients cannot view another client's engagement.
- Accepted content cannot be silently changed.
- Duplicate acceptance does not duplicate matters.
- Decline does not create a matter.
- AI failure does not destroy the draft.

## Code ownership

Primary areas:

- engagement modules, schemas, services, and routes
- practice engagement-template modules
- intake and client integrations
- Cloudflare Workers AI integration
- matter creation logic
- email, upload, and audit infrastructure