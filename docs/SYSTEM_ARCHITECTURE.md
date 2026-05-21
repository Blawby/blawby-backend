# Blawby System Architecture

## Overview

Blawby is a **modular monolith API backend** for a legal practice management and client intake platform. Built with TypeScript and Hono, it manages law firm organizations, case/matter tracking, client intake forms, billing via Stripe, and document uploads.

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 18.17+ |
| Language | TypeScript (strict mode) | 5.9 |
| HTTP Framework | Hono | 4.10 |
| ORM | Drizzle ORM | 0.45 |
| Database | PostgreSQL | - |
| Authentication | Better Auth | 1.4 |
| Validation | Zod | 4.1 |
| Job Queue | Graphile Worker | 0.16 |
| API Documentation | @hono/zod-openapi + Scalar | 1.1 |
| Logging | Logtape | 2.0 |
| Rate Limiting | rate-limiter-flexible | 9.0 |
| Payments | Stripe (Connect) | 20.2 |
| File Storage | AWS S3 / Cloudflare R2 | - |
| Email | Resend + MJML | 6.8 |
| CAPTCHA | Cloudflare Turnstile | - |

---

## High-Level System Diagram

```mermaid
graph LR
    subgraph CLIENT[" Client Layer "]
        WEB[Web App]
        MOBILE[Mobile App]
    end

    subgraph BACKEND[" Backend Layer "]
        API[API Gateway<br/>Hono]

        subgraph CORE[" Core Modules "]
            AUTH[Auth]
            PRACTICE[Practice]
            MATTERS[Matters]
            SUBS[Subscriptions]
        end

        subgraph SUPPORT[" Support Modules "]
            UPLOADS[Uploads]
            INTAKES[Intakes]
            PREFS[Preferences]
            CLIENTS[Clients]
        end

        subgraph INTEGRATION[" Integration "]
            ONBOARD[Onboarding]
            STRIPE[Stripe]
            WEBHOOKS[Webhooks]
        end
    end

    subgraph DATA[" Data & Processing "]
        DB[(PostgreSQL)]
        EVENTS[Event Outbox]
        WORKER[Graphile<br/>Worker]
    end

    subgraph EXTERNAL[" External Services "]
        STRIPEAPI[Stripe API]
        R2[R2 Storage]
        EMAIL[Resend]
        CAPTCHA[Turnstile]
    end

    WEB --> API
    MOBILE -.-> API

    API --> AUTH
    API --> PRACTICE
    API --> MATTERS
    API --> SUBS
    API --> UPLOADS
    API --> INTAKES
    API --> PREFS
    API --> USERDET
    API --> ONBOARD
    API --> STRIPE
    API --> WEBHOOKS

    AUTH --> DB
    PRACTICE --> DB
    MATTERS --> DB
    SUBS --> DB
    UPLOADS --> DB
    INTAKES --> DB
    PREFS --> DB
    CLIENTS --> DB
    ONBOARD --> DB

    INTAKES --> EVENTS
    ONBOARD --> EVENTS
    SUBS --> EVENTS

    EVENTS --> WORKER
    WORKER --> DB

    ONBOARD -.-> STRIPEAPI
    STRIPE -.-> STRIPEAPI
    INTAKES -.-> STRIPEAPI
    SUBS -.-> STRIPEAPI
    UPLOADS -.-> R2
    INTAKES -.-> CAPTCHA
    WORKER -.-> EMAIL

    style API fill:#4A90E2
    style DB fill:#50C878
    style STRIPEAPI fill:#635BFF
    style WORKER fill:#FF6B6B
    style EVENTS fill:#FFD93D
```

---

## Module Architecture

### Module Structure Pattern

Each module follows a consistent layered architecture:

```
src/modules/{module-name}/
├── http.ts              # HTTP routing layer (Hono router)
├── routes.ts            # OpenAPI route definitions
├── handlers.ts          # Request handlers
├── routes.config.ts     # Middleware configuration
├── listeners.ts         # Event listeners
├── services/            # Business logic layer
├── database/
│   ├── queries/         # Reusable database queries
│   └── schema/          # Drizzle ORM schemas
├── validations/         # Zod input validation schemas
└── types/               # TypeScript types
```

### Module Overview

