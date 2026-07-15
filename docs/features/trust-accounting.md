# Trust Accounting

Status: Implemented with manual operational steps
Last verified: 2026-07-13

## Purpose

Trust accounting tracks client funds held separately from practice operating funds and provides per-client, per-matter balances and an auditable transaction history.

## Actors

- Practice owner
- Authorized billing or trust-accounting staff
- Client or payer
- Stripe Connect
- Auditors and compliance reviewers

## Core behavior

Implemented capabilities include trust deposits, withdrawals, per-client and per-matter balance tracking, transaction audit history, client balance summaries, and compliance-oriented reporting.

Automatic trust-to-operating transfer on invoice approval is not complete. Manual or separately authorized transfer behavior must remain explicit.

## Ledger model

The ledger is append-oriented. Financial history should be corrected through reversing or adjusting entries rather than destructive edits.

Each transaction must identify:

- Practice
- Client
- Matter where applicable
- Transaction type
- Amount and currency
- Effective and recorded timestamps
- Source payment or invoice where applicable
- Actor or external event
- Idempotency or external reference

## Business rules

- Trust balances must never be calculated from mutable display fields alone.
- A withdrawal or transfer cannot exceed the available scoped balance.
- Client funds must not be attributed to another client or matter.
- Deposit, withdrawal, transfer, and refund events must be idempotent.
- Operating revenue and trust funds must remain distinguishable.
- Ledger corrections require traceable adjustment entries.
- Reports must reconcile to ledger transactions for the same cutoff time.
- Platform fees must not be deducted from trust funds unless the implemented payment flow and applicable rules explicitly permit it.

## Main workflows

### Deposit

1. Client funds are received through an approved payment flow or recorded manually by authorized staff.
2. Backend validates practice, client, matter, and payment references.
3. Deposit transaction is appended.
4. Client and matter balances reflect the new transaction.

### Withdrawal or refund

1. Authorized staff requests a withdrawal or refund.
2. Backend validates available balance and destination.
3. External payment action occurs where required.
4. Ledger transaction is appended after a confirmed or appropriately pending result.

### Trust-to-operating transfer

1. An earned amount is identified, normally through an invoice or approved billing event.
2. Staff or automation validates sufficient client trust balance.
3. Paired transfer records preserve movement out of trust and into operating accounting.
4. Invoice and ledger references remain linked.

### Reporting

1. User selects a reporting scope and cutoff.
2. Backend aggregates immutable transactions.
3. Report shows opening balance, activity, closing balance, and client or matter detail.

## Permissions

Only explicitly authorized roles may create or reverse trust transactions. Clients may view only their own permitted balance information and cannot mutate the ledger.

## Failure behavior

- Insufficient balance: reject without partial ledger mutation.
- Duplicate external event: return the existing result without duplicating funds.
- Cross-client or cross-practice reference: reject.
- External payment uncertainty: preserve pending state and reconcile later rather than assuming success.
- Report mismatch: surface an operational error and preserve source transactions.

## Security and compliance

- Every mutation must be attributable to an actor or verified external event.
- Sensitive payment details must remain with the payment provider.
- Logs must avoid exposing full financial credentials.
- The system should not claim universal IOLTA compliance; jurisdiction-specific legal requirements require separate review.

## Known limitations

- Automated trust-to-operating transfers are incomplete.
- Three-way reconciliation and bank-statement reconciliation are not confirmed as implemented.
- Compliance report suitability varies by jurisdiction.

## Acceptance criteria

- Ledger balances equal the sum of scoped transactions.
- A client cannot see or affect another client's funds.
- Insufficient-fund operations create no partial financial effects.
- Duplicate payment events do not duplicate ledger entries.
- Corrections remain auditable.
- Reports reconcile to ledger transactions at the selected cutoff.

## Code ownership

Primary areas:

- `src/modules/trust/`
- Stripe payment and webhook modules
- invoice and refund integrations
- shared fee and financial services
- audit and reporting code