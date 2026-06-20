/**
 * Reset and seed backend-owned demo practice data.
 *
 * This preserves auth users, credentials, organization membership, practice details,
 * subscriptions, and Stripe connection configuration. It resets demo records owned by
 * the practice, then inserts complete current-shape matters, intakes, and engagement
 * contracts so stale proposal_data rows cannot linger in demo accounts.
 *
 * Usage:
 *   pnpm run seed:demo
 *   pnpm run seed:demo -- --apply --confirm-demo-reset
 *
 * Options:
 *   --practice-slug=<slug>    Practice slug to reset (default: demo-owner-local)
 *   --owner-email=<email>     Existing owner email used for created_by fields
 *   --client-email=<email>    Existing client email to attach demo client data
 *   --apply                   Apply destructive reset + seed
 *   --confirm-demo-reset      Required with --apply
 */

import { config } from '@dotenvx/dotenvx';
config();

import { and, eq, sql, type SQL } from 'drizzle-orm';
import { clients } from '../src/modules/clients/database/schema/clients.schema';
import { engagementContracts } from '../src/modules/engagement-contracts/database/schema/engagement-contracts.schema';
import type { ProposalData } from '../src/modules/engagement-contracts/types/proposal-data.types';
import { matterActivityLog } from '../src/modules/matters/database/schema/matter-activity-log.schema';
import { matterAssignees } from '../src/modules/matters/database/schema/matter-assignees.schema';
import { matterMilestones } from '../src/modules/matters/database/schema/matter-milestones.schema';
import { matterNotes } from '../src/modules/matters/database/schema/matter-notes.schema';
import { matterTasks } from '../src/modules/matters/database/schema/matter-tasks.schema';
import { matters } from '../src/modules/matters/database/schema/matters.schema';
import { practiceClientIntakes } from '../src/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { practiceServices } from '../src/modules/practice/database/schema/practice.schema';
import { members, organizations, users } from '../src/schema/better-auth-schema';
import { db, pool } from '../src/shared/database';

type Args = {
  apply: boolean;
  confirm: boolean;
  practiceSlug: string;
  ownerEmail: string;
  clientEmail: string;
};

type DemoContext = {
  orgId: string;
  orgName: string;
  ownerUserId: string;
  clientUserId: string;
  clientName: string;
  clientEmail: string;
  familyServiceId: string | null;
  businessServiceId: string | null;
};

type Executor = {
  execute: (query: SQL) => Promise<unknown>;
};

const DEFAULT_PRACTICE_SLUG = 'demo-owner-local';
const DEFAULT_OWNER_EMAIL = 'demo.owner.local@blawby.test';
const DEFAULT_CLIENT_EMAIL = 'blawbydemo@gmail.com';

const ids = {
  client: '11111111-1111-4111-8111-111111111001',
  familyIntake: '11111111-1111-4111-8111-111111111101',
  businessIntake: '11111111-1111-4111-8111-111111111102',
  pendingIntake: '11111111-1111-4111-8111-111111111103',
  familyConversation: '11111111-1111-4111-8111-111111111201',
  businessConversation: '11111111-1111-4111-8111-111111111202',
  pendingConversation: '11111111-1111-4111-8111-111111111203',
  familyMatter: '11111111-1111-4111-8111-111111111301',
  acceptedContract: '11111111-1111-4111-8111-111111111401',
  draftContract: '11111111-1111-4111-8111-111111111402',
  note: '11111111-1111-4111-8111-111111111501',
  task: '11111111-1111-4111-8111-111111111601',
  milestone: '11111111-1111-4111-8111-111111111701',
  activity: '11111111-1111-4111-8111-111111111801',
};

const out = (message = ''): void => {
  process.stdout.write(`${message}\n`);
};

const err = (message = ''): void => {
  process.stderr.write(`${message}\n`);
};

const optionValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const parseArgs = (): Args => ({
  apply: process.argv.includes('--apply'),
  confirm: process.argv.includes('--confirm-demo-reset'),
  practiceSlug:
    optionValue('practice-slug') ??
    process.env.E2E_PRACTICE_SLUG?.split('/').filter(Boolean).at(-1) ??
    DEFAULT_PRACTICE_SLUG,
  ownerEmail: optionValue('owner-email') ?? process.env.E2E_OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL,
  clientEmail: optionValue('client-email') ?? process.env.E2E_CLIENT_EMAIL ?? DEFAULT_CLIENT_EMAIL,
});

const rowCount = (result: unknown): number => {
  const value = (result as { rowCount?: unknown }).rowCount;
  return typeof value === 'number' ? value : 0;
};

const deleteRows = async (executor: Executor, label: string, query: SQL): Promise<{ label: string; count: number }> => {
  const result = await executor.execute(query);
  return { label, count: rowCount(result) };
};

const findServiceId = async (orgId: string, keys: string[], names: string[]): Promise<string | null> => {
  const records = await db
    .select({ id: practiceServices.id, key: practiceServices.key, name: practiceServices.name })
    .from(practiceServices)
    .where(eq(practiceServices.organization_id, orgId))
    .execute();

  const match = records.find((service) => {
    const key = service.key.toLowerCase();
    const name = service.name.toLowerCase();
    return keys.includes(key) || names.some((candidate) => name.includes(candidate));
  });

  return match?.id ?? null;
};

const resolveDemoContext = async (args: Args): Promise<DemoContext> => {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, args.practiceSlug))
    .limit(1)
    .execute();

  if (!org) {
    throw new Error(`Practice slug not found: ${args.practiceSlug}`);
  }

  const [ownerByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, args.ownerEmail))
    .limit(1)
    .execute();
  const [ownerMember] = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.organizationId, org.id), eq(members.role, 'owner')))
    .limit(1)
    .execute();
  const ownerUserId = ownerByEmail?.id ?? ownerMember?.userId;
  if (!ownerUserId) {
    throw new Error(`No owner user found for ${args.ownerEmail} or practice ${args.practiceSlug}`);
  }

  const [clientUser] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, args.clientEmail))
    .limit(1)
    .execute();

  if (!clientUser) {
    throw new Error(`Client user not found: ${args.clientEmail}. Create the account before seeding demo data.`);
  }

  return {
    orgId: org.id,
    orgName: org.name,
    ownerUserId,
    clientUserId: clientUser.id,
    clientName: clientUser.name || 'Jordan Parker',
    clientEmail: clientUser.email,
    familyServiceId: await findServiceId(org.id, ['family-law', 'family'], ['family']),
    businessServiceId: await findServiceId(org.id, ['business', 'business-formation'], ['business']),
  };
};

const countTable = async (label: string, query: SQL): Promise<{ label: string; count: number }> => {
  const result = await db.execute(query);
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return { label, count: Number(rows[0]?.count ?? 0) };
};

const summarizeExistingData = async (ctx: DemoContext): Promise<Array<{ label: string; count: number }>> => [
  await countTable(
    'engagement_contracts',
    sql`SELECT COUNT(*) AS count FROM engagement_contracts WHERE organization_id = ${ctx.orgId}`
  ),
  await countTable(
    'practice_client_intakes',
    sql`SELECT COUNT(*) AS count FROM practice_client_intakes WHERE organization_id = ${ctx.orgId}`
  ),
  await countTable('matters', sql`SELECT COUNT(*) AS count FROM matters WHERE organization_id = ${ctx.orgId}`),
  await countTable('clients', sql`SELECT COUNT(*) AS count FROM clients WHERE organization_id = ${ctx.orgId}`),
  await countTable('invoices', sql`SELECT COUNT(*) AS count FROM invoices WHERE organization_id = ${ctx.orgId}`),
  await countTable('uploads', sql`SELECT COUNT(*) AS count FROM uploads WHERE organization_id = ${ctx.orgId}`),
];

