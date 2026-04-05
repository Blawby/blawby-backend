# Non-Payment Intake Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/practice-client-intakes/{uuid}/claim` so non-payment intakes (zero-fee, already `succeeded`) can be linked to an authenticated user's account, creating a client record — mirroring what the payment flow does via `POST /claim` with a Stripe session ID.

**Architecture:** The new backend endpoint reuses the existing `processClaimIntakeTx` transaction function; only the intake lookup changes (by UUID instead of via Stripe). The frontend calls the new endpoint immediately after a non-payment intake is submitted, if the user is authenticated.

**Tech Stack:** Node.js / TypeScript / Hono / Drizzle ORM / Zod (backend) · React / TypeScript (frontend, separate repo at `/Users/giteshkhurani/Projects/blawby-ai-chatbot`)

---

## Scope note

This plan covers two independent repos. Tasks 1–4 are the **backend** (`/Users/giteshkhurani/Projects/blawby-ts`). Tasks 5–6 are the **frontend** (`/Users/giteshkhurani/Projects/blawby-ai-chatbot`). Each section is self-contained and can be done independently.

---

## File Map

**Backend — create/modify:**
- Modify: `src/modules/practice-client-intakes/services/intake-checkout.service.ts` — add `claimIntakeByUuid`
- Modify: `src/modules/practice-client-intakes/routes/client.routes.ts` — add `claimPracticeClientIntakeByUuidRoute`
- Modify: `src/modules/practice-client-intakes/handlers.ts` — add `claimPracticeClientIntakeByUuidHandler`
- Modify: `src/modules/practice-client-intakes/http.ts` — register new route
- Modify: `test/modules/practice-client-intakes/intakes.test.ts` — add tests for new endpoint

**Frontend — create/modify:**
- Modify: `src/config/urls.ts` — add `clientIntakeClaimByUuid`
- Modify: `src/features/intake/api/intakesApi.ts` — add `claimIntakeByUuid`
- Modify: `src/shared/hooks/useIntakeFlow.ts` — call claim after non-payment submission

---

## Task 1: Add `claimIntakeByUuid` service function

**Files:**
- Modify: `src/modules/practice-client-intakes/services/intake-checkout.service.ts`

- [ ] **Step 1: Add the function before the export object**

  Open [intake-checkout.service.ts](src/modules/practice-client-intakes/services/intake-checkout.service.ts). After the closing brace of `claimIntake` (around line 358) and before the `export const intakeCheckoutService = {` line, add:

  ```typescript
  const claimIntakeByUuid = async (
    params: { intakeUuid: string },
    ctx: ServiceContext
  ): Promise<Result<ClaimPracticeClientIntakeResponse>> => {
    try {
      const intake = await practiceClientIntakesRepository.findById(params.intakeUuid);
      if (!intake) {
        return result.notFound('Practice client intake not found');
      }

      return await db.transaction((tx) => processClaimIntakeTx(tx, intake, ctx.userId));
    } catch (error) {
      if (isClaimIntakeAbort(error)) {
        return error.result;
      }

      logger.error('Failed to claim intake by UUID {intakeUuid}: {error}', {
        intakeUuid: params.intakeUuid,
        error,
      });
      return result.internalError('Failed to claim intake');
    }
  };
  ```

- [ ] **Step 2: Export the new function**

  Add `claimIntakeByUuid` to the export object at the bottom of the file:

  ```typescript
  export const intakeCheckoutService = {
    createCheckoutSession,
    getIntakeStatus,
    getPostPayStatus,
    claimIntake,
    claimIntakeByUuid,
  };
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts && pnpm run typecheck
  ```

  Expected: no errors.

---

## Task 2: Add route and handler

**Files:**
- Modify: `src/modules/practice-client-intakes/routes/client.routes.ts`
- Modify: `src/modules/practice-client-intakes/handlers.ts`

- [ ] **Step 1: Add the route definition**

  Open [client.routes.ts](src/modules/practice-client-intakes/routes/client.routes.ts). After `claimPracticeClientIntakeRoute` and before the `export const clientRoutes = {` line, add:

  ```typescript
  const claimPracticeClientIntakeByUuidRoute = routeBuilder.build({
    method: 'post',
    path: '/{uuid}/claim',
    tags: ['Practice Client Intakes'],
    summary: 'Claim non-payment intake by UUID',
    description: 'Links a non-payment (free) intake to the authenticated user and ensures membership in the organization.',
    request: {
      params: uuidParamOpenAPISchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: intakeValidations.claimPracticeClientIntakeResponseSchema,
          },
        },
        description: 'Intake claimed successfully.',
      },
      400: {
        content: {
          'application/json': {
            schema: intakeValidations.errorResponseSchema,
          },
        },
        description: 'Bad request - intake not eligible (status is not succeeded)',
      },
      403: {
        content: {
          'application/json': {
            schema: intakeValidations.errorResponseSchema,
          },
        },
        description: 'Forbidden - intake already claimed by another user',
      },
      404: {
        content: {
          'application/json': {
            schema: intakeValidations.notFoundResponseSchema,
          },
        },
        description: 'Intake not found',
      },
      500: {
        content: {
          'application/json': {
            schema: intakeValidations.internalServerErrorResponseSchema,
          },
        },
        description: 'Internal server error',
      },
    },
  });
  ```

