import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    room: text("room").notNull(),
    name: text("name").notNull(),
    text: text("text").notNull(),
    clientId: text("client_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("chat_room_created_idx").on(table.room, table.createdAt),
    index("chat_client_created_idx").on(table.clientId, table.createdAt),
  ],
);
