import { closePool, db, eventsTable } from '@workspace/db';

/**
 * Minimal seed data for a fresh database.
 *
 * Events are unique per slot, so re-running the script only adds missing rows.
 * Members are intentionally not seeded because they are tied to Clerk accounts.
 */
const events = [
  {
    name: '아침 응원',
    slot: 'morning' as const,
    acceptedPhrase: '좋은 아침이에요',
    eventTime: '09:00',
    rewardExp: 30,
  },
  {
    name: '오후 응원',
    slot: 'afternoon' as const,
    acceptedPhrase: '오늘도 힘내요',
    eventTime: '14:00',
    rewardExp: 30,
  },
  {
    name: '자정 응원',
    slot: 'midnight' as const,
    acceptedPhrase: '오늘 하루 수고했어요',
    eventTime: '22:00',
    rewardExp: 40,
  },
];

const run = async (): Promise<void> => {
  const created = await db
    .insert(eventsTable)
    .values(events)
    .onConflictDoNothing({ target: eventsTable.slot })
    .returning();

  console.log(
    `Seed complete: ${created.length} event(s) created, ${events.length - created.length} already existed.`,
  );
};

run()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