```mermaid
graph LR
    subgraph "Core Business Modules"
        PRACTICE[Practice<br/>Organizations]
        MATTERS[Matters<br/>Cases]
        INTAKE[Client Intakes<br/>Forms]
        SUBS[Subscriptions<br/>Billing]
    end

    subgraph "Supporting Modules"
        AUTH[Authentication<br/>Better Auth]
        UPLOADS[File Uploads<br/>R2 Storage]
        PREFS[Preferences<br/>Settings]
        CLIENTS[Clients<br/>Profiles & Memos]
    end

    subgraph "Integration Modules"
        ONBOARD[Onboarding<br/>Stripe Connect]
        STRIPE[Stripe<br/>Payments]
        WEBHOOKS[Webhooks<br/>Event Handling]
    end

    PRACTICE -->|Creates| MATTERS
    MATTERS -->|Uses| UPLOADS
    INTAKE -->|Creates| MATTERS
    INTAKE -->|Uses| STRIPE

    AUTH -.->|Secures| PRACTICE
    AUTH -.->|Secures| MATTERS

    ONBOARD -->|Enables| STRIPE
    SUBS -->|Uses| STRIPE

    style PRACTICE fill:#4A90E2
    style MATTERS fill:#50C878
    style AUTH fill:#FFD93D
    style STRIPE fill:#635BFF
```

### Module Descriptions

| Module | Responsibility | Key Entities |
|--------|---------------|--------------|
| **auth** | Authentication & RBAC | users, sessions, organizations |
| **clients** | Client management | clients, practice_client_memos |
| **practice** | Law firm management | practice, practice_services, addresses |
| **matters** | Case/matter tracking | matters, assignees, notes, time_entries, expenses, milestones |
| **invoices** | Invoice management | invoices, invoice_line_items, billing_transactions |
| **subscriptions** | Billing management | subscription_plans, subscription_events |
| **trust** | Trust accounting | trust_transactions |
| **uploads** | File management | uploads, upload_audit_logs |
| **practice-client-intakes** | Client intake forms | practice_client_intakes |
| **preferences** | User preferences | preferences |
| **stripe** | Payment integration | Connected accounts |
| **onboarding** | Stripe Connect flow | connected_accounts, onboarding sessions |
| **webhooks** | External webhooks | Stripe/onboarding events |
| **public** | Public endpoints | Health checks |

---

## Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware Stack
    participant R as OpenAPI Router
    participant H as Handler
    participant S as Service
    participant DB as PostgreSQL

    C->>MW: HTTP Request
    MW->>MW: requestId()
    MW->>MW: logger()
    MW->>MW: cors()
    MW->>MW: responseMiddleware()
    MW->>R: Route Matching
    R->>R: Zod Validation
    R->>H: Call Handler
    H->>H: Extract User Context
    H->>S: Call Service
    S->>DB: Database Query
    DB-->>S: Query Result
    S-->>H: Result<T>
    H-->>MW: Response Data
    MW-->>C: JSON Response
```

---

## Error Handling Pattern

The system uses a **Result type pattern** for explicit error handling:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError }

interface AppError {
  status: number;      // HTTP status code
  code: string;        // Error code (e.g., "VALIDATION_ERROR")
  message: string;     // Human-readable message
  details?: unknown;   // Additional error details
}
```

**Response Format:**
```json
// Success
{ "data": { ... }, "meta": { "timestamp": "..." } }

// Error
{ "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "..." } }
```

---

## Event-Driven Architecture

The system uses a **PostgreSQL-based outbox pattern** for reliable event processing:

```mermaid
sequenceDiagram
    participant S as Service
    participant DB as PostgreSQL
    participant O as Events Table (Outbox)
    participant W as Graphile Worker
    participant H as Event Handlers
    participant DLQ as Dead Letter Queue

    S->>DB: Business Transaction
    S->>O: Write Event (same tx)
    Note over S,O: Transactional Consistency

    loop Every Minute (Cron)
        W->>O: Poll Pending Events
        O-->>W: Unprocessed Events
        W->>H: Invoke Handlers
        alt Success
            H-->>W: Handler Complete
            W->>O: Mark Processed
        else Failure (after retries)
            H-->>W: Handler Failed
            W->>DLQ: Move to Dead Letter
        end
    end
```

**Event Flow:**
1. `Event.dispatch(EventClass, payload)` writes to `events` table
2. Graphile Worker polls every minute via cron
3. Registered handlers invoked via `Event.listen()`
4. Failed events (after 5 retries) move to dead letter queue

---

## Data Flow Patterns

