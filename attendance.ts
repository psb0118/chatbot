import {
  date,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { membersTable } from "./members";

export const attendanceTable = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => membersTable.id),
    attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
    expGranted: integer("exp_granted").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_member_date_unique").on(
      table.memberId,
      table.attendanceDate,
    ),
  ],
);

export type Attendance = typeof attendanceTable.$inferSelect;
