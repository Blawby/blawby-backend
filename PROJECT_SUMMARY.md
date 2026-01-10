# Blawby TypeScript Project Summary

## Project Overview

This document provides a comprehensive technical overview of the Blawby TypeScript project, including detailed architecture, request flows, implementation details, and current state.

## Quick Start & Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm package manager
- Stripe account for payment processing

### Environment Setup

```bash
# Clone and install dependencies
git clone <repository>
cd blawby-ts
pnpm install

# Environment configuration
cp .env.example .env
# Configure: DATABASE_URL, BETTER_AUTH_SECRET, STRIPE_SECRET_KEY

# Database setup
pnpm run db:generate  # Generate migrations
pnpm run db:migrate   # Apply migrations

# Start development server
pnpm run dev

# Start background worker (separate terminal)
pnpm run worker:dev

# Or run both together
pnpm run dev:full
```

### Key Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/blawby"

# Authentication
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Graphile Worker (Background Jobs)
GRAPHILE_WORKER_SCHEMA="graphile_worker"  # Optional - defaults to 'graphile_worker'
WEBHOOK_WORKER_CONCURRENCY=5  # Optional - concurrent job processing
WEBHOOK_MAX_RETRIES=5  # Optional - max retry attempts

# Application
NODE_ENV="development"
PORT=3000
```

## Project Structure & Architecture

### Core Architecture

```
src/
├── app.ts                 # Main Fastify application entry point
├── server.ts              # Server configuration and startup
├── auth.ts                # Better Auth configuration
├── database/               # Database connection and migrations
│   ├── index.ts           # Database client setup
│   └── migrations/        # Drizzle migration files
├── shared/                 # Shared utilities and middleware
│   ├── auth/              # Authentication system
│   │   ├── better-auth.ts # Better Auth configuration
│   │   └── verify-auth.ts # Auth verification middleware
│   ├── database/          # Database utilities
│   ├── queue/             # Job queue system (Graphile Worker)
│   │   ├── graphile-worker.client.ts # Graphile Worker client
│   │   ├── queue.manager.ts # Job queue management
│   │   └── queue.config.ts # Queue configuration
│   ├── middleware/        # Fastify middleware plugins
│   │   ├── cors.ts        # CORS configuration
│   │   ├── helmet.ts      # Security headers
│   │   ├── rate-limit.ts  # Rate limiting
│   │   └── sensible.ts    # Error handling
│   ├── router/            # File-based routing system
│   ├── types/             # Global TypeScript definitions
│   └── utils/             # Utility functions
├── workers/                # Background worker processes
│   ├── webhook.worker.ts  # Graphile Worker runner for webhooks
│   └── tasks/             # Graphile Worker task definitions
│       ├── process-stripe-webhook.ts
│       ├── process-onboarding-webhook.ts
│       └── process-event-handler.ts
├── schema/                 # Drizzle schema definitions
│   ├── index.ts           # Schema exports
│   └── better-auth-schema.ts # Better Auth schemas
├── types/                  # Global TypeScript type definitions
└── modules/                # Feature-based modules
    ├── billing/            # Payment and billing features
    ├── practice/           # Practice/organization management
    ├── settings/           # User and org settings
    └── health/             # Health check endpoints
```

### Application Bootstrap Flow

```mermaid
graph TD
    A[server.ts - Entry Point] --> B[Create Fastify Instance]
    B --> C[Configure Logger]
    C --> D[Register Main App]
    D --> E[Start Server on Port 3000]

    E --> F[app.ts - Application Setup]
    F --> G[1. Infrastructure Plugins]
    G --> H[Sensible - Error Handling]
    H --> I[CORS - Cross-Origin]
    I --> J[Helmet - Security Headers]
    J --> K[Rate Limit - 100 req/min]

    K --> L[2. Core Services]
    L --> M[Database Plugin]
    M --> N[Better Auth Plugin]
    N --> O[Auth Core Plugin]

    O --> P[3. File-Based Routes]
    P --> Q[Auto-Discovery Complete]
    Q --> R[Server Ready]