- [ ] **Step 2: Export the new route**

  Add `claimPracticeClientIntakeByUuidRoute` to the export object:

  ```typescript
  export const clientRoutes = {
    updatePracticeClientIntakeRoute,
    getPracticeClientIntakeStatusRoute,
    createPracticeClientIntakeCheckoutSessionRoute,
    claimPracticeClientIntakeRoute,
    claimPracticeClientIntakeByUuidRoute,
  };
  ```

- [ ] **Step 3: Add the handler**

  Open [handlers.ts](src/modules/practice-client-intakes/handlers.ts). After `claimPracticeClientIntakeHandler` and before the `export const handlers = {` line, add:

  ```typescript
  const claimPracticeClientIntakeByUuidHandler: AppRouteHandler<
    typeof clientRoutes.claimPracticeClientIntakeByUuidRoute
  > = async (c) => {
    const ctx = getServiceContext(c);
    const { uuid } = c.req.valid('param');
    const result = await intakeCheckoutService.claimIntakeByUuid({ intakeUuid: uuid }, ctx);
    return sendResult(c, result, 200);
  };
  ```

- [ ] **Step 4: Export the handler**

  Add `claimPracticeClientIntakeByUuidHandler` to the export object:

  ```typescript
  export const handlers = {
    getIntakeSettingsHandler,
    createPracticeClientIntakeHandler,
    createPracticeClientIntakeCheckoutSessionHandler,
    updatePracticeClientIntakeHandler,
    getPracticeClientIntakeStatusHandler,
    getPracticeClientIntakePostPayStatusHandler,
    claimPracticeClientIntakeHandler,
    claimPracticeClientIntakeByUuidHandler,
    triggerIntakeInvitationHandler,
    listIntakesHandler,
    getIntakeHandler,
    updateIntakeTriageStatusHandler,
    convertIntakeHandler,
  };
  ```

- [ ] **Step 5: Typecheck**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts && pnpm run typecheck
  ```

  Expected: no errors.

---

## Task 3: Register the route

**Files:**
- Modify: `src/modules/practice-client-intakes/http.ts`

- [ ] **Step 1: Register in the dynamic routes section**

  Open [http.ts](src/modules/practice-client-intakes/http.ts). Add the registration after the existing `claimPracticeClientIntakeRoute` line (which is a static route), placing it in the dynamic section alongside other `/{uuid}/...` routes:

  ```typescript
  // Static routes
  practiceClientIntakesApp.openapi(
    publicRoutes.getPracticeClientIntakePostPayStatusRoute,
    handlers.getPracticeClientIntakePostPayStatusHandler
  );
  practiceClientIntakesApp.openapi(
    clientRoutes.claimPracticeClientIntakeRoute,
    handlers.claimPracticeClientIntakeHandler
  );
  practiceClientIntakesApp.openapi(
    publicRoutes.createPracticeClientIntakeRoute,
    handlers.createPracticeClientIntakeHandler
  );
  // Dynamic routes with path parameters
  practiceClientIntakesApp.openapi(publicRoutes.getIntakeSettingsRoute, handlers.getIntakeSettingsHandler);
  practiceClientIntakesApp.openapi(
    clientRoutes.createPracticeClientIntakeCheckoutSessionRoute,
    handlers.createPracticeClientIntakeCheckoutSessionHandler
  );
  practiceClientIntakesApp.openapi(
    clientRoutes.claimPracticeClientIntakeByUuidRoute,
    handlers.claimPracticeClientIntakeByUuidHandler
  );
  practiceClientIntakesApp.openapi(
    clientRoutes.updatePracticeClientIntakeRoute,
    handlers.updatePracticeClientIntakeHandler
  );
  practiceClientIntakesApp.openapi(
    clientRoutes.getPracticeClientIntakeStatusRoute,
    handlers.getPracticeClientIntakeStatusHandler
  );
  practiceClientIntakesApp.openapi(staffRoutes.triggerIntakeInvitationRoute, handlers.triggerIntakeInvitationHandler);
  practiceClientIntakesApp.openapi(staffRoutes.listIntakesRoute, handlers.listIntakesHandler);
  practiceClientIntakesApp.openapi(staffRoutes.getIntakeRoute, handlers.getIntakeHandler);
  practiceClientIntakesApp.openapi(staffRoutes.updateIntakeTriageStatusRoute, handlers.updateIntakeTriageStatusHandler);
  practiceClientIntakesApp.openapi(staffRoutes.convertIntakeRoute, handlers.convertIntakeHandler);
  ```

- [ ] **Step 2: Typecheck**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts && pnpm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts
  git add src/modules/practice-client-intakes/services/intake-checkout.service.ts \
          src/modules/practice-client-intakes/routes/client.routes.ts \
          src/modules/practice-client-intakes/handlers.ts \
          src/modules/practice-client-intakes/http.ts
  git commit -m "feat(intake): add POST /{uuid}/claim endpoint for non-payment intakes"
  ```

