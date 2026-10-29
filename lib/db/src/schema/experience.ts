import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const experienceEntriesTable = pgTable(
  "experience_entries",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("experience_member_source_unique").on(
      table.memberId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export type ExperienceEntry = typeof experienceEntriesTable.$inferSelect;
