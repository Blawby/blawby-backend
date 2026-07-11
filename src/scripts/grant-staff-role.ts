#!/usr/bin/env tsx
// oxlint-disable import/first

import { config as loadEnv } from '@dotenvx/dotenvx';

loadEnv();

import { sessions, users } from '@/schema/better-auth-schema';
import {
  getStaffRoles,
  isStaffRole,
  isVerifiedStaffUser,
  parseGlobalRoles,
  STAFF_ROLES,
  type StaffRole,
} from '@/shared/auth/permissions';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { eq } from 'drizzle-orm';

const getArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const usage = 'Usage: --email <email> --role <support|ops|super_admin> [--remove] | --email <email> --remove-all';

const exitWithError = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const requireValue = (value: string | undefined, message: string): string => {
  if (value) {
    return value;
  }

  return exitWithError(message);
};

const parseRequestedStaffRole = (role: string | undefined): StaffRole | undefined => {
  if (!role) {
    return undefined;
  }

  if (isStaffRole(role)) {
    return role;
  }

  return exitWithError(`Invalid role "${role}". Valid staff roles: ${STAFF_ROLES.join(', ')}`);
};

const main = async (): Promise<void> => {
  const emailArg = getArg('email');
  const requestedRole = getArg('role');
  const remove = hasFlag('remove');
  const removeAll = hasFlag('remove-all');

  if (!emailArg || (!requestedRole && !remove && !removeAll)) {
    exitWithError(usage);
  }

  const email = requireValue(emailArg, usage);
  const requestedStaffRole = parseRequestedStaffRole(requestedRole);

  if (remove && removeAll) {
    exitWithError('Use either --remove with --role, or --remove-all. Do not combine them.');
  }

  if (remove && !requestedRole) {
    exitWithError('Use --role <support|ops|super_admin> with --remove, or use --remove-all.');
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    exitWithError(`No user found with email ${email}`);
  }

  if (!remove && !removeAll && !isVerifiedStaffUser(user, config.auth.staffEmailDomain)) {
    exitWithError(
      `Refusing: staff roles are restricted to verified accounts on @${config.auth.staffEmailDomain}. ` +
        `User email: ${user.email}, verified: ${user.emailVerified}`
    );
  }

  const currentRoles = parseGlobalRoles(user.role);
  const existingStaffRoles = getStaffRoles(user.role);
  const nonStaffRoles = currentRoles.filter((role) => !isStaffRole(role));
  const baseRoles = nonStaffRoles.length > 0 ? nonStaffRoles : ['user'];

  let nextStaffRoles = existingStaffRoles;

  if (removeAll) {
    nextStaffRoles = [];
  } else if (remove && requestedStaffRole) {
    nextStaffRoles = existingStaffRoles.filter((role) => role !== requestedStaffRole);
  } else if (requestedStaffRole) {
    nextStaffRoles = [...existingStaffRoles, requestedStaffRole];
  }

  const nextRole = [...new Set([...baseRoles, ...nextStaffRoles])].join(',');

  await db.update(users).set({ role: nextRole }).where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));

  console.log(`Updated ${email}: role "${user.role ?? ''}" -> "${nextRole}". All sessions revoked.`);
  console.log(`Previous staff roles: [${existingStaffRoles.join(', ')}]`);
  process.exit(0);
};

main().catch((error) => {
  console.error('grant-staff-role failed:', error);
  process.exit(1);
});
