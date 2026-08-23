import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptEngagementContract } from '@/modules/engagement-contracts/operations/accept-engagement-contract.operation';
import { createEngagementContract } from '@/modules/engagement-contracts/operations/create-engagement-contract.operation';
import { declineEngagementContract } from '@/modules/engagement-contracts/operations/decline-engagement-contract.operation';
import { getEngagementContract } from '@/modules/engagement-contracts/operations/get-engagement-contract.operation';
import { listEngagementContracts } from '@/modules/engagement-contracts/operations/list-engagement-contracts.operation';
import { sendEngagementContract } from '@/modules/engagement-contracts/operations/send-engagement-contract.operation';
import { updateEngagementContract } from '@/modules/engagement-contracts/operations/update-engagement-contract.operation';
import { engagementContractsQueries } from '@/modules/engagement-contracts/database/queries/engagement-contracts.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { matterMilestones } from '@/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '@/modules/matters/database/schema/matter-notes.schema';
import {
  EngagementContractAccepted,
  EngagementContractCreated,
  EngagementContractDeclined,
  EngagementContractSent,
} from '@/shared/events/definitions';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type { TestOrganization } from '@/test/types/shared';

const { mockGeneratePdfBuffer, mockUploadPdfToR2 } = vi.hoisted(() => ({
  mockGeneratePdfBuffer: vi.fn(),
  mockUploadPdfToR2: vi.fn(),
}));

// PDF rendering and R2 upload are external I/O — stubbed at the module boundary like every other
// Legal Operation test in this repo (Stripe, Better Auth, etc.).
vi.mock('@/modules/engagement-contracts/services/engagement-contract-pdf.service', () => ({
  engagementContractPdfService: {
    generatePdfBuffer: mockGeneratePdfBuffer,
    uploadPdfToR2: mockUploadPdfToR2,
  },
}));

const createAcceptedIntake = (orgId: string, overrides?: Parameters<typeof intakeHelpers.createTestIntake>[1]) =>
  intakeHelpers.createTestIntake(orgId, {
    triage_status: 'accepted',
    status: 'succeeded',
    metadata: { email: 'client@example.com', name: 'Client Example' },
    ...overrides,
  });

