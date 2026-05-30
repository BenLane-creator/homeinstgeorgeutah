import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
};

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    source: text("source").notNull().default("website"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("contacts_email_idx").on(table.emailNormalized),
    index("contacts_phone_idx").on(table.phoneNormalized),
  ],
);

export const attributionSessions = sqliteTable(
  "attribution_sessions",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id),
    landingPageUrl: text("landing_page_url"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    deviceCategory: text("device_category"),
    screenWidth: text("screen_width"),
    screenHeight: text("screen_height"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("attribution_contact_idx").on(table.contactId)],
);

export const propertyContext = sqliteTable(
  "property_context",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id"),
    sourceListingKey: text("source_listing_key"),
    pageUrl: text("page_url"),
    geoContext: text("geo_context", { mode: "json" }),
    source: text("source").notNull().default("lead_intake"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("property_context_listing_idx").on(table.listingId)],
);

export const leadEvents = sqliteTable(
  "lead_events",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id),
    attributionSessionId: text("attribution_session_id").references(
      () => attributionSessions.id,
    ),
    propertyContextId: text("property_context_id").references(
      () => propertyContext.id,
    ),
    eventType: text("event_type").notNull(),
    intentType: text("intent_type").notNull(),
    workflowLane: text("workflow_lane").notNull(),
    message: text("message"),
    pageUrl: text("page_url"),
    consent: integer("consent", { mode: "boolean" }).notNull().default(false),
    payloadJson: text("payload_json", { mode: "json" }).notNull().default({}),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("lead_events_contact_idx").on(table.contactId),
    index("lead_events_created_idx").on(table.createdAt),
    index("lead_events_intent_idx").on(table.intentType),
    index("lead_events_lane_idx").on(table.workflowLane),
  ],
);

export const routingDecisions = sqliteTable(
  "routing_decisions",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id),
    leadEventId: text("lead_event_id").references(() => leadEvents.id),
    workflowLane: text("workflow_lane").notNull(),
    reason: text("reason"),
    assignedTo: text("assigned_to"),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("routing_decisions_lane_idx").on(table.workflowLane),
    index("routing_decisions_status_idx").on(table.status),
  ],
);

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  leadEventId: text("lead_event_id").references(() => leadEvents.id),
  runType: text("run_type").notNull(),
  status: text("status").notNull().default("queued"),
  inputJson: text("input_json", { mode: "json" }),
  outputJson: text("output_json", { mode: "json" }),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const aiHandoffs = sqliteTable("ai_handoffs", {
  id: text("id").primaryKey(),
  aiRunId: text("ai_run_id").references(() => aiRuns.id),
  contactId: text("contact_id").references(() => contacts.id),
  handoffType: text("handoff_type").notNull(),
  status: text("status").notNull().default("new"),
  summary: text("summary"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const crmSyncJobs = sqliteTable(
  "crm_sync_jobs",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id),
    leadEventId: text("lead_event_id").references(() => leadEvents.id),
    downstreamSystem: text("downstream_system").notNull().default("crm"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    payloadJson: text("payload_json", { mode: "json" }),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("crm_sync_jobs_status_idx").on(table.status)],
);

export const bookingHandoffs = sqliteTable(
  "booking_handoffs",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").references(() => contacts.id),
    leadEventId: text("lead_event_id").references(() => leadEvents.id),
    status: text("status").notNull().default("queued"),
    eligibilityReason: text("eligibility_reason"),
    payloadJson: text("payload_json", { mode: "json" }),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("booking_handoffs_status_idx").on(table.status)],
);

export const userAccounts = sqliteTable("user_accounts", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const savedHomes = sqliteTable(
  "saved_homes",
  {
    id: text("id").primaryKey(),
    userAccountId: text("user_account_id").references(() => userAccounts.id),
    listingId: text("listing_id").notNull(),
    sourceListingKey: text("source_listing_key"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("saved_homes_user_idx").on(table.userAccountId),
    index("saved_homes_listing_idx").on(table.listingId),
  ],
);

export const savedSearches = sqliteTable(
  "saved_searches",
  {
    id: text("id").primaryKey(),
    userAccountId: text("user_account_id").references(() => userAccounts.id),
    name: text("name"),
    queryJson: text("query_json", { mode: "json" }).notNull().default({}),
    alertFrequency: text("alert_frequency").notNull().default("daily"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("saved_searches_user_idx").on(table.userAccountId)],
);

export const listingCache = sqliteTable(
  "listing_cache",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    sourceListingKey: text("source_listing_key").notNull(),
    standardStatus: text("standard_status"),
    city: text("city"),
    stateOrProvince: text("state_or_province"),
    postalCode: text("postal_code"),
    listPrice: integer("list_price"),
    bedroomsTotal: integer("bedrooms_total"),
    bathroomsTotal: integer("bathrooms_total"),
    livingArea: integer("living_area"),
    rawJson: text("raw_json", { mode: "json" }),
    displayJson: text("display_json", { mode: "json" }),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
    updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("listing_cache_source_key_idx").on(table.sourceListingKey),
    index("listing_cache_status_idx").on(table.standardStatus),
    index("listing_cache_city_idx").on(table.city),
  ],
);