const proposalForFamilyMatter = (ctx: DemoContext): ProposalData => ({
  client_summary: {
    client_name: ctx.clientName,
    matter_summary: 'Parenting time modification and support review',
    location_summary: 'Charlotte, North Carolina',
    goals_summary: 'Protect weekday parenting time, update exchange logistics, and clarify support obligations.',
  },
  representation: {
    scope_summary: 'Limited-scope family law representation through negotiation and consent order drafting.',
    included_services: ['Review current custody order', 'Prepare negotiation strategy', 'Draft proposed consent order'],
    excluded_services: ['Trial representation', 'Appeals', 'Separate financial claims'],
    client_identity_notes: `${ctx.clientName} is the prospective client and custodial parent.`,
    jurisdiction_notes:
      'North Carolina family court jurisdiction appears supported based on residence and prior order.',
  },
  fees: {
    billing_type: 'fixed',
    fixed_fee_amount: 250000,
    hourly_rate_attorney: null,
    hourly_rate_admin: null,
    contingency_percentage: null,
    retainer_amount: 100000,
    payment_frequency: 'project',
    fee_notes: 'Fixed-fee limited scope with retainer credited against the project fee.',
  },
  risk_review: {
    conflict_status: 'clear',
    jurisdiction_status: 'supported',
    risk_notes: ['Opposing party has counsel; communications should be routed formally.'],
    open_questions: ['Confirm whether the existing order has a mediation clause.'],
  },
  source_snapshot: {
    intake_uuid: ids.familyIntake,
    conversation_id: ids.familyConversation,
    matter_id: ids.familyMatter,
    practice_area: 'Family Law',
    urgency: 'time_sensitive',
    desired_outcome: 'Protect weekday parenting time and stabilize exchange logistics.',
    opposing_party: 'Taylor Parker',
    court_date: '2026-07-14T15:00:00.000Z',
  },
  draft_meta: {
    generated_at: '2026-06-20T12:00:00.000Z',
    generated_by: 'staff',
    version: 1,
  },
});

const proposalForBusinessDraft = (ctx: DemoContext): ProposalData => ({
  client_summary: {
    client_name: ctx.clientName,
    matter_summary: 'Operating agreement review for new consulting company',
    location_summary: 'Remote client based in North Carolina',
    goals_summary: 'Review ownership terms before the company signs its first client contract.',
  },
  representation: {
    scope_summary: 'Business formation document review and advisory call.',
    included_services: ['Review draft operating agreement', 'Prepare redline comments', 'One follow-up advisory call'],
    excluded_services: ['Tax advice', 'Securities advice', 'Ongoing outside counsel services'],
    client_identity_notes: `${ctx.clientName} is seeking advice for a member-managed LLC.`,
    jurisdiction_notes: 'North Carolina entity documents and governing law expected.',
  },
  fees: {
    billing_type: 'hourly',
    fixed_fee_amount: null,
    hourly_rate_attorney: 35000,
    hourly_rate_admin: 12500,
    contingency_percentage: null,
    retainer_amount: 75000,
    payment_frequency: 'monthly',
    fee_notes: 'Hourly work billed against an evergreen retainer.',
  },
  risk_review: {
    conflict_status: 'unknown',
    jurisdiction_status: 'supported',
    risk_notes: [],
    open_questions: ['Confirm all members and ownership percentages before conflict check.'],
  },
  source_snapshot: {
    intake_uuid: ids.businessIntake,
    conversation_id: ids.businessConversation,
    matter_id: '',
    practice_area: 'Business Law',
    urgency: 'routine',
    desired_outcome: 'Understand rights and obligations before signing the operating agreement.',
    opposing_party: '',
    court_date: null,
  },
  draft_meta: {
    generated_at: '2026-06-20T12:05:00.000Z',
    generated_by: 'staff',
    version: 1,
  },
});