describe('engagement-contract operations', () => {
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let ctx: LegalOperationContext = { organizationId: '', userId: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGeneratePdfBuffer.mockResolvedValue(Buffer.from('pdf-bytes'));
    mockUploadPdfToR2.mockImplementation(
      async (params: { organizationId: string; contractId: string }) =>
        `engagement-contracts/${params.organizationId}/${params.contractId}/signed-contract.pdf`
    );
    vi.spyOn(EngagementContractCreated, 'dispatch').mockResolvedValue('evt-created');
    vi.spyOn(EngagementContractSent, 'dispatch').mockResolvedValue('evt-sent');
    vi.spyOn(EngagementContractAccepted, 'dispatch').mockResolvedValue('evt-accepted');
    vi.spyOn(EngagementContractDeclined, 'dispatch').mockResolvedValue('evt-declined');

    org = await authHelpers.createTestOrganization();
    const staff = await authHelpers.createTestUser();
    ctx = { organizationId: org.id, userId: staff.id };
  });

  describe('tenant and human-actor boundaries', () => {
    it('rejects a cross-tenant context before creating a contract', async () => {
      const otherOrg = await authHelpers.createTestOrganization();
      const intake = await createAcceptedIntake(org.id);
      const mismatchedCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(
        createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, mismatchedCtx)
      ).rejects.toMatchObject({ status: 403 });

      const contracts = await engagementContractsQueries.listByOrg(org.id);
      expect(contracts.total).toBe(0);
    });

    it('rejects a null userId for create, update, send, accept, decline, list, and get', async () => {
      const anonymousCtx: LegalOperationContext = { organizationId: org.id, userId: null };
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      await expect(
        createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, anonymousCtx)
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        updateEngagementContract({ id: contract.id, data: { contract_body: 'x' } }, anonymousCtx)
      ).rejects.toMatchObject({ status: 403 });
      await expect(sendEngagementContract({ id: contract.id }, anonymousCtx)).rejects.toMatchObject({ status: 403 });
      await expect(acceptEngagementContract({ id: contract.id }, anonymousCtx)).rejects.toMatchObject({
        status: 403,
      });
      await expect(declineEngagementContract({ id: contract.id }, anonymousCtx)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        listEngagementContracts({ organizationId: org.id, query: { page: 1, limit: 20 } }, anonymousCtx)
      ).rejects.toMatchObject({ status: 403 });
      await expect(getEngagementContract(contract.id, anonymousCtx)).rejects.toMatchObject({ status: 403 });
    });

    it('findByIdForUpdate returns the same row shape as the ordinary lookup inside a transaction', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      const { uow } = await import('@/shared/database/uow');
      const [plain, locked] = await uow.transaction(async () => [
        await engagementContractsQueries.findById(contract.id),
        await engagementContractsQueries.findByIdForUpdate(contract.id),
      ]);

      expect(locked).toEqual(plain);
    });
  });

  describe('create', () => {
    it('creates a draft with the default proposal source snapshot and a created event', async () => {
      const intake = await createAcceptedIntake(org.id, {
        urgency: 'time_sensitive',
        desired_outcome: 'Settle quickly',
      });

      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      expect(contract.status).toBe('draft');
      expect(contract.intake_id).toBe(intake.id);
      expect(contract.proposal_data?.source_snapshot?.intake_uuid).toBe(intake.id);
      expect(contract.proposal_data?.source_snapshot?.urgency).toBe('time_sensitive');
      expect(contract.proposal_data?.source_snapshot?.desired_outcome).toBe('Settle quickly');
      expect(EngagementContractCreated.dispatch).toHaveBeenCalledWith(
        { contract_id: contract.id, intake_id: intake.id, organization_id: org.id },
        expect.objectContaining({ organizationId: org.id })
      );
    });

    it('rejects a non-accepted intake and creates no contract', async () => {
      const intake = await createAcceptedIntake(org.id, { triage_status: 'pending_review' });

      await expect(
        createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx)
      ).rejects.toMatchObject({ status: 400 });

      const { total } = await engagementContractsQueries.listByOrg(org.id, { intake_id: intake.id });
      expect(total).toBe(0);
    });

    it('rejects creating a second contract once one has already been accepted for the intake', async () => {
      const intake = await createAcceptedIntake(org.id);
      const first = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );
      await sendEngagementContract({ id: first.id }, ctx);
      await acceptEngagementContract({ id: first.id }, ctx);

      await expect(
        createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx)
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('list and get', () => {
    it('rejects cross-tenant get and list, and list returns only the context organization contracts', async () => {
      const otherOrg = await authHelpers.createTestOrganization();
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };
      await expect(getEngagementContract(contract.id, otherCtx)).rejects.toMatchObject({ status: 403 });

      const otherStaff = await authHelpers.createTestUser();
      const otherOrgCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: otherStaff.id };
      const otherIntake = await createAcceptedIntake(otherOrg.id);
      await createEngagementContract({ organizationId: otherOrg.id, data: { intake_id: otherIntake.id } }, otherOrgCtx);

      const list = await listEngagementContracts({ organizationId: org.id, query: { page: 1, limit: 20 } }, ctx);
      expect(list.data).toHaveLength(1);
      expect(list.data[0]?.id).toBe(contract.id);
    });
  });

  describe('update', () => {
    it('updates a draft and rejects updates once the contract has left draft status', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      const updated = await updateEngagementContract(
        { id: contract.id, data: { contract_body: 'Updated terms' } },
        ctx
      );
      expect(updated.contract_body).toBe('Updated terms');

      await sendEngagementContract({ id: contract.id }, ctx);
      await expect(
        updateEngagementContract({ id: contract.id, data: { contract_body: 'Too late' } }, ctx)
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('send', () => {
    it('sends a draft with a body, persists the billing snapshot, and emits one sent event', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract(
        {
          organizationId: org.id,
          data: {
            intake_id: intake.id,
            contract_body: 'Terms',
            proposal_data: { fees: { billing_type: 'hourly', fee_notes: 'n/a' } },
          },
        },
        ctx
      );

      const sent = await sendEngagementContract({ id: contract.id }, ctx);

      expect(sent.status).toBe('sent');
      expect(sent.sent_at).not.toBeNull();
      expect(sent.billing_snapshot).toMatchObject({ billing_type: 'hourly' });
      expect(EngagementContractSent.dispatch).toHaveBeenCalledTimes(1);
      expect(EngagementContractSent.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ contract_id: contract.id, client_email: 'client@example.com' }),
        expect.objectContaining({ organizationId: org.id })
      );
    });

    it('rejects sending an empty-body draft and emits no event', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract({ organizationId: org.id, data: { intake_id: intake.id } }, ctx);

      await expect(sendEngagementContract({ id: contract.id }, ctx)).rejects.toMatchObject({ status: 400 });
      expect(EngagementContractSent.dispatch).not.toHaveBeenCalled();
    });

    it('rejects a cross-tenant send and leaves the contract state unchanged', async () => {
      const otherOrg = await authHelpers.createTestOrganization();
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );
      const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(sendEngagementContract({ id: contract.id }, otherCtx)).rejects.toMatchObject({ status: 403 });

      const reloaded = await engagementContractsQueries.findById(contract.id);
      expect(reloaded?.status).toBe('draft');
    });
  });

  describe('decline', () => {
    it('declines a sent contract and rejects invalid transitions', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );

      await expect(declineEngagementContract({ id: contract.id }, ctx)).rejects.toMatchObject({ status: 409 });

      await sendEngagementContract({ id: contract.id }, ctx);
      const declined = await declineEngagementContract({ id: contract.id }, ctx);

      expect(declined.status).toBe('declined');
      expect(declined.declined_at).not.toBeNull();
      expect(EngagementContractDeclined.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ contract_id: contract.id }),
        expect.objectContaining({ organizationId: org.id })
      );

      await expect(declineEngagementContract({ id: contract.id }, ctx)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('accept', () => {
    it('accepts a sent contract, creates one matter with milestone/notes, and emits the accepted event', async () => {
      const intake = await createAcceptedIntake(org.id, {
        court_date: new Date('2027-01-15'),
        desired_outcome: 'Full settlement',
        case_strength: 0.75,
      });
      const contract = await createEngagementContract(
        {
          organizationId: org.id,
          data: {
            intake_id: intake.id,
            contract_body: 'Terms',
            proposal_data: { fees: { billing_type: 'hourly', fee_notes: 'n/a' } },
          },
        },
        ctx
      );
      await sendEngagementContract({ id: contract.id }, ctx);

      const accepted = await acceptEngagementContract({ id: contract.id, clientIp: '203.0.113.5' }, ctx);

      expect(accepted.status).toBe('accepted');
      expect(accepted.matter_id).toBeTruthy();
      expect(accepted.signed_pdf_s3_key).toBe(`engagement-contracts/${org.id}/${contract.id}/signed-contract.pdf`);

      const db = getTestDb();
      const [matter] = await db.select().from(matters).where(eq(matters.id, accepted.matter_id!));
      expect(matter.billing_type).toBe('hourly');
      expect(matter.intake_uuid).toBe(intake.id);

      const milestones = await db.select().from(matterMilestones).where(eq(matterMilestones.matter_id, matter.id));
      expect(milestones).toHaveLength(1);

      const notes = await db.select().from(matterNotes).where(eq(matterNotes.matter_id, matter.id));
      expect(notes.map((n) => n.content)).toEqual(
        expect.arrayContaining([expect.stringContaining('Full settlement'), expect.stringContaining('0.75')])
      );

      expect(EngagementContractAccepted.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ contract_id: contract.id, matter_id: matter.id }),
        expect.objectContaining({ organizationId: org.id })
      );
    });

    it('does not commit a matter, contract transition, or event when PDF preparation fails', async () => {
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );
      await sendEngagementContract({ id: contract.id }, ctx);

      mockGeneratePdfBuffer.mockRejectedValueOnce(new Error('render failed'));

      await expect(acceptEngagementContract({ id: contract.id }, ctx)).rejects.toThrow('render failed');

      const reloaded = await engagementContractsQueries.findById(contract.id);
      expect(reloaded?.status).toBe('sent');
      expect(reloaded?.matter_id).toBeNull();
      expect(EngagementContractAccepted.dispatch).not.toHaveBeenCalled();

      const { total } = await getTestDb()
        .select()
        .from(matters)
        .where(eq(matters.intake_uuid, intake.id))
        .then((rows) => ({ total: rows.length }));
      expect(total).toBe(0);
    });

    it('rejects a cross-tenant acceptance before any PDF/R2 work runs', async () => {
      const otherOrg = await authHelpers.createTestOrganization();
      const intake = await createAcceptedIntake(org.id);
      const contract = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );
      await sendEngagementContract({ id: contract.id }, ctx);
      const otherCtx: LegalOperationContext = { organizationId: otherOrg.id, userId: randomUUID() };

      await expect(acceptEngagementContract({ id: contract.id }, otherCtx)).rejects.toMatchObject({ status: 403 });
      expect(mockGeneratePdfBuffer).not.toHaveBeenCalled();
      expect(mockUploadPdfToR2).not.toHaveBeenCalled();
    });

    it('creates exactly one matter/note set and accepted event under concurrent acceptance, and the loser gets the standard conflict', async () => {
      const intake = await createAcceptedIntake(org.id, { desired_outcome: 'Concurrent test outcome' });
      const contract = await createEngagementContract(
        { organizationId: org.id, data: { intake_id: intake.id, contract_body: 'Terms' } },
        ctx
      );
      await sendEngagementContract({ id: contract.id }, ctx);

      const results = await Promise.allSettled([
        acceptEngagementContract({ id: contract.id }, ctx),
        acceptEngagementContract({ id: contract.id }, ctx),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const [rejectedResult] = rejected;
      expect(rejectedResult?.status === 'rejected' && rejectedResult.reason).toMatchObject({ status: 409 });

      const db = getTestDb();
      const matterRows = await db.select().from(matters).where(eq(matters.intake_uuid, intake.id));
      expect(matterRows).toHaveLength(1);

      const noteRows = await db.select().from(matterNotes).where(eq(matterNotes.matter_id, matterRows[0]!.id));
      expect(noteRows).toHaveLength(1);

      expect(EngagementContractAccepted.dispatch).toHaveBeenCalledTimes(1);

      // Repeated acceptance after commit produces no new side effects.
      await expect(acceptEngagementContract({ id: contract.id }, ctx)).rejects.toMatchObject({ status: 409 });
      const matterRowsAfterRetry = await db.select().from(matters).where(eq(matters.intake_uuid, intake.id));
      expect(matterRowsAfterRetry).toHaveLength(1);
      expect(EngagementContractAccepted.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