```mermaid
sequenceDiagram
    participant C as Client
    participant API as API Server
    participant DB as PostgreSQL
    participant Q as Graphile Worker
    participant S as Stripe
    participant R2 as R2 Storage

    %% Authentication Flow
    rect rgb(200, 220, 240)
        Note over C,API: Authentication Flow
        C->>API: Sign In Request
        API->>DB: Verify Credentials
        DB-->>API: User Data
        API-->>C: Session Cookie
    end

    %% Practice Onboarding Flow
    rect rgb(220, 240, 200)
        Note over C,S: Stripe Connect Onboarding
        C->>API: Create Practice
        API->>DB: Save Organization
        C->>API: Request Onboarding
        API->>S: Create Connected Account
        S-->>API: Account ID + Client Secret
        API->>DB: Save Account Details
        API-->>C: Client Secret
        C->>S: Complete Onboarding UI
        S->>API: Webhook: account.updated
        API->>Q: Enqueue Webhook Job
        Q->>DB: Update Account Status
    end

    %% File Upload Flow
    rect rgb(240, 220, 200)
        Note over C,R2: File Upload Flow
        C->>API: Request Presigned URL
        API->>R2: Generate Presigned URL
        R2-->>API: Presigned URL
        API-->>C: Presigned URL
        C->>R2: Upload File Directly
        C->>API: Confirm Upload
        API->>DB: Save File Metadata
    end

    %% Matter Creation Flow
    rect rgb(240, 200, 220)
        Note over C,DB: Matter Management
        C->>API: Create Matter
        API->>DB: Save Matter
        API->>Q: Publish Event
        Q->>DB: Create Activity Log
        API-->>C: Matter Created
    end

    %% Payment Flow
    rect rgb(220, 200, 240)
        Note over C,S: Payment Processing
        C->>API: Create Payment Intent
        API->>S: Create Intent (via Connect)
        S-->>API: Payment Intent
        API->>DB: Save Intent
        API-->>C: Client Secret
        C->>S: Confirm Payment
        S->>API: Webhook: payment_intent.succeeded
        API->>Q: Enqueue Payment Job
        Q->>DB: Update Payment Status
    end
```

---

## System Components

### Entry Points

| File | Purpose |
|------|---------|
| `src/hono-server.ts` | Main server entry point |
| `src/hono-app.ts` | App assembly & middleware registration |
| `src/boot/index.ts` | Boot orchestration (logging, services, workers) |
| `src/workers/event.worker.ts` | Background event worker |
| `src/workers/email.worker.ts` | Email delivery worker |

### API Server (Hono)
- **Runtime**: Node.js with TypeScript
- **Framework**: Hono (lightweight, fast)
- **Architecture**: Modular monolith (each feature = module)
- **Middleware**: Auth, validation, CORS, rate limiting
- **ORM**: Drizzle (type-safe SQL)
- **API Docs**: OpenAPI 3.0 via Scalar UI at `/docs`

### Background Processing

| Worker | Tasks |
|--------|-------|
| **Event Worker** | Stripe webhooks, onboarding webhooks, outbox events (cron) |
| **Email Worker** | Transactional email via Resend |

- **Queue**: Graphile Worker (PostgreSQL-based)
- **Retry**: Up to 5 attempts with exponential backoff
- **Dead Letter**: Failed events tracked for investigation

### Database
- **Primary**: PostgreSQL
- **Schema Management**: Drizzle Kit migrations
- **Features**: JSONB columns, ULID primary keys
- **Multi-tenant**: Organization-scoped data isolation
- **Soft Deletes**: `deleted_at` timestamp pattern

### Shared Infrastructure

```
src/shared/
├── auth/              # Better Auth setup & plugins
├── database/          # Connection pool & migrations
├── middleware/        # Middleware stack
├── events/            # Event system & outbox
├── queue/             # Graphile Worker config
├── router/            # Module discovery & OpenAPI
├── types/             # Result<T>, Hono context
├── validations/       # Shared Zod schemas
└── utils/             # Helpers (Stripe client, logging)
```

---

## Security Architecture

### Security Layers

```mermaid
graph LR
    CLIENT[Client] -->|HTTPS| CORS[CORS Policy]
    CORS -->|Rate Limited| RATE[Rate Limiter]
    RATE -->|Validated| VAL[Zod Validation]
    VAL -->|Authenticated| AUTH[Better Auth]
    AUTH -->|Authorized| AUTHZ[Org Role Check]
    AUTHZ -->|Sanitized| BIZ[Business Logic]
    BIZ -->|Parameterized| DB[(Database)]

    AUTH -.->|Session| SESS[(Session Store)]
    AUTHZ -.->|Check| ROLES[Organization Roles]

    style RATE fill:#FF6B6B
    style AUTH fill:#FFD93D
    style AUTHZ fill:#4A90E2
```

### Authentication
- **Framework**: Better Auth with plugins (organization, admin, anonymous, stripe)
- **Session**: Database-backed session storage
- **OAuth**: Google OAuth integration
- **Cookies**: Secure, HTTP-only (HTTPS in production)