---

## Task 4: Write backend tests

**Files:**
- Modify: `test/modules/practice-client-intakes/intakes.test.ts`

The existing test file uses Vitest. Add the following tests inside the `describe('Practice Client Intakes API', ...)` block, after the existing `POST /claim` tests (around line 338).

- [ ] **Step 1: Add the happy-path test**

  ```typescript
  it('POST /{uuid}/claim returns 200 for authenticated user with succeeded non-payment intake', async () => {
    const freeIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.succeeded,
      metadata: { email: session!.user.email, name: session!.user.name ?? 'Test User' },
    });

    const res = await toTypedResponse<SuccessResponse<ClaimPracticeClientIntakeResponse>>(
      authenticatedClientRequest(sessionToken).post(
        `/api/practice-client-intakes/${freeIntake.id}/claim`
      )
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intake_uuid).toBe(freeIntake.id);
    expect(res.body.data.organization_id).toBe(org.id);
  });
  ```

- [ ] **Step 2: Add the 401 test**

  ```typescript
  it('POST /{uuid}/claim returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.post(`/api/practice-client-intakes/${intakeId}/claim`);
    expect(res.status).toBe(401);
  });
  ```

- [ ] **Step 3: Add the 404 test**

  ```typescript
  it('POST /{uuid}/claim returns 404 for unknown intake UUID', async () => {
    const unknownUuid = '00000000-0000-0000-0000-000000000000';
    const res = await authenticatedClientRequest(sessionToken).post(
      `/api/practice-client-intakes/${unknownUuid}/claim`
    );
    expect(res.status).toBe(404);
  });
  ```

- [ ] **Step 4: Add the 400 test for non-succeeded intake**

  ```typescript
  it('POST /{uuid}/claim returns 400 when intake status is not succeeded', async () => {
    const openIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 5000,
      status: intakeHelpers.IntakeStatus.open,
      metadata: { email: 'open@example.com', name: 'Open User' },
    });

    const res = await authenticatedClientRequest(sessionToken).post(
      `/api/practice-client-intakes/${openIntake.id}/claim`
    );
    expect(res.status).toBe(400);
  });
  ```

- [ ] **Step 5: Run the tests**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts && pnpm run test
  ```

  Expected: all tests pass including the four new ones.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ts
  git add test/modules/practice-client-intakes/intakes.test.ts
  git commit -m "test(intake): add tests for POST /{uuid}/claim endpoint"
  ```

---

## Task 5: Add frontend API function and URL

**Files:**
- Modify: `src/config/urls.ts` (in `/Users/giteshkhurani/Projects/blawby-ai-chatbot`)
- Modify: `src/features/intake/api/intakesApi.ts`

- [ ] **Step 1: Add the URL helper**

  Open [src/config/urls.ts](src/config/urls.ts). After the `clientIntakeClaim` line (line 73), add:

  ```typescript
  export const clientIntakeClaimByUuid = (intakeUuid: string): string =>
    `/api/practice-client-intakes/${encodeSegment(intakeUuid)}/claim`;
  ```

  Then add it to the export object (near line 259 alongside `clientIntakeClaim`):

  ```typescript
  clientIntakeClaim,
  clientIntakeClaimByUuid,
  ```

