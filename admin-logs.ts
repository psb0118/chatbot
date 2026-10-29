import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const adminLogsTable = pgTable(
  "admin_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    details: text("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("admin_logs_created_at_idx").on(table.createdAt)],
);

export type AdminLog = typeof adminLogsTable.$inferSelect;
