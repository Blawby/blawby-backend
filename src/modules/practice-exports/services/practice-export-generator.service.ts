import { clients } from '@/modules/clients/database/schema/clients.schema';
import { engagementContracts } from '@/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import { intakeConversationMessages } from '@/modules/intake-conversations/database/schema/intake-conversation-messages.schema';
import { intakeConversations } from '@/modules/intake-conversations/database/schema/intake-conversations.schema';
import { invoiceLineItems } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import type { PracticeExportType } from '@/modules/practice-exports/database/schema/practice-export-jobs.schema';
import { intakeTemplateFields, intakeTemplates } from '@/modules/practice/database/schema/intake-templates.schema';
import { practiceDetails, practiceServices } from '@/modules/practice/database/schema/practice.schema';
import { preferences } from '@/modules/preferences/schema/preferences.schema';
import { trustTransactions } from '@/modules/trust/database/schema/trust-transactions.schema';
import { members, organizations, users } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';
import { eventsDeadLetter } from '@/shared/events/schemas/events-dead-letter.schema';
import { events } from '@/shared/events/schemas/events.schema';
import { uploadAuditLogs } from '@/shared/uploads/schema/upload-audit-logs.schema';
import { uploads } from '@/shared/uploads/schema/uploads.schema';
import { eq, sql } from 'drizzle-orm';

const assertAuditProvenance = (records: { eventId: string; metadata: unknown }[]): void => {
  for (const record of records) {
    if (
      typeof record.metadata !== 'object' ||
      record.metadata === null ||
      !('source' in record.metadata) ||
      typeof record.metadata.source !== 'string'
    ) {
      throw new Error(`Audit event '${record.eventId}' has malformed source provenance`);
    }
  }
};

const mattersAndContacts = async (organizationId: string) => {
  const [matterRows, clientRows, activityRows] = await Promise.all([
    getActiveTx().select().from(matters).where(eq(matters.organization_id, organizationId)),
    getActiveTx().select().from(clients).where(eq(clients.organization_id, organizationId)),
    getActiveTx()
      .select({ activity: matterActivityLog })
      .from(matterActivityLog)
      .innerJoin(matters, eq(matterActivityLog.matter_id, matters.id))
      .where(eq(matters.organization_id, organizationId)),
  ]);
  return { matters: matterRows, contacts: clientRows, matter_activity: activityRows.map((row) => row.activity) };
};

const billingAndInvoices = async (organizationId: string) => {
  const [invoiceRows, lineItemRows] = await Promise.all([
    getActiveTx().select().from(invoices).where(eq(invoices.organization_id, organizationId)),
    getActiveTx()
      .select({ line_item: invoiceLineItems })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoice_id, invoices.id))
      .where(eq(invoices.organization_id, organizationId)),
  ]);
  return { invoices: invoiceRows, invoice_line_items: lineItemRows.map((row) => row.line_item) };
};

interface TrustReconciliationExportRow {
  [key: string]: unknown;
  id: string;
  organization_id: string;
  idempotency_key: string;
  statement_ending_at: Date;
  bank_statement_balance: number;
  trust_book_balance: number;
  client_ledger_balance: number;
  bank_to_book_variance: number;
  book_to_client_variance: number;
  status: string;
  source: string;
  notes: string | null;
  created_by: string;
  created_at: Date;
}

const trustLedger = async (organizationId: string) => {
  const [transactions, reconciliations] = await Promise.all([
    getActiveTx().select().from(trustTransactions).where(eq(trustTransactions.organization_id, organizationId)),
    getActiveTx().execute<TrustReconciliationExportRow>(sql`
      SELECT
        id,
        organization_id,
        idempotency_key,
        statement_ending_at,
        bank_statement_balance,
        trust_book_balance,
        client_ledger_balance,
        bank_to_book_variance,
        book_to_client_variance,
        status,
        source,
        notes,
        created_by,
        created_at
      FROM trust_reconciliations
      WHERE organization_id = ${organizationId}
      ORDER BY statement_ending_at ASC, created_at ASC
    `),
  ]);
  return {
    transactions: transactions.map((transaction) => ({ ...transaction, provenance: 'trust_transactions' })),
    reconciliations: reconciliations.rows.map((reconciliation) => ({
      ...reconciliation,
      provenance: 'trust_reconciliations',
    })),
  };
};

