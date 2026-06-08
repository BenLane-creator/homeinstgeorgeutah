import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  source: varchar("source", { length: 120 }).default("website"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").references(() => contacts.id),
  intent: varchar("intent", { length: 80 }).notNull(),
  message: text("message"),
  budgetMin: integer("budget_min"),
  budgetMax: integer("budget_max"),
  timeframe: varchar("timeframe", { length: 120 }),
  pageUrl: text("page_url"),
  consent: boolean("consent").default(false).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 128 }),
  eventName: varchar("event_name", { length: 120 }).notNull(),
  pageUrl: text("page_url"),
  metadata: jsonb("metadata").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
