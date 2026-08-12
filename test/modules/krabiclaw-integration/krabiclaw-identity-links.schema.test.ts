import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { krabiclawOrganizationLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-organization-links.schema';
import { krabiclawUserLinks } from '@/modules/krabiclaw-integration/database/schema/krabiclaw-user-links.schema';

describe('krabiclaw identity link schema', () => {
  it('keeps organization links one-to-one in both directions', () => {
    const config = getTableConfig(krabiclawOrganizationLinks);
    const externalIdIndex = config.indexes.find(
      (index) => index.config.name === 'krabiclaw_organization_links_external_id_idx'
    );
    const organizationIdIndex = config.indexes.find(
      (index) => index.config.name === 'krabiclaw_organization_links_organization_id_idx'
    );

    expect(externalIdIndex?.config.unique).toBe(true);
    expect(organizationIdIndex?.config.unique).toBe(true);
  });

  it('restricts organization anchor deletion', () => {
    const config = getTableConfig(krabiclawOrganizationLinks);
    const foreignKey = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'organization_id')
    );

    expect(foreignKey?.onDelete).toBe('restrict');
  });

  it('keeps user links one-to-one in both directions', () => {
    const config = getTableConfig(krabiclawUserLinks);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toContain('krabiclaw_user_links_external_id_idx');
    expect(indexNames).toContain('krabiclaw_user_links_user_id_idx');
  });

  it('restricts user anchor deletion', () => {
    const config = getTableConfig(krabiclawUserLinks);
    const foreignKey = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((column) => column.name === 'user_id')
    );

    expect(foreignKey?.onDelete).toBe('restrict');
  });
});
