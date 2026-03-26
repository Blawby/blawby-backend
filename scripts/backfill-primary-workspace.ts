import { db } from '@/shared/database';
import { users, members } from '@/schema/better-auth-schema';
import { eq, isNull, asc } from 'drizzle-orm';

async function backfillPrimaryWorkspace() {
  console.log('Starting primaryWorkspace backfill...');
  
  const usersToUpdate = await db.select().from(users).where(isNull(users.primaryWorkspace));
  console.log(`Found ${usersToUpdate.length} users without primaryWorkspace.`);

  let updatedCount = 0;
  for (const user of usersToUpdate) {
    const [firstMember] = await db.select()
      .from(members)
      .where(eq(members.userId, user.id))
      .orderBy(asc(members.createdAt))
      .limit(1);

    if (firstMember) {
      await db.update(users)
        .set({ primaryWorkspace: firstMember.organizationId })
        .where(eq(users.id, user.id));
      updatedCount++;
    }
  }

  console.log(`Successfully backfilled primaryWorkspace for ${updatedCount} users.`);
}

backfillPrimaryWorkspace()
  .catch((err) => {
    console.error('Error during backfill:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
