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

export const userAuthSessions = sqliteTable(
  "user_auth_sessions",
  {
    id: text("id").primaryKey(),
    userAccountId: text("user_account_id").references(() => userAccounts.id),
    sessionHash: text("session_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("user_auth_sessions_user_idx").on(table.userAccountId)],
);

export const searchSubscriptions = sqliteTable(
  "search_subscriptions",
  {
    id: text("id").primaryKey(),
    savedSearchId: text("saved_search_id").references(() => savedSearches.id),
    status: text("status").notNull().default("active"),
    lastSentAt: text("last_sent_at"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [
    index("search_subscriptions_saved_search_idx").on(table.savedSearchId),
  ],
);

export const propertyInquiries = sqliteTable(
  "property_inquiries",
  {
    id: text("id").primaryKey(),
    leadEventId: text("lead_event_id").references(() => leadEvents.id),
    listingId: text("listing_id"),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("property_inquiries_listing_idx").on(table.listingId)],
);

export const showingRequests = sqliteTable(
  "showing_requests",
  {
    id: text("id").primaryKey(),
    leadEventId: text("lead_event_id").references(() => leadEvents.id),
    listingId: text("listing_id"),
    preferredTime: text("preferred_time"),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  },
  (table) => [index("showing_requests_listing_idx").on(table.listingId)],
);

export const leadScores = sqliteTable("lead_scores", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  score: integer("score").notNull().default(0),
  reasonJson: text("reason_json", { mode: "json" }).notNull().default({}),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const intentSnapshots = sqliteTable("intent_snapshots", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  primaryIntent: text("primary_intent").notNull(),
  confidence: integer("confidence").notNull().default(0),
  snapshotJson: text("snapshot_json", { mode: "json" }).notNull().default({}),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  userAccountId: text("user_account_id").references(() => userAccounts.id),
  preferenceJson: text("preference_json", { mode: "json" })
    .notNull()
    .default({}),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const listingMedia = sqliteTable("listing_media", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").references(() => listingCache.id),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type"),
  sortOrder: integer("sort_order"),
  rightsJson: text("rights_json", { mode: "json" }),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const listingOpenHouses = sqliteTable("listing_open_houses", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").references(() => listingCache.id),
  startAt: text("start_at").notNull(),
  endAt: text("end_at"),
  remarks: text("remarks"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const listingStatusHistory = sqliteTable("listing_status_history", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").references(() => listingCache.id),
  status: text("status").notNull(),
  changedAt: text("changed_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const providerSyncCursors = sqliteTable("provider_sync_cursors", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  cursorKey: text("cursor_key").notNull(),
  cursorValue: text("cursor_value"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const contentPages = sqliteTable("content_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  body: text("body"),
  seoJson: text("seo_json", { mode: "json" }),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const seoLandingPages = sqliteTable("seo_landing_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  geoEntityId: text("geo_entity_id"),
  queryJson: text("query_json", { mode: "json" }).notNull().default({}),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const geoEntities = sqliteTable("geo_entities", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(),
  parentId: text("parent_id"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const marketReports = sqliteTable("market_reports", {
  id: text("id").primaryKey(),
  geoEntityId: text("geo_entity_id").references(() => geoEntities.id),
  reportPeriod: text("report_period").notNull(),
  dataJson: text("data_json", { mode: "json" }).notNull().default({}),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorType: text("actor_type").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  payloadJson: text("payload_json", { mode: "json" }).notNull().default({}),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const complianceAcceptances = sqliteTable("compliance_acceptances", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  userAccountId: text("user_account_id").references(() => userAccounts.id),
  termsKey: text("terms_key").notNull(),
  acceptedAt: text("accepted_at").notNull().default("CURRENT_TIMESTAMP"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const externalIdentities = sqliteTable("external_identities", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").references(() => contacts.id),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const displayRuleSnapshots = sqliteTable("display_rule_snapshots", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  agreementScope: text("agreement_scope").notNull(),
  ruleJson: text("rule_json", { mode: "json" }).notNull().default({}),
  sourceDocument: text("source_document"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