### Authorization
- **Model**: Role-Based Access Control (RBAC)
- **Roles**: `owner`, `admin`, `member` per organization
- **Middleware**: `requireAuth()`, `requireAdmin()`

### Rate Limiting
- **Storage**: PostgreSQL table-based (not in-memory)
- **Rules**:
  - Sign-in: 5 requests/minute
  - Sign-up: 3 requests/minute
  - Password reset: 3 requests/5 minutes

### Input Validation
- **Schema**: Zod for all request inputs
- **Integration**: `@hono/zod-validator` middleware
- **OpenAPI**: Validation schemas double as API docs

### CAPTCHA
- **Provider**: Cloudflare Turnstile
- **Usage**: Public forms (client intake)

---

## Module Interactions

```mermaid
graph LR
    subgraph "Core Flow"
        A[Practice Module] -->|Creates| B[Organization]
        B -->|Triggers| C[Onboarding]
        C -->|Creates| D[Stripe Account]
        D -->|Enables| E[Matters]
        E -->|Uploads| F[Files]
        E -->|Sends| G[Intakes]
        G -->|Receives| H[Payments]
    end

    subgraph "Support Systems"
        I[Auth] -.->|Secures| A
        I -.->|Secures| E
        I -.->|Secures| F
        J[Preferences] -.->|Configures| A
        K[Events] -.->|Logs| E
        K -.->|Notifies| G
        L[Subscriptions] -.->|Bills| A
    end

    style A fill:#4A90E2
    style E fill:#50C878
    style D fill:#635BFF
    style I fill:#FFD93D
```

---

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        LB[Load Balancer]

        subgraph "API Cluster"
            API1[API Server 1]
            API2[API Server 2]
            API3[API Server N]
        end

        subgraph "Worker Pool"
            W1[Event Worker]
            W2[Email Worker]
        end

        DB[(Primary DB<br/>PostgreSQL)]

        LB --> API1
        LB --> API2
        LB --> API3

        API1 --> DB
        API2 --> DB
        API3 --> DB

        W1 --> DB
        W2 --> DB
    end

    subgraph "External"
        CDN[Cloudflare CDN]
        R2[R2 Storage]
        STRIPE[Stripe API]
        RESEND[Resend API]
    end

    CDN --> LB
    API1 --> R2
    API1 --> STRIPE
    W2 --> RESEND
    STRIPE -.->|Webhooks| LB

    style DB fill:#50C878
    style LB fill:#4A90E2
    style STRIPE fill:#635BFF
```

### Process Management
- **API Server**: Node process on PORT 3000
- **Event Worker**: Separate Node process
- **Email Worker**: Separate Node process
- **Graceful Shutdown**: `close-with-grace` (500ms drain)

### Build & Run

```bash
pnpm run build       # Compile TypeScript → dist/
pnpm run dev         # Watch mode development
pnpm start           # Run compiled API server
pnpm start:all       # API + event worker + email worker
```

---

## API Documentation

- **OpenAPI UI**: Available at `/docs` (Scalar) and `/scalar`
- **OpenAPI JSON**: Available at `/openapi.json`
- **LLM-friendly**: Markdown export at `/llms.txt`

---

## Key File Locations

```
src/
├── hono-app.ts                    # App assembly
├── hono-server.ts                 # Server entry point
├── boot/
│   ├── index.ts                   # Boot orchestration
│   ├── services.ts                # Service initialization
│   └── event-handlers.ts          # Event listener registration
├── modules/
│   ├── auth/                      # Authentication
│   ├── clients/                   # Client management
│   ├── practice/                  # Practice management
│   ├── matters/                   # Matter/case management
│   ├── invoices/                  # Invoice management
│   ├── subscriptions/             # Billing
│   ├── trust/                     # Trust accounting
│   ├── uploads/                   # File uploads
│   ├── practice-client-intakes/   # Intake forms
│   ├── preferences/               # User preferences
│   ├── webhooks/                  # Webhook handling
│   ├── stripe/                    # Stripe integration
│   ├── onboarding/                # Stripe Connect onboarding
│   └── public/                    # Public endpoints
├── shared/
│   ├── auth/                      # Better Auth setup
│   ├── database/                  # DB connection
│   ├── middleware/                # Middleware stack
│   ├── events/                    # Event system
│   ├── queue/                     # Graphile Worker
│   ├── router/                    # Module registration
│   ├── types/                     # Result<T>, context types
│   └── utils/                     # Helpers
├── schema/                        # Database schemas
└── workers/                       # Background workers
```

---

**Last Updated**: March 27, 2026
