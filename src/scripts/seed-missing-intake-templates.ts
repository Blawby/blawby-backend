#!/usr/bin/env tsx

import { config } from '@dotenvx/dotenvx';

config();

import { db } from '@/shared/database';
import { organizations } from '@/schema/better-auth-schema';
import { intakeTemplates } from '@/modules/practice/database/schema/intake-templates.schema';
import { intakeTemplatesService } from '@/modules/practice/services/intake-templates.service';
import { eq, notInArray } from 'drizzle-orm';

const main = async (): Promise<void> => {
  const orgsWithTemplate = await db
    .selectDistinct({ organization_id: intakeTemplates.organization_id })
    .from(intakeTemplates);

  const coveredIds = orgsWithTemplate.map((r) => r.organization_id);

  const orgsWithoutTemplate =
    coveredIds.length > 0
      ? await db
          .select({ id: organizations.id, slug: organizations.slug })
          .from(organizations)
          .where(notInArray(organizations.id, coveredIds))
      : await db.select({ id: organizations.id, slug: organizations.slug }).from(organizations);

  if (orgsWithoutTemplate.length === 0) {
    console.log('All orgs have intake templates. Nothing to seed.');
    process.exit(0);
  }

  console.log(`Found ${orgsWithoutTemplate.length} org(s) without intake templates. Seeding...`);

  const errors: { org_id: string; slug: string; error: string }[] = [];

  for (const org of orgsWithoutTemplate) {
    try {
      await intakeTemplatesService.seedDefaultTemplate(org.id);
      console.log(`  ✓ ${org.slug} (${org.id})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ org_id: org.id, slug: org.slug, error: message });
      console.error(`  ✗ ${org.slug} (${org.id}): ${message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} org(s) failed to seed.`);
    process.exit(1);
  }

  console.log(`\nDone. ${orgsWithoutTemplate.length} org(s) seeded.`);
  process.exit(0);
};

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