const resetDemoData = async (ctx: DemoContext): Promise<Array<{ label: string; count: number }>> =>
  await db.transaction(async (tx) => {
    const deletions = [
      await deleteRows(
        tx,
        'upload_audit_logs',
        sql`DELETE FROM upload_audit_logs WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(
        tx,
        'matter_files',
        sql`DELETE FROM matter_files WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'invoice_line_items',
        sql`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(tx, 'refund_requests', sql`DELETE FROM refund_requests WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(tx, 'payment_links', sql`DELETE FROM payment_links WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(
        tx,
        'billing_transactions',
        sql`DELETE FROM billing_transactions WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(
        tx,
        'trust_transactions',
        sql`DELETE FROM trust_transactions WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(
        tx,
        'engagement_contracts',
        sql`DELETE FROM engagement_contracts WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(
        tx,
        'matter_activity_log',
        sql`DELETE FROM matter_activity_log WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_assignees',
        sql`DELETE FROM matter_assignees WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_expenses',
        sql`DELETE FROM matter_expenses WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_milestones',
        sql`DELETE FROM matter_milestones WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_notes',
        sql`DELETE FROM matter_notes WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_status_history',
        sql`DELETE FROM matter_status_history WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_tasks',
        sql`DELETE FROM matter_tasks WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(
        tx,
        'matter_time_entries',
        sql`DELETE FROM matter_time_entries WHERE matter_id IN (SELECT id FROM matters WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(tx, 'invoices', sql`DELETE FROM invoices WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(tx, 'matters', sql`DELETE FROM matters WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(
        tx,
        'practice_client_memos',
        sql`DELETE FROM practice_client_memos WHERE client_id IN (SELECT id FROM clients WHERE organization_id = ${ctx.orgId})`
      ),
      await deleteRows(tx, 'clients', sql`DELETE FROM clients WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(
        tx,
        'practice_client_intakes',
        sql`DELETE FROM practice_client_intakes WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(tx, 'uploads', sql`DELETE FROM uploads WHERE organization_id = ${ctx.orgId}`),
      await deleteRows(
        tx,
        'events_dead_letter',
        sql`DELETE FROM events_dead_letter WHERE organization_id = ${ctx.orgId}`
      ),
      await deleteRows(tx, 'events', sql`DELETE FROM events WHERE organization_id = ${ctx.orgId}`),
    ];

    const now = new Date('2026-06-20T12:00:00.000Z');
    const courtDate = new Date('2026-07-14T15:00:00.000Z');

    await tx
      .insert(clients)
      .values({
        id: ids.client,
        organization_id: ctx.orgId,
        user_id: ctx.clientUserId,
        name: ctx.clientName,
        email: ctx.clientEmail,
        status: 'active',
        event_name: 'demo-seed',
        created_at: now,
        updated_at: now,
      })
      .execute();

    await tx
      .insert(practiceClientIntakes)
      .values([
        {
          id: ids.familyIntake,
          organization_id: ctx.orgId,
          practice_service_id: ctx.familyServiceId,
          amount: 0,
          currency: 'usd',
          status: 'succeeded',
          triage_status: 'accepted',
          triage_reason: 'Demo accepted intake for engagement and matter workflow.',
          triage_decided_at: now,
          metadata: {
            email: ctx.clientEmail,
            name: ctx.clientName,
            phone: '+15551234567',
            user_id: ctx.clientUserId,
            on_behalf_of: 'Self',
            opposing_party: 'Taylor Parker',
            opposing_counsel: 'Morgan Lee',
            description: 'Existing custody order needs updated exchange terms and weekday parenting time protection.',
            practice_service_name: 'Family Law',
            practice_service_uuid: ctx.familyServiceId ?? undefined,
            custom_fields: {
              children: 'Two minor children',
              prior_order: 'Entered in Mecklenburg County',
            },
          },
          conversation_id: ids.familyConversation,
          client_ip: '127.0.0.1',
          user_agent: 'demo-seed',
          urgency: 'time_sensitive',
          desired_outcome: 'Protect weekday parenting time and stabilize exchange logistics.',
          court_date: courtDate,
          has_documents: true,
          case_strength: 0.78,
          transcript_summary: 'Client needs help modifying parenting time and exchange logistics.',
          jurisdiction_status: 'supported',
          jurisdiction_match: { country: 'US', state: 'NC' },
          succeeded_at: now,
          created_at: now,
          updated_at: now,
        },
        {
          id: ids.businessIntake,
          organization_id: ctx.orgId,
          practice_service_id: ctx.businessServiceId,
          amount: 0,
          currency: 'usd',
          status: 'succeeded',
          triage_status: 'accepted',
          triage_reason: 'Demo accepted intake for draft engagement workflow.',
          triage_decided_at: now,
          metadata: {
            email: ctx.clientEmail,
            name: ctx.clientName,
            phone: '+15551234567',
            user_id: ctx.clientUserId,
            description: 'Client wants operating agreement review before signing.',
            practice_service_name: 'Business Law',
            practice_service_uuid: ctx.businessServiceId ?? undefined,
          },
          conversation_id: ids.businessConversation,
          client_ip: '127.0.0.1',
          user_agent: 'demo-seed',
          urgency: 'routine',
          desired_outcome: 'Understand rights and obligations before signing the operating agreement.',
          has_documents: true,
          case_strength: 0.64,
          transcript_summary: 'Client needs a business document review and advisory call.',
          jurisdiction_status: 'supported',
          jurisdiction_match: { country: 'US', state: 'NC' },
          succeeded_at: now,
          created_at: now,
          updated_at: now,
        },
        {
          id: ids.pendingIntake,
          organization_id: ctx.orgId,
          practice_service_id: ctx.familyServiceId,
          amount: 0,
          currency: 'usd',
          status: 'succeeded',
          triage_status: 'pending_review',
          metadata: {
            email: ctx.clientEmail,
            name: ctx.clientName,
            phone: '+15551234567',
            user_id: ctx.clientUserId,
            opposing_party: 'Former landlord',
            description: 'Security deposit dispute with incomplete documentation.',
            practice_service_name: 'Civil Litigation',
          },
          conversation_id: ids.pendingConversation,
          client_ip: '127.0.0.1',
          user_agent: 'demo-seed',
          urgency: 'routine',
          desired_outcome: 'Recover deposit or understand realistic next steps.',
          has_documents: false,
          case_strength: 0.42,
          transcript_summary: 'Pending review demo intake for triage list coverage.',
          jurisdiction_status: 'review_required',
          jurisdiction_match: { country: 'US', state: 'NC' },
          succeeded_at: now,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    await tx
      .insert(matters)
      .values({
        id: ids.familyMatter,
        organization_id: ctx.orgId,
        client_id: ids.client,
        title: 'Parenting time modification and support review',
        description: 'Limited-scope representation for custody schedule and support clarification.',
        case_number: '26-CVD-1842',
        matter_type: 'Family Law',
        billing_type: 'fixed',
        total_fixed_price: 250000,
        practice_service_id: ctx.familyServiceId,
        payment_frequency: 'project',
        retainer_balance: 100000,
        status: 'active',
        urgency: 'time_sensitive',
        responsible_attorney_id: ctx.ownerUserId,
        originating_attorney_id: ctx.ownerUserId,
        court: 'Mecklenburg County District Court',
        judge: 'Hon. Avery Collins',
        opposing_party: 'Taylor Parker',
        opposing_counsel: 'Morgan Lee',
        open_date: now,
        conversation_id: ids.familyConversation,
        intake_uuid: ids.familyIntake,
        on_behalf_of: 'Self',
        retainer_low_balance_threshold: 25000,
        last_conflict_check_at: now,
        last_conflict_check_result: { status: 'clear', checked_by: 'demo-seed' },
        created_at: now,
        updated_at: now,
      })
      .execute();

    await tx
      .insert(matterAssignees)
      .values({ matter_id: ids.familyMatter, user_id: ctx.ownerUserId, created_at: now })
      .execute();
    await tx
      .insert(matterNotes)
      .values({
        id: ids.note,
        matter_id: ids.familyMatter,
        user_id: ctx.ownerUserId,
        content: 'Demo note: confirm mediation clause and exchange location before preparing consent order.',
        created_at: now,
        updated_at: now,
      })
      .execute();
    await tx
      .insert(matterTasks)
      .values({
        id: ids.task,
        matter_id: ids.familyMatter,
        name: 'Draft proposed consent order',
        description: 'Use intake goals and current order excerpts to prepare first draft.',
        assignee_id: ctx.ownerUserId,
        due_date: '2026-06-27',
        status: 'pending',
        priority: 'high',
        stage: 'drafting',
        created_at: now,
        updated_at: now,
      })
      .execute();
    await tx
      .insert(matterMilestones)
      .values({
        id: ids.milestone,
        matter_id: ids.familyMatter,
        description: 'Court date from accepted intake',
        amount: 0,
        due_date: '2026-07-14',
        status: 'pending',
        order: 1,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await tx
      .insert(matterActivityLog)
      .values({
        id: ids.activity,
        matter_id: ids.familyMatter,
        user_id: ctx.ownerUserId,
        action: 'created',
        description: 'Demo matter seeded from accepted intake and engagement contract.',
        metadata: { source: 'seed-demo-account' },
        created_at: now,
      })
      .execute();

    const acceptedProposal = proposalForFamilyMatter(ctx);
    const draftProposal = proposalForBusinessDraft(ctx);
    await tx
      .insert(engagementContracts)
      .values([
        {
          id: ids.acceptedContract,
          intake_id: ids.familyIntake,
          matter_id: ids.familyMatter,
          organization_id: ctx.orgId,
          status: 'accepted',
          contract_body: [
            `Engagement Letter for ${ctx.clientName}`,
            '',
            'Scope of Representation',
            acceptedProposal.representation?.scope_summary ?? '',
            '',
            'Fees and Billing',
            acceptedProposal.fees?.fee_notes ?? '',
            '',
            'No guarantee of outcome is made or implied.',
          ].join('\n'),
          billing_snapshot: acceptedProposal.fees,
          proposal_data: acceptedProposal,
          engagement_notes: 'Demo accepted contract with complete proposal_data.',
          sent_at: new Date('2026-06-20T12:15:00.000Z'),
          accepted_at: new Date('2026-06-20T12:30:00.000Z'),
          created_by: ctx.ownerUserId,
          created_at: now,
          updated_at: now,
        },
        {
          id: ids.draftContract,
          intake_id: ids.businessIntake,
          organization_id: ctx.orgId,
          status: 'draft',
          contract_body: [
            `Engagement Letter for ${ctx.clientName}`,
            '',
            'Scope of Representation',
            draftProposal.representation?.scope_summary ?? '',
            '',
            'Fees and Billing',
            draftProposal.fees?.fee_notes ?? '',
            '',
            'No guarantee of outcome is made or implied.',
          ].join('\n'),
          proposal_data: draftProposal,
          engagement_notes: 'Demo draft contract ready for workbench testing.',
          created_by: ctx.ownerUserId,
          created_at: now,
          updated_at: now,
        },
      ])
      .execute();

    return deletions;
  });

const main = async (): Promise<void> => {
  const args = parseArgs();
  let touchedDb = false;

  try {
    if (args.apply && !args.confirm) {
      throw new Error('Refusing to apply without --confirm-demo-reset');
    }

    touchedDb = true;
    const ctx = await resolveDemoContext(args);
    out('Demo backend seed');
    out(`Mode: ${args.apply ? 'APPLY' : 'DRY RUN'}`);
    out(`Practice: ${ctx.orgName} (${args.practiceSlug}, ${ctx.orgId})`);
    out(`Client account: ${ctx.clientEmail}`);
    out('');

    const before = await summarizeExistingData(ctx);
    out('Existing backend-owned demo rows:');
    for (const item of before) {
      out(`  ${item.label}: ${item.count}`);
    }
    out('');
    out('Planned seed rows:');
    out('  clients: 1');
    out('  practice_client_intakes: 3');
    out('  matters: 1');
    out('  matter_notes/tasks/milestones/activity/assignees: 5');
    out('  engagement_contracts: 2');
    out('');
    out(
      'Preserved: users, credentials, organization, memberships, subscriptions, practice details, practice services.'
    );
    out('Not covered here: Worker/D1 conversation message rows owned outside this backend database.');

    if (!args.apply) {
      out('');
      out('Dry run complete. Re-run with --apply --confirm-demo-reset to reset and seed.');
      return;
    }

    const deletions = await resetDemoData(ctx);
    out('');
    out('Deleted rows:');
    for (const deletion of deletions) {
      out(`  ${deletion.label}: ${deletion.count}`);
    }
    out('');
    out('Seed complete.');
  } finally {
    if (touchedDb) {
      await pool.end();
    }
  }
};

try {
  await main();
  process.exit(0);
} catch (error) {
  err(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
