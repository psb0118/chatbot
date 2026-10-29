import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { eventSlotEnum, eventsTable } from "./events";
import { membersTable } from "./members";

export const eventClaimsTable = pgTable(
  "event_claims",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id),
    slot: eventSlotEnum("slot").notNull(),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    submittedPhrase: text("submitted_phrase").notNull(),
    status: text("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note"),
  },
  (table) => [
    uniqueIndex("event_claims_member_event_date_unique").on(
      table.memberId,
      table.eventId,
      table.eventDate,
    ),
  ],
);

export type EventClaim = typeof eventClaimsTable.$inferSelect;