```

### Feature-Based Architecture (`src/modules/`)

Each feature follows a consistent structure with clear separation of concerns:

```
modules/{feature-name}/
├── routes/                  # API route handlers (file-based routing)
│   ├── index.get.ts        # GET /api/{feature}/
│   ├── index.post.ts       # POST /api/{feature}/
│   ├── [id].get.ts         # GET /api/{feature}/{id}
│   ├── [id].put.ts         # PUT /api/{feature}/{id}
│   ├── [id].delete.ts      # DELETE /api/{feature}/{id}
│   └── organization/       # Nested routes
│       └── [orgId]/
├── services/               # Business logic layer
│   ├── {feature}.service.ts # Main service functions
│   └── {sub-feature}.service.ts # Sub-services
├── repositories/           # Data access layer
│   └── {feature}.repository.ts # Database operations
├── schemas/                # Database schemas and validation
│   └── {feature}.schema.ts # Drizzle schemas + Zod validation
├── types/                  # Feature-specific TypeScript types
│   └── {feature}.types.ts  # Type definitions
├── routes.config.ts        # Route configuration (auth, permissions)
└── index.ts                # Feature exports
```

### File-Based Routing System

**Implementation**: `src/shared/router/file-router.ts`

```mermaid
graph TD
    A[File Router Plugin] --> B[Scan modules/*/routes/]
    B --> C[Parse Filename]
    C --> D{File Pattern?}

    D -->|list.get.ts| E[GET /api/practice/list]
    D -->|index.post.ts| F[POST /api/practice/]
    D -->|[id].put.ts| G[PUT /api/practice/:id]
    D -->|organization/[orgId]/status.get.ts| H[GET /api/practice/organization/:orgId/status]

    E --> I[Load Route Config]
    F --> I
    G --> I
    H --> I

    I --> J{Protected Route?}
    J -->|Yes| K[Add Auth Middleware]
    J -->|No| L[Register Route]
    K --> L

    L --> M[Route Active]
```

**Route Discovery Process**:

1. **Scan**: `src/modules/*/routes/` directories
2. **Parse**: Filename to determine HTTP method and path
3. **Configure**: Apply route configuration from `routes.config.ts`
4. **Register**: With Fastify and proper middleware
5. **Authenticate**: Apply auth based on configuration

## Request Flow Architecture

### Complete Request Lifecycle

```mermaid
graph TD
    A[Client Request] --> B[Fastify Server]
    B --> C[Global Middleware]
    C --> D[Rate Limiting]
    D --> E[CORS Check]
    E --> F[Security Headers]
    F --> G[Route Resolution]
    G --> H{Protected Route?}
    H -->|Yes| I[Auth Verification]
    H -->|No| J[Route Handler]
    I --> K{Valid Session?}
    K -->|Yes| L[Organization Validation]
    K -->|No| M[401 Unauthorized]
    L --> N{Valid Org?}
    N -->|Yes| J[Route Handler]
    N -->|No| O[Clear Invalid Org]
    O --> J[Route Handler]
    J --> P[Service Layer]
    P --> Q[Repository Layer]
    Q --> R[Database Query]
    R --> S[Response Processing]
    S --> T[Client Response]
```

### Detailed Request Flow Example: `GET /api/practice/list`

```mermaid
sequenceDiagram
    participant Client
    participant Fastify
    participant Middleware
    participant Auth
    participant Route
    participant Service
    participant Database
    participant Response

    Client->>Fastify: GET /api/practice/list<br/>Authorization: Bearer token

    Fastify->>Middleware: 1. Rate Limiting Check
    Middleware-->>Fastify: ✓ Rate limit OK

    Fastify->>Middleware: 2. CORS Validation
    Middleware-->>Fastify: ✓ CORS OK

    Fastify->>Middleware: 3. Security Headers
    Middleware-->>Fastify: ✓ Headers Applied

    Fastify->>Route: 4. Route Resolution
    Route-->>Fastify: ✓ Route Found (list.get.ts)

    Fastify->>Auth: 5. Authentication Check
    Auth->>Auth: Extract Bearer Token
    Auth->>Auth: Call Better Auth getSession
    Auth->>Database: Validate Organization Access
    Database-->>Auth: ✓ Organization Valid
    Auth-->>Fastify: ✓ User Authenticated

    Fastify->>Route: 6. Route Handler Execution
    Route->>Service: Call listPractices()

    Service->>Database: 7. Query Organizations
    Database-->>Service: Return Organizations Array

    Service-->>Route: Return Practices Data
    Route->>Response: 8. Format Response
    Response-->>Client: JSON Response with Practices
```

### Authentication Flow Detail

```mermaid
graph TD
    A[Request with Bearer Token] --> B[Extract Token from Header]
    B --> C[Call Better Auth getSession]
    C --> D{Session Valid?}

    D -->|No| E[Return 401 Unauthorized]
    D -->|Yes| F[Check Active Organization]

    F --> G{Active Org Exists?}
    G -->|No| H[Set activeOrganizationId = null]
    G -->|Yes| I[Validate Org Access]

    I --> J{User Has Access?}
    J -->|No| K[Clear Invalid Org from Session]
    J -->|Yes| L[Keep Active Org]

    H --> M[Attach User to Request]
    K --> M
    L --> M

    M --> N[Continue to Route Handler]
```

### Error Handling Flow

```mermaid
graph TD
    A[Error Occurs] --> B{Error Type?}

    B -->|Service Error| C[Service Logs Error]
    B -->|Route Error| D[Route Logs Error]
    B -->|Auth Error| E[Auth Logs Error]
    B -->|Database Error| F[Database Logs Error]

    C --> G[Re-throw Error]
    D --> G
    E --> G
    F --> G

    G --> H[Global Error Handler]
    H --> I[Log Error with Context]
    I --> J[Add Request Details]
    J --> K[Add User Context]
    K --> L[Add Stack Trace]

    L --> M[Re-throw to Fastify]
    M --> N[Fastify Error Response]
    N --> O[Client Receives Error]
```

**Error Context Captured**:

- Error message and stack trace
- Request URL and HTTP method
- User ID and active organization
- Timestamp and request ID
- Additional service-specific context

## Implemented Features

### 1. Authentication System

**Location**: `src/shared/auth/`

#### Better Auth Integration (`better-auth.ts`)

**Better Auth Setup Flow**:

```mermaid
graph TD
    A[Better Auth Plugin] --> B[Create Auth Instance]
    B --> C[Configure Database Adapter]
    C --> D[Setup Plugins]
    D --> E[JWT Plugin]
    D --> F[Bearer Plugin]
    D --> G[Organization Plugin]
    D --> H[Multi-Session Plugin]

    E --> I[Register with Fastify]
    F --> I
    G --> I
    H --> I

    I --> J[Decorate Fastify Instance]
    J --> K[Auth Routes Available]
    K --> L[/api/auth/* endpoints]
```

**Key Features**:

- **JWT & Bearer Authentication**: Dual token support
- **Organization Management**: Multi-tenant organization support
- **Session Management**: Single active session per user
- **Database Hooks**: Custom session creation logic
- **Organization Validation**: Prevents invalid org assignments

**Database Hooks Flow**:

```mermaid
graph TD
    A[Session Creation Request] --> B[Database Hook Triggered]
    B --> C[Get Last Active Organization]
    C --> D{Last Org Exists?}

    D -->|Yes| E[Validate Organization Access]
    D -->|No| F[Get First Available Org]

    E --> G{User Has Access?}
    G -->|Yes| H[Set Active Org ID]
    G -->|No| F

    F --> I[Set First Available Org]
    H --> J[Create Session with Org ID]
    I --> J

    J --> K[Session Created Successfully]
```

#### Auth Verification (`verify-auth.ts`)

**Auth Verification Flow**:

```mermaid
graph TD
    A[Request with Bearer Token] --> B[Extract Token from Header]
    B --> C[Call Better Auth getSession]
    C --> D{Session Valid?}

    D -->|No| E[Check for Organization Error]
    E --> F{ORGANIZATION_NOT_FOUND?}
    F -->|Yes| G[Fallback: Direct DB Query]
    F -->|No| H[Return 401 Unauthorized]

    G --> I[Query Session from Database]
    I --> J{Session Found?}
    J -->|No| H
    J -->|Yes| K[Check Session Expiration]
    K --> L{Expired?}
    L -->|Yes| M[Return Session Expired]
    L -->|No| N[Attach User Without Org Context]

    D -->|Yes| O[Validate Active Organization]
    O --> P{Active Org Exists?}
    P -->|No| Q[Set activeOrganizationId = null]
    P -->|Yes| R[Check User Access to Org]

    R --> S{User Has Access?}
    S -->|No| T[Clear Invalid Org from Session]
    S -->|Yes| U[Keep Active Org]

    Q --> V[Attach User/Session to Request]
    T --> V
    U --> V
    N --> V

    V --> W[Continue to Route Handler]
```

**Fallback Session Validation Flow**:

```mermaid
graph TD
    A[Better Auth Fails] --> B[Extract Bearer Token]
    B --> C[Query Session from Database]
    C --> D[Inner Join with User Table]
    D --> E{Session Found?}

    E -->|No| F[Return 401 Unauthorized]
    E -->|Yes| G[Check Session Expiration]

    G --> H{Session Expired?}
    H -->|Yes| I[Return Session Expired]
    H -->|No| J[Attach User to Request]

    J --> K[Set activeOrganizationId = null]
    K --> L[Continue Without Org Context]
```

#### Key Improvements Made:

1. **Organization Validation in Database Hooks**: Prevents invalid org assignments during session creation
2. **Post-Session Organization Validation**: Validates active org after Better Auth session check
3. **Automatic Cleanup**: Removes invalid `activeOrganizationId` from database
4. **Fallback Validation**: Direct database session validation when Better Auth fails
5. **Request Decoration**: Consistent user/session attachment to request object

### 2. Practice Management Module

**Location**: `src/modules/practice/`

#### Organization Service (`organization.service.ts`)

**List Organizations Flow**:

```mermaid
graph TD
    A[listOrganizations Called] --> B[Direct Database Query]
    B --> C[Select Organization Fields]
    C --> D[Inner Join with Member Table]
    D --> E[Filter by User ID]
    E --> F[Execute Query]
    F --> G[Return Organizations with Roles]

    G --> H[Include User Role in Each Org]
    H --> I[Return Complete Organization Data]
```

**Create Organization Flow**:

```mermaid
graph TD
    A[createOrganization Called] --> B[Forward to Better Auth API]
    B --> C[Call Better Auth createOrganization]
    C --> D[Better Auth Processes Request]
    D --> E[Create Organization in Database]
    E --> F[Create Member Relationship]
    F --> G[Return Created Organization]
```

**Key Features**:

- **Direct Database Queries**: Bypasses Better Auth validation issues
- **Role Inclusion**: Returns user's role in each organization
- **Error Handling**: Comprehensive error logging and handling
- **Better Auth Integration**: Uses Better Auth for organization creation

#### Practice Service (`practice.service.ts`)

**Practice Service Flow**:

```mermaid
graph TD
    A[Practice Service] --> B{Operation Type?}

    B -->|List Practices| C[Forward to Organization Service]
    B -->|Create Practice| D[Create Organization First]

    C --> E[Call listOrganizations]
    E --> F[Return Organizations as Practices]

    D --> G[Call Better Auth createOrganization]
    G --> H[Create Practice Details]
    H --> I[Link Details to Organization]
    I --> J[Return Combined Practice Data]
```

**Practice Creation Flow**:

```mermaid
graph TD
    A[createPractice Called] --> B[Create Organization via Better Auth]
    B --> C[Organization Created Successfully]
    C --> D[Create Practice Details Record]
    D --> E[Link Details to Organization ID]
    E --> F[Return Organization + Practice Details]
```

#### API Routes

**Route Handler Flow**:

```mermaid
graph TD
    A[Route Handler Called] --> B[Extract User from Request]
    B --> C[Call Service Function]
    C --> D[Service Returns Data]
    D --> E[Format Response]
    E --> F[Send JSON Response]
```

**Route Mapping**:

```mermaid
graph LR
    A[File Structure] --> B[Route Mapping]

    A1[list.get.ts] --> B1[GET /api/practice/list]
    A2[index.post.ts] --> B2[POST /api/practice/]
    A3[[id].get.ts] --> B3[GET /api/practice/:id]
    A4[[id].put.ts] --> B4[PUT /api/practice/:id]
    A5[[id].delete.ts] --> B5[DELETE /api/practice/:id]

    B --> C[Route Configuration]
    C --> D[Authentication Required]
    C --> E[Role-based Access]
```

#### Repository Layer (`practice-details.repository.ts`)

**Repository Operations Flow**:

```mermaid
graph TD
    A[Repository Function Called] --> B{Operation Type?}

    B -->|Create| C[Insert Practice Details]
    B -->|Find| D[Query by Organization ID]
    B -->|Update| E[Update Practice Details]
    B -->|Delete| F[Delete Practice Details]

    C --> G[Execute Insert Query]
    D --> H[Execute Select Query]
    E --> I[Execute Update Query]
    F --> J[Execute Delete Query]

    G --> K[Return Created Record]
    H --> L[Return Found Record or Null]
    I --> M[Return Updated Record]
    J --> N[Return Success Status]
```

**Database Schema Structure**:

```mermaid
erDiagram
    ORGANIZATION ||--o{ PRACTICE_DETAILS : has
    ORGANIZATION {
        text id PK
        text name
        text slug UK
        text logo
        timestamp created_at
        text metadata
    }

    PRACTICE_DETAILS {
        uuid id PK
        text organization_id FK
        text practice_type
        json specialties
        text description
        text website
        text phone
        json address
        timestamp created_at
        timestamp updated_at
    }
```

### 3. Billing Module

**Location**: `src/modules/billing/`

#### Billing Service (`billing.service.ts`)

**Stripe Hosted Onboarding Flow**:

```mermaid
graph TD
    A[createConnectedAccount Called] --> B[Validate Organization (Better Auth)]
    B --> C{Organization Exists?}
    
    C -->|No| D[Throw Error]
    C -->|Yes| E[Check Existing Stripe Account]

    E --> F{Account Found?}
    F -->|No| G[Create New Stripe Account]
    F -->|Yes| H[Use Existing Account]

    G --> I[Create Account Link (Hosted Onboarding)]
    H --> I

    I --> J[Return Onboarding URL]
    J --> K[Frontend Redirects to Stripe]
```

**Payment Session Creation Flow**:

```mermaid
graph TD
    A[createPaymentsSession Called] --> B[Find Connected Account]
    B --> C{Account Found?}

    C -->|No| D[Throw Not Found Error]
    C -->|Yes| E[Create Stripe Payment Session]

    E --> F[Return Client Secret]
    F --> G[Return Session ID]
```

**Stripe Integration Flow**:

```mermaid
graph TD
    A[Stripe Service] --> B{Service Type?}

    B -->|Account Creation| C[Create Stripe Account]
    B -->|Session Creation| D[Create Account Session]
    B -->|Payment Session| E[Create Payment Session]
    B -->|Login Link| F[Create Login Link]

    C --> G[Return Account Details]
    D --> H[Return Session Details]
    E --> I[Return Payment Details]
    F --> J[Return Login URL]
```

#### Database Schema (`billing.schema.ts`)

**Billing Database Schema**:

```mermaid
erDiagram
    ORGANIZATION ||--o| STRIPE_CONNECTED_ACCOUNTS : has
    STRIPE_CONNECTED_ACCOUNTS ||--o{ STRIPE_ONBOARDING_SESSIONS : has
    STRIPE_WEBHOOK_EVENTS {
        uuid id PK
        text event_id UK
        text event_type
        text account_id
        boolean processed
        json data
        timestamp created_at
    }

    STRIPE_CONNECTED_ACCOUNTS {
        uuid id PK
        text organization_id UK
        text account_id UK
        text status
        text onboarding_status
        json requirements
        json capabilities
        boolean charges_enabled
        boolean payouts_enabled
        timestamp created_at
        timestamp updated_at
    }

    STRIPE_ONBOARDING_SESSIONS {
        uuid id PK
        uuid connected_account_id FK
        text session_id UK
        text status
        timestamp expires_at
        timestamp completed_at
        timestamp created_at
        timestamp updated_at
    }
```

#### API Routes

**Billing API Routes Flow**:

```mermaid
graph TD
    A[Billing API Routes] --> B{Route Type?}

    B -->|Onboarding| C[POST /api/onboarding/connected-accounts]
    B -->|Webhook| D[POST /api/webhooks/stripe/connected-accounts]
    B -->|Login Link| E[POST /api/onboarding/organization/:id/login-link]
    B -->|Status Check| F[GET /api/onboarding/organization/:id/status]

    C --> G[Create Connected Account & Link]
    D --> H[Process Connect Webhook]
    E --> I[Create Login Link]
    F --> J[Get Onboarding Status]

    G --> K[Return Onboarding URL]
    D --> L[Enqueued to Graphile Worker]
    I --> M[Return Login URL]
    J --> N[Return Status Info]
```

**Route Configuration Flow**:

```mermaid
graph TD
    A[Route Configuration] --> B{Route Type?}

    B -->|Protected| C[Require Authentication]
    B -->|Public| D[No Authentication]
    B -->|Admin Only| E[Require Admin Role]

    C --> F[Apply Auth Middleware]
    D --> G[Skip Auth Middleware]
    E --> H[Apply Role Check]

    F --> I[Route Active]
    G --> I
    H --> I
```

### 4. Settings Module

**Location**: `src/modules/settings/`

#### Features

- User and organization settings management
- Settings history tracking
- Category-based settings organization

### 5. Health Module

**Location**: `src/modules/health/`

#### Features

- Health check endpoint
- System status monitoring

## Database Schema & Architecture

### Core Tables (Better Auth)

**Users Table** (`user`):

```sql
CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "email" text UNIQUE NOT NULL,
  "email_verified" boolean DEFAULT false,
  "name" text,
  "image" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
```

**Organizations Table** (`organization`):

```sql
CREATE TABLE "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text UNIQUE NOT NULL,
  "logo" text,
  "created_at" timestamp NOT NULL,
  "metadata" text
);
```

**Members Table** (`member`):

```sql
CREATE TABLE "member" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp NOT NULL
);
```

**Sessions Table** (`session`):

```sql
CREATE TABLE "session" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "token" text UNIQUE NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "active_organization_id" text REFERENCES "organization"("id")
);
```

**Invitations Table** (`invitation`):

```sql
CREATE TABLE "invitation" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);
```

### Billing Tables

**Stripe Connected Accounts**:

```sql
CREATE TABLE "stripe_connected_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text UNIQUE NOT NULL,
  "account_id" text UNIQUE NOT NULL,
  "status" text DEFAULT 'pending',
  "onboarding_status" text,
  "requirements" json,
  "capabilities" json,
  "charges_enabled" boolean DEFAULT false,
  "payouts_enabled" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Stripe Onboarding Sessions**:

```sql
CREATE TABLE "stripe_onboarding_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "connected_account_id" uuid NOT NULL,
  "session_id" text UNIQUE NOT NULL,
  "status" text DEFAULT 'pending',
  "expires_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

**Stripe Webhook Events**:

```sql
CREATE TABLE "stripe_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" text UNIQUE NOT NULL,
  "event_type" text NOT NULL,
  "account_id" text,
  "processed" boolean DEFAULT false,
  "data" json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
```

### Practice Tables

**Practice Details**:

```sql
CREATE TABLE "practice_details" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organization"("id"),
  "practice_type" text,
  "specialties" json,
  "description" text,
  "website" text,
  "phone" text,
  "address" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

### Database Connection & Configuration

**Database Client Setup** (`src/database/index.ts`):

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

export const db = drizzle(pool, { schema });
```

**Migration System** (`drizzle.config.ts`):

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './src/database/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Schema Exports** (`src/schema/index.ts`):

```typescript
// Better Auth schemas
export * from './better-auth-schema';

// Feature-specific schemas
export * from '../modules/billing/schemas/billing.schema';
export * from '../modules/practice/schemas/practice.schema';
export * from '../modules/settings/schemas/settings.schema';
```

## Key Technical Decisions

### 1. File-Based Routing

- **Implementation**: `src/shared/router/file-router.ts`
- **Benefits**: Automatic route discovery, clean organization
- **Pattern**: Files map to routes (e.g., `list.get.ts` → `GET /api/practice/list`)

### 2. Authentication Strategy

- **Primary**: Better Auth with organization support
- **Fallback**: Direct database session validation
- **Security**: Organization validation, session cleanup

### 3. Database Integration

- **ORM**: Drizzle ORM with PostgreSQL
- **Migrations**: Automated migration system
- **Schema**: Centralized schema definitions

### 4. Error Handling

- **Global**: Centralized error handling in `src/app.ts`
- **Local**: Service-level error handling
- **Logging**: Structured logging with context

## Recent Bug Fixes

### 1. "Organization not found" Error Resolution

**Problem**: Users getting "Organization not found" errors when accessing `/api/practice/list`

**Root Cause**: Route file mismatch (`index.get.ts` vs `list.get.ts`)

**Solution**:

1. Renamed `src/modules/practice/routes/index.get.ts` to `list.get.ts`
2. Fixed route mapping to match requested URL `/api/practice/list`

**Additional Improvements**:

- Added organization validation in Better Auth database hooks
- Implemented fallback session validation
- Added automatic cleanup of invalid organization IDs

### 2. Code Cleanup

- Removed debug logging from production code
- Fixed linter warnings and errors
- Cleaned up temporary error handlers
- Simplified service functions

## Development Workflow

### Commands

- `npm run dev` - Development server with hot reload
- `npm run dev:fast` - Optimized development server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Apply database migrations

### Code Standards

- **Imports**: Use full path aliases (`@/`, `features/`)
- **Functions**: Named function expressions for non-trivial functions
- **Types**: Explicit types, avoid `any`
- **Naming**: camelCase for variables, kebab-case for files
- **Architecture**: Feature-based modules with clear separation

## Planned Features

### Team Payments Implementation

**Status**: Planning phase completed
**Plan**: `plan.md` - Comprehensive implementation plan based on Laravel project analysis

**Key Features to Implement**:

- Custom payment intents for teams
- Public payment forms with team slugs
- Email receipts for customers and teams
- Stripe webhook processing
- Application fee calculation
- Payment metadata storage

**Implementation Phases**:

1. Database Schema & Models
2. Service Layer
3. API Routes
4. Webhook Processing
5. Email & Receipt System
6. Validation & Types
7. Integration with Existing Systems

## Project Dependencies

### Core Dependencies

- **Fastify**: Web framework
- **Better Auth**: Authentication system
- **Drizzle ORM**: Database ORM
- **PostgreSQL**: Database
- **Stripe**: Payment processing
- **Zod**: Schema validation

### Development Dependencies

- **TypeScript**: Type system
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Jest**: Testing framework

## Configuration Files

### Environment Variables

- `BETTER_AUTH_SECRET`: Authentication secret
- `DATABASE_URL`: PostgreSQL connection string
- `STRIPE_SECRET_KEY`: Stripe API key
- `BETTER_AUTH_URL`: Authentication base URL

### Configuration Files

- `tsconfig.json`: TypeScript configuration
- `drizzle.config.ts`: Database configuration
- `package.json`: Project dependencies and scripts

## Testing Strategy

### Current State

- Basic test setup in `test/` directory
- Helper functions for testing
- Example test files

### Planned Improvements

- Unit tests for service functions
- Integration tests for API endpoints
- End-to-end tests for complete flows
- Webhook processing tests

## Security Considerations

### Authentication

- JWT token validation
- Session management with expiration
- Organization-based access control
- Member role validation

### Data Protection

- Input validation with Zod schemas
- SQL injection prevention via Drizzle ORM
- Rate limiting on API endpoints
- CORS configuration

### Payment Security

- Stripe webhook signature verification
- Secure payment intent handling
- PCI compliance through Stripe

## Performance Optimizations

### Database

- Efficient queries with Drizzle ORM
- Proper indexing on foreign keys
- Connection pooling

### Application

- Fastify's high-performance architecture
- Efficient request handling
- Minimal middleware overhead

## Background Job Processing (Graphile Worker)

### Architecture

The project uses **Graphile Worker** for reliable background job processing. Graphile Worker is a PostgreSQL-based job queue that eliminates the need for Redis, simplifying infrastructure while maintaining high reliability.

**Key Benefits:**
- ✅ **No Redis dependency** - Uses PostgreSQL for job storage
- ✅ **Automatic schema creation** - Schema auto-creates on first worker start
- ✅ **Built-in retries** - Automatic retry with exponential backoff
- ✅ **Job deduplication** - Uses `jobKey` for idempotent job processing
- ✅ **PostgreSQL-native** - Leverages existing database infrastructure

### Architecture Flow

```
Stripe Webhook → API Server → Save to DB → Enqueue to PostgreSQL → Graphile Worker
                                                                    ↓
                                                              Process & Mark Complete
```

### Components

**1. Queue Manager** (`src/shared/queue/queue.manager.ts`)
- Enqueues jobs using Graphile Worker's `makeWorkerUtils`
- Provides `addWebhookJob()` and `addOnboardingWebhookJob()` functions
- Handles job deduplication via `jobKey` parameter

**2. Graphile Worker Client** (`src/shared/queue/graphile-worker.client.ts`)
- Singleton pattern for `makeWorkerUtils`
- Manages connection lifecycle
- Auto-initializes on first use

**3. Worker Process** (`src/workers/webhook.worker.ts`)
- Separate Node.js process that consumes jobs from PostgreSQL
- Runs independently from API server
- Processes webhooks and event handlers asynchronously

**4. Task Definitions** (`src/workers/tasks/`)
- `process-stripe-webhook.ts` - Processes Stripe webhook events
- `process-onboarding-webhook.ts` - Processes Stripe Connect onboarding events
- `process-event-handler.ts` - Processes queued event handlers

### Job Processing Flow

1. **Webhook Received**: API endpoint receives webhook from Stripe
2. **Save to Database**: Webhook event saved to `webhook_events` table
3. **Enqueue Job**: Job added to Graphile Worker queue with `jobKey` for deduplication
4. **Worker Processes**: Background worker picks up job from PostgreSQL
5. **Execute Task**: Task function processes the webhook event
6. **Mark Complete**: Webhook marked as processed in database

### Configuration

**Environment Variables:**
```env
DATABASE_URL="postgresql://..."  # Required - PostgreSQL connection
GRAPHILE_WORKER_SCHEMA="graphile_worker"  # Optional - defaults to 'graphile_worker'
WEBHOOK_WORKER_CONCURRENCY=5  # Optional - concurrent job processing (default: 5)
WEBHOOK_MAX_RETRIES=5  # Optional - max retry attempts (default: 5)
```

**Package.json Scripts:**
```bash
pnpm run worker        # Start worker (production)
pnpm run worker:dev    # Start worker with watch mode (development)
```

### Deployment

**No Setup Required**: Graphile Worker automatically creates the `graphile_worker` schema on first run.

**Deployment Steps:**
1. Run database migrations: `pnpm run db:migrate`
2. Start worker process: `pnpm run worker`
3. Schema auto-creates on first worker start

**Railway/Production:**
- Run worker as separate service/container
- Worker auto-creates schema on first start
- No manual schema setup needed

### Monitoring

**Queue Statistics:**
- Query `graphile_worker.jobs` table directly for job status
- Use `getQueueStats()` function for programmatic access
- Monitor waiting, active, completed, and failed jobs

**Logging:**
- Connection status logged on worker start
- Job start/success/error events logged
- Detailed error messages for failed jobs

## Monitoring & Logging

### Logging

- Structured logging with context
- Error tracking and reporting
- Request/response logging
- Performance metrics
- Background job processing logs

### Health Checks

- Health endpoint for monitoring
- Database connection status
- External service status
- Graphile Worker connection status

## Deployment

### Current Setup

- Docker configuration
- Environment-based configuration
- Database migration system

### Production Considerations

- Environment variable management
- Database backup strategies
- Error monitoring
- Performance monitoring

## Future Roadmap

### Short Term

1. Complete team payments implementation
2. Add comprehensive testing
3. Improve error handling
4. Add API documentation

### Medium Term

1. Add more billing features
2. Implement advanced organization management
3. Add reporting and analytics
4. Improve performance monitoring

### Long Term

1. Multi-tenant architecture improvements
2. Advanced payment features
3. Integration with external services
4. Mobile API support

## Contributing Guidelines

### Code Standards

- Follow TypeScript best practices
- Use explicit types
- Write clean, readable code
- Add proper error handling

### Architecture

- Follow feature-based module structure
- Use dependency injection
- Implement proper separation of concerns
- Write testable code

### Documentation

- Document complex business logic
- Add JSDoc comments for functions
- Keep README files updated
- Document API changes

## Conclusion

The Blawby TypeScript project has evolved into a robust, feature-rich application with:

- **Solid Foundation**: Fastify + Better Auth + Drizzle ORM
- **Clean Architecture**: Feature-based modules with clear separation
- **Security**: Comprehensive authentication and authorization
- **Scalability**: Designed for growth and expansion
- **Maintainability**: Clean code with proper error handling

The project is well-positioned for continued development and feature expansion, with a clear roadmap for implementing team payments and other advanced features.

---

_Last Updated: [Current Date]_
_Version: 1.0.0_
_Status: Active Development_
