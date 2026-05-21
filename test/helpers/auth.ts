import type { TestHelpers } from 'better-auth/plugins';
import { auth } from '@/shared/auth/better-auth';
import { getTestDb } from '@/test/helpers/db';
import type { MemberRole } from '@/modules/practice/types/members.types';
import type { TestOrganization, TestUser } from '@/test/types/shared.ts';

const betterAuth = auth(getTestDb());

let _test: TestHelpers | null = null;

const hasTestHelpers = (ctx: unknown): ctx is { test: TestHelpers } =>
  typeof ctx === 'object' && ctx !== null && 'test' in ctx;

interface AnonymousSignInResponse {
  user: { id: string; email: string | null; name: string };
  token: string;
}

const hasAnonymousSignIn = (
  api: unknown
): api is {
  signInAnonymous: (opts: { headers: Headers }) => Promise<AnonymousSignInResponse>;
} => typeof api === 'object' && api !== null && typeof Reflect.get(api, 'signInAnonymous') === 'function';

const getTest = async (): Promise<TestHelpers> => {
  if (!_test) {
    const ctx = await betterAuth.$context;
    if (!hasTestHelpers(ctx)) {
      throw new Error('testUtils plugin is not installed. Add testUtils() to the Better Auth plugins array.');
    }

    _test = ctx.test;
    if (!_test) {
      throw new Error('testUtils plugin is not installed. Add testUtils() to the Better Auth plugins array.');
    }
  }
  return _test;
};

const createTestUser = async (overrides?: Partial<{ email: string; name: string }>): Promise<TestUser> => {
  const test = await getTest();
  const userFactory = test.createUser(overrides);
  const savedUser = await test.saveUser(userFactory);
  return savedUser;
};

const createAnonymousUser = async (): Promise<TestUser> => {
  if (!hasAnonymousSignIn(betterAuth.api)) {
    throw new Error('Anonymous auth helpers require the anonymous plugin to be installed.');
  }

  const response = await betterAuth.api.signInAnonymous({ headers: new Headers() });
  return {
    id: response.user.id,
    email: response.user.email ?? '',
    name: response.user.name ?? '',
  };
};

const createTestOrganization = async (
  overrides?: Partial<{ name: string; slug: string; id: string }>
): Promise<TestOrganization> => {
  const test = await getTest();
  if (!test.createOrganization || !test.saveOrganization) {
    throw new Error('Organization helpers require the organization plugin to be installed.');
  }
  const orgFactory = test.createOrganization(overrides);
  const idToInsert = overrides?.id ?? orgFactory.id;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const savedOrg = (await test.saveOrganization({ ...orgFactory, id: idToInsert })) as unknown as TestOrganization;
  return {
    id: savedOrg.id,
    name: savedOrg.name,
    slug: savedOrg.slug,
  };
};

const addUserToOrganization = async (userId: string, orgId: string, role: MemberRole) => {
  const test = await getTest();
  if (!test.addMember) {
    throw new Error('addMember helper requires the organization plugin to be installed.');
  }
  await test.addMember({ userId, organizationId: orgId, role });
};

const createTestContext = async (role: MemberRole = 'owner') => {
  const test = await getTest();

  if (!test.createOrganization || !test.saveOrganization || !test.addMember) {
    throw new Error('Organization plugin helpers are required but not installed.');
  }

  const user: TestUser = await test.saveUser(test.createUser());
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const org = (await test.saveOrganization(test.createOrganization())) as unknown as TestOrganization;

  await test.addMember({ userId: user.id, organizationId: org.id, role });

  const headers = await test.getAuthHeaders({ userId: user.id });
  const session = await betterAuth.api.getSession({ headers });
  const sessionToken = headers.get('cookie') ?? '';

  return { org, session, sessionToken };
};

const createNonOrgUserSession = async (): Promise<{ user: TestUser; sessionToken: string }> => {
  const test = await getTest();
  const user = await createTestUser();
  const headers = await test.getAuthHeaders({ userId: user.id });
  return { user, sessionToken: headers.get('cookie') ?? '' };
};

export const authHelpers = {
  createTestUser,
  createAnonymousUser,
  createTestOrganization,
  addUserToOrganization,
  createTestContext,
  createNonOrgUserSession,
};
