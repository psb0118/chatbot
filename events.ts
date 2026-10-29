import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const eventSlotEnum = pgEnum("event_slot", [
  "morning",
  "afternoon",
  "midnight",
]);

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slot: eventSlotEnum("slot").notNull(),
    acceptedPhrase: text("accepted_phrase").notNull(),
    eventTime: time("event_time").notNull(),
    rewardExp: integer("reward_exp").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("events_slot_unique").on(table.slot)],
);

export type ScheduledEvent = typeof eventsTable.$inferSelect;
