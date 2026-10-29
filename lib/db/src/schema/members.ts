import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const membersTable = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    memberNumber: text("member_number").notNull(),
    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name").notNull(),
    openChatNickname: text("open_chat_nickname"),
    linkStatus: text("link_status").notNull().default("pending"),
    level: integer("level").notNull().default(1),
    exp: integer("exp").notNull().default(0),
    totalExp: integer("total_exp").notNull().default(0),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_member_number_unique").on(table.memberNumber),
    uniqueIndex("members_clerk_user_id_unique").on(table.clerkUserId),
    uniqueIndex("members_open_chat_nickname_unique")
      .on(sql`lower(${table.openChatNickname})`)
      .where(sql`${table.openChatNickname} IS NOT NULL`),
    index("members_level_exp_rank_idx").on(table.level, table.exp),
  ],
);

export type Member = typeof membersTable.$inferSelect;
export type NewMember = typeof membersTable.$inferInsert;
