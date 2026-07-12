# Feature Specifications

This directory contains the canonical description of current product behavior for each backend feature.

`PRODUCT.md` remains the high-level product overview. `README.md` remains the setup and architecture entry point. OpenAPI remains the source of truth for request and response contracts. Files in `docs/plans/` are implementation plans and historical context, not the current behavioral specification.

## Status values

- **Implemented** — available in the current codebase.
- **Partial** — implemented with known missing behavior.
- **Planned** — approved direction without a complete implementation.
- **Experimental** — implemented but subject to incompatible change.
- **Deprecated** — retained temporarily and scheduled for removal.

## Required sections

Every feature specification should contain:

1. Purpose
2. Status
3. Actors
4. Preconditions
5. User workflows
6. Business rules
7. Permissions
8. States and transitions
9. Data ownership
10. API surface
11. Side effects
12. Failure behavior
13. Security and compliance
14. Known limitations
15. Acceptance criteria
16. Code ownership

Sections may state `Not applicable`, but should not be omitted.

## Documentation ownership

A feature change is incomplete until the corresponding specification is updated when it changes:

- observable behavior;
- business rules or state transitions;
- authorization or tenancy boundaries;
- external side effects;
- API semantics not fully represented by OpenAPI;
- known limitations.

Implementation details that do not change feature behavior belong in code comments, architecture documents, or ADRs.

## Feature index

| Feature | Specification | Status |
|---|---|---|
| MCP | [mcp.md](./mcp.md) | Implemented |
| Authentication and organizations | `authentication-and-organizations.md` | Needed |
| Intake | `intake.md` | Needed |
| Clients | `clients.md` | Needed |
| Engagements | `engagements.md` | Needed |
| Matters | `matters.md` | Needed |
| Billing and invoices | `billing-and-invoices.md` | Needed |
| Trust accounting | `trust-accounting.md` | Needed |
| Subscriptions | `subscriptions.md` | Needed |
| Operations | `operations.md` | Needed |

## Plan-document metadata

New and existing files under `docs/plans/` should include:

```md
Status: Draft | In progress | Implemented | Superseded
Implemented by: PR #123
Superseded by: docs/features/example.md
Last verified: YYYY-MM-DD
```
