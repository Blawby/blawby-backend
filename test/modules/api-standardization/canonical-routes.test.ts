import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFile(resolve(path), 'utf8');

const routeBlock = (source: string, name: string): string => {
  const marker = `const ${name} = routeBuilder.build({`;
  const start = source.indexOf(marker);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n});', start);
  expect(end, `${name} should have a complete route definition`).toBeGreaterThan(start);
  return source.slice(start, end);
};

const expectRoute = (source: string, name: string, method: string, path: string, deprecated = false) => {
  const block = routeBlock(source, name);
  expect(block).toContain(`method: '${method}'`);
  expect(block).toContain(`path: '${path}'`);
  expect(block.includes('deprecated: true')).toBe(deprecated);
};

const practice = await readSource('src/modules/practice/routes/practice.routes.ts');
const practiceDetails = await readSource('src/modules/practice/routes/practice-details.routes.ts');
const memberProfiles = await readSource('src/modules/practice/routes/member-profiles.routes.ts');
const publicIntakes = await readSource('src/modules/practice-client-intakes/routes/public.routes.ts');
const clientIntakes = await readSource('src/modules/practice-client-intakes/routes/client.routes.ts');
const staffIntakes = await readSource('src/modules/practice-client-intakes/routes/staff.routes.ts');
const subscriptions = await readSource('src/modules/subscriptions/routes.ts');
const invoices = await readSource('src/modules/invoices/routes.ts');
const trust = await readSource('src/modules/trust/routes.ts');
const preferences = await readSource('src/modules/preferences/routes.ts');
const matterCore = await readSource('src/modules/matters/routes/core.routes.ts');
const matterNotes = await readSource('src/modules/matters/routes/notes.routes.ts');
const timeEntries = await readSource('src/modules/matters/routes/time-entries.routes.ts');
const expenses = await readSource('src/modules/matters/routes/expenses.routes.ts');
const milestones = await readSource('src/modules/matters/routes/milestones.routes.ts');
const tasks = await readSource('src/modules/matters/routes/tasks.routes.ts');

describe('canonical REST routes', () => {
  it('uses noun collection routes and keeps verb routes deprecated', () => {
    expectRoute(practice, 'listPracticesRoute', 'get', '/');
    expectRoute(practice, 'listPracticesLegacyRoute', 'get', '/list', true);
    expectRoute(publicIntakes, 'createPracticeClientIntakeRoute', 'post', '/');
    expectRoute(publicIntakes, 'createPracticeClientIntakeLegacyRoute', 'post', '/create', true);
    expectRoute(subscriptions, 'listSubscriptionsRoute', 'get', '/');
    expectRoute(subscriptions, 'listSubscriptionsLegacyRoute', 'get', '/list', true);
    expectRoute(subscriptions, 'cancelSubscriptionRoute', 'delete', '/');
    expectRoute(subscriptions, 'cancelSubscriptionLegacyRoute', 'post', '/cancel', true);
  });

  it('uses noun sub-resources for state transitions', () => {
    expectRoute(invoices, 'transitionInvoiceStatusRoute', 'patch', '/{practice_id}/{invoice_id}/status');
    expect(routeBlock(invoices, 'sendInvoiceRoute')).toContain('deprecated: true');
    expect(routeBlock(invoices, 'voidInvoiceRoute')).toContain('deprecated: true');
    expectRoute(staffIntakes, 'triggerIntakeInvitationRoute', 'post', '/{uuid}/invitations');
    expectRoute(staffIntakes, 'triggerIntakeInvitationLegacyRoute', 'post', '/{uuid}/invite', true);
    expectRoute(staffIntakes, 'convertIntakeRoute', 'post', '/{uuid}/conversions');
    expectRoute(staffIntakes, 'convertIntakeLegacyRoute', 'patch', '/{uuid}/convert', true);
    expectRoute(trust, 'createTrustTransactionRoute', 'post', '/{practice_id}/transactions');
    expect(routeBlock(trust, 'createDepositRoute')).toContain('deprecated: true');
    expect(routeBlock(trust, 'createWithdrawalRoute')).toContain('deprecated: true');
  });

  it('uses PATCH for partial updates and keeps PUT routes deprecated', () => {
    const routePairs = [
      [practice, 'updatePracticeRoute', 'updatePracticeLegacyRoute'],
      [practiceDetails, 'updatePracticeDetailsRoute', 'updatePracticeDetailsLegacyRoute'],
      [memberProfiles, 'updateMemberProfileRoute', 'updateMemberProfileLegacyRoute'],
      [preferences, 'updateCategoryPreferencesRoute', 'updateCategoryPreferencesLegacyRoute'],
      [clientIntakes, 'updatePracticeClientIntakeRoute', 'updatePracticeClientIntakeLegacyRoute'],
      [matterCore, 'updateMatterRoute', 'updateMatterLegacyRoute'],
      [matterNotes, 'updateMatterNoteRoute', 'updateMatterNoteLegacyRoute'],
      [timeEntries, 'updateTimeEntryRoute', 'updateTimeEntryLegacyRoute'],
      [expenses, 'updateExpenseRoute', 'updateExpenseLegacyRoute'],
      [milestones, 'updateMilestoneRoute', 'updateMilestoneLegacyRoute'],
      [tasks, 'updateMatterTaskRoute', 'updateMatterTaskLegacyRoute'],
    ];

    for (const [source, canonicalName, legacyName] of routePairs) {
      const canonical = routeBlock(source, canonicalName);
      const legacy = routeBlock(source, legacyName);
      expect(canonical).toContain("method: 'patch'");
      expect(legacy).toContain("method: 'put'");
      expect(legacy).toContain('deprecated: true');
    }
  });
});