const auditEvents = async (organizationId: string) => {
  const [domainEvents, deadLetters, uploadEvents, matterActivity] = await Promise.all([
    getActiveTx().select().from(events).where(eq(events.organizationId, organizationId)),
    getActiveTx().select().from(eventsDeadLetter).where(eq(eventsDeadLetter.organizationId, organizationId)),
    getActiveTx().select().from(uploadAuditLogs).where(eq(uploadAuditLogs.organization_id, organizationId)),
    getActiveTx()
      .select({ activity: matterActivityLog })
      .from(matterActivityLog)
      .innerJoin(matters, eq(matterActivityLog.matter_id, matters.id))
      .where(eq(matters.organization_id, organizationId)),
  ]);
  assertAuditProvenance(domainEvents);
  assertAuditProvenance(deadLetters);
  return {
    domain_events: domainEvents.map((event) => ({ ...event, provenance: 'events' })),
    dead_letter_events: deadLetters.map((event) => ({ ...event, provenance: 'events_dead_letter' })),
    upload_events: uploadEvents.map((event) => ({ ...event, provenance: 'upload_audit_logs' })),
    matter_activity: matterActivity.map(({ activity }) => ({
      ...activity,
      provenance: 'matter_activity_log',
    })),
  };
};

const practiceArchiveSupplement = async (organizationId: string) => {
  const [
    organizationRows,
    memberRows,
    detailRows,
    serviceRows,
    intakeRows,
    conversationRows,
    messageRows,
    uploadRows,
    contractRows,
    preferenceRows,
    templateRows,
    templateFieldRows,
  ] = await Promise.all([
    getActiveTx().select().from(organizations).where(eq(organizations.id, organizationId)),
    getActiveTx()
      .select({ member: members, user: { id: users.id, name: users.name, email: users.email } })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.organizationId, organizationId)),
    getActiveTx().select().from(practiceDetails).where(eq(practiceDetails.organization_id, organizationId)),
    getActiveTx().select().from(practiceServices).where(eq(practiceServices.organization_id, organizationId)),
    getActiveTx().select().from(practiceClientIntakes).where(eq(practiceClientIntakes.organization_id, organizationId)),
    getActiveTx().select().from(intakeConversations).where(eq(intakeConversations.organization_id, organizationId)),
    getActiveTx()
      .select()
      .from(intakeConversationMessages)
      .where(eq(intakeConversationMessages.organization_id, organizationId)),
    getActiveTx().select().from(uploads).where(eq(uploads.organization_id, organizationId)),
    getActiveTx().select().from(engagementContracts).where(eq(engagementContracts.organization_id, organizationId)),
    getActiveTx().select().from(preferences).where(eq(preferences.organization_id, organizationId)),
    getActiveTx().select().from(intakeTemplates).where(eq(intakeTemplates.organization_id, organizationId)),
    getActiveTx()
      .select({ field: intakeTemplateFields })
      .from(intakeTemplateFields)
      .innerJoin(intakeTemplates, eq(intakeTemplateFields.template_id, intakeTemplates.id))
      .where(eq(intakeTemplates.organization_id, organizationId)),
  ]);
  return {
    organization: organizationRows[0] ?? null,
    members: memberRows,
    practice_details: detailRows,
    practice_services: serviceRows,
    intakes: intakeRows,
    intake_conversations: conversationRows,
    intake_conversation_messages: messageRows,
    uploads: uploadRows,
    engagement_contracts: contractRows,
    preferences: preferenceRows,
    intake_templates: templateRows,
    intake_template_fields: templateFieldRows.map((row) => row.field),
  };
};

const generate = async (organizationId: string, type: PracticeExportType): Promise<Record<string, unknown>> => {
  const envelope = { schema_version: 1, organization_id: organizationId, export_type: type };
  if (type === 'matters_contacts') {
    return { ...envelope, ...(await mattersAndContacts(organizationId)) };
  }
  if (type === 'billing_invoices') {
    return { ...envelope, ...(await billingAndInvoices(organizationId)) };
  }
  if (type === 'trust_ledger') {
    return { ...envelope, trust: await trustLedger(organizationId) };
  }
  if (type === 'audit_events') {
    return { ...envelope, audit: await auditEvents(organizationId) };
  }
  const [practiceData, supplement, billing, trust, audit] = await Promise.all([
    mattersAndContacts(organizationId),
    practiceArchiveSupplement(organizationId),
    billingAndInvoices(organizationId),
    trustLedger(organizationId),
    auditEvents(organizationId),
  ]);
  return { ...envelope, ...supplement, ...practiceData, ...billing, trust, audit };
};

export const practiceExportGeneratorService = { generate, validateAuditProvenance: assertAuditProvenance };