- [ ] **Step 2: Add the API function**

  Open [src/features/intake/api/intakesApi.ts](src/features/intake/api/intakesApi.ts). Update the import at line 1 to include the new URL helper:

  ```typescript
  import { clientIntakeClaim, clientIntakeClaimByUuid, clientIntakeStatus, clientIntakes } from '@/config/urls';
  ```

  After the closing brace of `claimIntakePayment` (end of file), add:

  ```typescript
  export async function claimIntakeByUuid(intakeUuid: string): Promise<ClaimIntakePaymentResponse | null> {
    if (!intakeUuid) {
      throw new Error('intakeUuid is required');
    }

    const response = await fetch(clientIntakeClaimByUuid(intakeUuid), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const json = await response.json().catch(() => null) as {
      success?: boolean;
      data?: ClaimIntakePaymentResponse;
      error?: string;
      message?: string;
    } | null;

    const errorText = [json?.error, json?.message]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ');
    const isConflict =
      response.status === 409 || /already\s+(?:claimed|attached)|duplicate|conflict/i.test(errorText);

    if (isConflict) {
      return json?.data ?? null;
    }

    if (!response.ok || json?.success === false || !json?.data) {
      throw new Error(json?.error || 'Failed to claim intake');
    }

    return json.data;
  }
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ai-chatbot && pnpm run typecheck 2>/dev/null || npx tsc --noEmit
  ```

  Expected: no errors on the modified files.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ai-chatbot
  git add src/config/urls.ts src/features/intake/api/intakesApi.ts
  git commit -m "feat(intake): add claimIntakeByUuid API function"
  ```

---

## Task 6: Call claim after non-payment intake submission

**Files:**
- Modify: `src/shared/hooks/useIntakeFlow.ts` (in `/Users/giteshkhurani/Projects/blawby-ai-chatbot`)

- [ ] **Step 1: Import the new function**

  Open [src/shared/hooks/useIntakeFlow.ts](src/shared/hooks/useIntakeFlow.ts). Find the import that references `intakesApi` or `claimIntakePayment` and add `claimIntakeByUuid`:

  ```typescript
  import { claimIntakeByUuid } from '@/features/intake/api/intakesApi';
  ```

  Also ensure `getSession` is imported (it's already used in `PaySuccessPage` from the same path):

  ```typescript
  import { getSession } from '@/shared/lib/authClient';
  ```

- [ ] **Step 2: Add the claim call in the non-payment branch**

  Find the `if (!paymentLinkUrl) {` block (around line 835). After the `try/catch` that posts the confirmation message and before the `updateConversationMetadata` call, add the claim call:

  ```typescript
  if (!paymentLinkUrl) {
    const practiceName =
      (conversationMetadataRef.current as Record<string, unknown>)?.practiceName as string | undefined
      ?? 'the practice';
    const messageId = `system-intake-submit-${intakeUuid}`;
    try {
      const persistedMessage = await postSystemMessage(conversationId, practiceId, {
        clientId: messageId,
        content: `Your intake has been submitted. ${practiceName} will review it and follow up with you here shortly.`,
        metadata: { intakeUuid, intakeSubmitted: true },
      });
      if (persistedMessage) applyServerMessages([persistedMessage]);
    } catch (msgError) {
      console.warn('[handleFinalizeSubmit] Failed to post confirmation message', msgError);
    }

    // Claim the intake for authenticated (non-anonymous) users — mirrors the payment flow in PaySuccessPage.
    if (currentUserId && !isAnonymous) {
      try {
        await claimIntakeByUuid(intakeUuid);
        await getSession().catch(() => undefined);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:session-updated'));
        }
      } catch (claimError) {
        // Non-fatal: claim failure should not break the submission UX.
        console.warn('[handleFinalizeSubmit] Failed to claim non-payment intake', claimError);
      }
    }
  }
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ai-chatbot && pnpm run typecheck 2>/dev/null || npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/giteshkhurani/Projects/blawby-ai-chatbot
  git add src/shared/hooks/useIntakeFlow.ts
  git commit -m "feat(intake): claim non-payment intake after submission for authenticated users"
  ```

---

## Verification Checklist

- [ ] `pnpm run typecheck` passes in backend repo
- [ ] `pnpm run format:check` passes in backend repo
- [ ] `pnpm run test` passes in backend repo (all existing tests + 4 new)
- [ ] `POST /{uuid}/claim` returns `200` for a `succeeded` intake when authenticated
- [ ] `POST /{uuid}/claim` returns `400` for an `open` intake
- [ ] `POST /{uuid}/claim` returns `404` for unknown UUID
- [ ] `POST /{uuid}/claim` returns `401` for unauthenticated request
- [ ] Frontend: authenticated user submitting zero-fee intake triggers claim silently
- [ ] Frontend: anonymous user submitting zero-fee intake does NOT trigger claim
