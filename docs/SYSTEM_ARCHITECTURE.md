# Blawby System Architecture

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
        end

        subgraph SUPPORT[" Support Modules "]
            UPLOADS[Uploads]
            INTAKES[Intakes]
            PREFS[Preferences]
        end

        subgraph INTEGRATION[" Integration "]
            ONBOARD[Stripe<br/>Onboarding]
        end
    end

    subgraph DATA[" Data & Processing "]
        DB[(PostgreSQL)]
        EVENTS[Event Bus]
        WORKER[Background<br/>Worker]
    end

    subgraph EXTERNAL[" External Services "]
        STRIPE[Stripe]
        R2[R2 Storage]
        EMAIL[Email]
        CAPTCHA[Turnstile]
    end

    WEB --> API
    MOBILE -.-> API

    API --> AUTH
    API --> PRACTICE
    API --> MATTERS
    API --> UPLOADS
    API --> INTAKES
    API --> PREFS
    API --> ONBOARD

    AUTH --> DB
    PRACTICE --> DB
    MATTERS --> DB
    UPLOADS --> DB
    INTAKES --> DB
    PREFS --> DB
    ONBOARD --> DB

    MATTERS --> EVENTS
    INTAKES --> EVENTS
    ONBOARD --> EVENTS

    EVENTS --> WORKER
    WORKER --> DB

    ONBOARD -.-> STRIPE
    INTAKES -.-> STRIPE
    UPLOADS -.-> R2
    INTAKES -.-> CAPTCHA
    WORKER -.-> EMAIL

    style API fill:#4A90E2
    style DB fill:#50C878
    style STRIPE fill:#635BFF
    style WORKER fill:#FF6B6B
    style EVENTS fill:#FFD93D
```

## Detailed Module Architecture

```mermaid
graph LR
    subgraph "Core Business Modules"
        PRACTICE[Practice<br/>Organizations]
        MATTERS[Matters<br/>Cases]
        INTAKE[Client Intakes<br/>Forms]
    end

    subgraph "Supporting Modules"
        AUTH[Authentication<br/>Better Auth]
        UPLOADS[File Uploads<br/>R2 Storage]
        PREFS[Preferences<br/>Settings]
    end

    subgraph "Integration Modules"
        ONBOARD[Stripe Onboarding<br/>Connect Setup]
        PAYMENTS[Payment Processing<br/>Stripe]
    end

    PRACTICE -->|Creates| MATTERS
    MATTERS -->|Uses| UPLOADS
    INTAKE -->|Creates| MATTERS
    INTAKE -->|Uses| PAYMENTS

    AUTH -.->|Secures| PRACTICE
    AUTH -.->|Secures| MATTERS

    ONBOARD -->|Enables| PAYMENTS

    style PRACTICE fill:#4A90E2
    style MATTERS fill:#50C878
    style AUTH fill:#FFD93D
```

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
        API-->>C: JWT Token + Session
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

## System Components

### Frontend
- **Web App**: React/Preact SPA
- **Auth**: Better Auth client with Bearer tokens
- **State**: Local state + API calls
- **Storage**: IndexedDB for tokens

### API Server (Hono)
- **Runtime**: Node.js with TypeScript
- **Framework**: Hono (lightweight, fast)
- **Architecture**: Modular (each feature = module)
- **Middleware**: Auth, validation, CORS, rate limiting
- **ORM**: Drizzle (type-safe SQL)

### Background Processing
- **Queue**: Graphile Worker (PostgreSQL-based)
- **Jobs**: Webhooks, emails, event handlers
- **Concurrency**: Configurable workers
- **Retry**: Automatic with exponential backoff

### Database
- **Primary**: PostgreSQL
- **Schema Management**: Drizzle Kit migrations
- **Features**: JSONB columns, UUID/ULID primary keys
- **Indexes**: Optimized for queries

### External Services
- **Stripe**: Connect accounts + Platform billing
- **R2**: Cloudflare object storage
- **Email**: Transactional email service
- **CAPTCHA**: Cloudflare Turnstile

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
    end

    style A fill:#4A90E2
    style E fill:#50C878
    style D fill:#635BFF
    style I fill:#FFD93D
```

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
            W1[Worker 1]
            W2[Worker 2]
        end

        DB[(Primary DB<br/>PostgreSQL)]
        DBRR[(Read Replica)]

        CACHE[(Redis Cache)]

        LB --> API1
        LB --> API2
        LB --> API3

        API1 --> DB
        API2 --> DB
        API3 --> DB

        API1 -.->|Read| DBRR
        API2 -.->|Read| DBRR
        API3 -.->|Read| DBRR

        API1 -.->|Cache| CACHE
        API2 -.->|Cache| CACHE
        API3 -.->|Cache| CACHE

        W1 --> DB
        W2 --> DB
    end

    subgraph "External"
        CDN[Cloudflare CDN]
        R2[R2 Storage]
        STRIPE[Stripe API]
    end

    CDN --> LB
    API1 --> R2
    API1 --> STRIPE
    STRIPE -.->|Webhooks| LB

    style DB fill:#50C878
    style LB fill:#4A90E2
    style STRIPE fill:#635BFF
```

## Security Layers

```mermaid
graph LR
    CLIENT[Client] -->|HTTPS| WAF[WAF/Firewall]
    WAF -->|Rate Limited| AUTH[Auth Middleware]
    AUTH -->|Validated| AUTHZ[Authorization]
    AUTHZ -->|Sanitized| BIZ[Business Logic]
    BIZ -->|Parameterized| DB[(Database)]

    AUTH -.->|JWT Verify| KEYS[Token Keys]
    AUTHZ -.->|Check| PERMS[Permissions DB]

    style WAF fill:#FF6B6B
    style AUTH fill:#FFD93D
    style AUTHZ fill:#4A90E2
```

---

**Last Updated**: January 21, 2026
