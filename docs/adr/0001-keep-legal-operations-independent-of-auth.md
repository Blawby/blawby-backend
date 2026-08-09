---
status: accepted
---

# Keep legal operations independent of authentication

Blawby will model each selected legal-domain use case as a domain-owned Legal Operation that accepts explicit domain input and an auth-independent `LegalOperationContext`. Existing Blawby services retain their public contracts and CASL checks, while the KrabiClaw facade performs its own service-authentication and identity-mapping work; both adapters call the same operation. We will move rather than copy business workflows so transactions, events, domain invariants, and Stripe behavior have one authoritative implementation even if the temporary KrabiClaw facade is later removed.

## Consequences

Legal Operations may depend on domain repositories, the unit of work, event dispatch, domain helpers, and required business clients, but not on Better Auth, CASL, Hono requests, D1, KrabiClaw identifiers, or integration mapping tables. Extraction must preserve each existing service contract and behavior before the corresponding integration route is enabled.
