export type WorkflowLane =
  | "seller_high_priority"
  | "valuation"
  | "buyer_active_search"
  | "buyer_early_stage"
  | "relocation"
  | "property_inquiry"
  | "showing_request"
  | "general_contact"
  | "booked_consult"
  | "nurture";

export interface LeadServiceEnv {
  DB: D1Database;
  OWNER_NOTIFICATION_EMAIL?: string;
}

export type StoredLeadResult = {
  contactId: string;
  leadEventId: string;
  attributionSessionId: string;
  propertyContextId: string;
  routingDecisionId: string;
  notificationJobId: string;
  workflowLane: WorkflowLane;
  idempotencyKey: string;
  duplicate: boolean;
};

export class LeadIdempotencyConflictError extends Error {
  readonly status = 409;
  readonly code = "IDEMPOTENCY_CONFLICT";
}

export function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

const VARIANT_LANES: Record<string, WorkflowLane> = {
  valuation: "valuation",
  relocation: "relocation",
  property_inquiry: "property_inquiry",
  showing_request: "showing_request",
};

const GENERAL_LANES = new Set<WorkflowLane>([
  "seller_high_priority",
  "buyer_active_search",
  "buyer_early_stage",
  "general_contact",
  "booked_consult",
  "nurture",
]);

export function classifyWorkflowLane(
  body: Record<string, unknown>,
  pathname: string,
): WorkflowLane {
  const variant = asString(body.formVariant).toLowerCase();
  const variantLane = VARIANT_LANES[variant];
  if (variantLane) return variantLane;

  if (pathname.includes("/showing")) return "showing_request";
  if (pathname.includes("/inquiry")) return "property_inquiry";
  if (pathname.includes("/valuation")) return "valuation";

  const intent = asString(body.intent).toLowerCase() as WorkflowLane;
  return GENERAL_LANES.has(intent) ? intent : "general_contact";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function ownerNotificationEmail(env: LeadServiceEnv) {
  const recipient = normalizeEmail(
    env.OWNER_NOTIFICATION_EMAIL || "joel@homeinstgeorgeutah.com",
  );
  if (recipient === "buyers@homeinstgeorgeutah.com") {
    throw new Error("Buyer mailbox automation is prohibited.");
  }
  return recipient;
}

type ExistingIntake = {
  request_hash: string;
  contact_id: string;
  lead_event_id: string;
  routing_decision_id: string;
  workflow_lane: WorkflowLane;
};

export async function storeLeadIntake(
  env: LeadServiceEnv,
  input: {
    body: Record<string, unknown>;
    requestUrl: string;
    pathname: string;
    referrer: string | null;
    userAgent: string | null;
  },
): Promise<StoredLeadResult> {
  const { body } = input;
  const url = new URL(input.requestUrl);

  const name = asString(body.name);
  const email = asString(body.email);
  const emailNormalized = normalizeEmail(email);
  const phone = asString(body.phone);
  const phoneNormalized = normalizePhone(phone);
  const message = asString(body.message);
  const pageUrl =
    asString(body.pageUrl) || asString(body.sourcePath) || url.toString();
  const listingId = asString(body.listingId);
  const sourceListingKey = asString(body.sourceListingKey);
  const attribution = asRecord(body.attribution);
  const device = asRecord(body.device);
  const details = asRecord(body.details);
  const workflowLane = classifyWorkflowLane(body, input.pathname);
  const idempotencyKey = asString(body.submissionId);
  if (!idempotencyKey) {
    throw new Error("Lead intake requires a submission id.");
  }

  const { firstName, lastName } = splitName(name);
  const eventPayload = {
    formVariant: asString(body.formVariant) || undefined,
    details,
    attribution,
    device,
  };
  const requestHash = await sha256Hex(
    canonicalJson({
      name,
      email: emailNormalized,
      phone: phoneNormalized,
      message,
      pageUrl,
      listingId,
      sourceListingKey,
      workflowLane,
      eventPayload,
    }),
  );

  const existing = await env.DB.prepare(
    `select request_hash, contact_id, lead_event_id, routing_decision_id, workflow_lane
       from lead_intake_requests where idempotency_key = ? limit 1`,
  )
    .bind(idempotencyKey)
    .first<ExistingIntake>();

  const stableHash = await sha256Hex(idempotencyKey);
  const attributionSessionId = `attr_${stableHash.slice(0, 32)}`;
  const propertyContextId = `prop_${stableHash.slice(0, 32)}`;
  const leadEventId = `lead_${stableHash.slice(0, 32)}`;
  const routingDecisionId = `route_${stableHash.slice(0, 32)}`;
  const notificationJobId = `notify_${stableHash.slice(0, 32)}`;

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new LeadIdempotencyConflictError(
        "This submission identifier was already used for different content.",
      );
    }
    return {
      contactId: existing.contact_id,
      leadEventId: existing.lead_event_id,
      attributionSessionId,
      propertyContextId,
      routingDecisionId: existing.routing_decision_id,
      notificationJobId,
      workflowLane: existing.workflow_lane,
      idempotencyKey,
      duplicate: true,
    };
  }

  const candidateContactId = crypto.randomUUID();
  const recipient = ownerNotificationEmail(env);
  const contactIdSql =
    "(select id from contacts where email_normalized = ? limit 1)";

  const results = await env.DB.batch([
    env.DB.prepare(
      `insert into contacts
        (id, full_name, first_name, last_name, email, email_normalized, phone,
         phone_normalized, source)
       values (?, ?, ?, ?, ?, ?, ?, ?, 'website')
       on conflict(email_normalized) do update set
         full_name = case when excluded.full_name <> '' then excluded.full_name else contacts.full_name end,
         first_name = case when excluded.first_name <> '' then excluded.first_name else contacts.first_name end,
         last_name = case when excluded.last_name <> '' then excluded.last_name else contacts.last_name end,
         email = case when excluded.email <> '' then excluded.email else contacts.email end,
         phone = coalesce(excluded.phone, contacts.phone),
         phone_normalized = coalesce(excluded.phone_normalized, contacts.phone_normalized),
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      candidateContactId,
      name,
      firstName,
      lastName,
      email,
      emailNormalized,
      phone || null,
      phoneNormalized || null,
    ),
    env.DB.prepare(
      `insert into attribution_sessions
        (id, contact_id, landing_page_url, referrer, utm_source, utm_medium,
         utm_campaign, device_category, screen_width, screen_height, user_agent)
       values (?, ${contactIdSql}, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attributionSessionId,
      emailNormalized,
      pageUrl || null,
      input.referrer || asString(body.referrer) || null,
      firstString(body.utmSource, body.utm_source, attribution.source) || null,
      firstString(body.utmMedium, body.utm_medium, attribution.medium) || null,
      firstString(body.utmCampaign, body.utm_campaign, attribution.campaign) ||
        null,
      firstString(body.deviceCategory, body.device_category, device.category) ||
        null,
      firstString(body.screenWidth, body.screen_width, device.screenWidth) ||
        null,
      firstString(body.screenHeight, body.screen_height, device.screenHeight) ||
        null,
      input.userAgent || asString(body.userAgent) || null,
    ),
    env.DB.prepare(
      `insert into property_context
        (id, listing_id, source_listing_key, page_url, geo_context, source)
       values (?, ?, ?, ?, ?, 'lead_intake')`,
    ).bind(
      propertyContextId,
      listingId || null,
      sourceListingKey || null,
      pageUrl || null,
      "{}",
    ),
    env.DB.prepare(
      `insert into lead_events
        (id, contact_id, attribution_session_id, property_context_id, event_type,
         intent_type, workflow_lane, message, page_url, consent, payload_json)
       values (?, ${contactIdSql}, ?, ?, 'lead_intake', ?, ?, ?, ?, 1, ?)`,
    ).bind(
      leadEventId,
      emailNormalized,
      attributionSessionId,
      propertyContextId,
      asString(body.intent) || workflowLane,
      workflowLane,
      message || null,
      pageUrl || null,
      JSON.stringify(eventPayload),
    ),
    env.DB.prepare(
      `insert into routing_decisions
        (id, contact_id, lead_event_id, workflow_lane, reason, assigned_to, status)
       values (?, ${contactIdSql}, ?, ?, ?, 'owner:joel', 'new')`,
    ).bind(
      routingDecisionId,
      emailNormalized,
      leadEventId,
      workflowLane,
      `Lead intake classified as ${workflowLane}.`,
    ),
    env.DB.prepare(
      `insert into notification_outbox
        (id, lead_event_id, contact_id, notification_type, recipient, status, payload_json)
       values (?, ?, ${contactIdSql}, 'owner_lead', ?, 'queued', ?)`,
    ).bind(
      notificationJobId,
      leadEventId,
      emailNormalized,
      recipient,
      JSON.stringify({ workflowLane, pageUrl, listingId: listingId || null }),
    ),
    env.DB.prepare(
      `insert into lead_intake_requests
        (idempotency_key, request_hash, contact_id, lead_event_id,
         routing_decision_id, workflow_lane, status)
       values (?, ?, ${contactIdSql}, ?, ?, ?, 'stored')`,
    ).bind(
      idempotencyKey,
      requestHash,
      emailNormalized,
      leadEventId,
      routingDecisionId,
      workflowLane,
    ),
    env.DB.prepare(
      "select id from contacts where email_normalized = ? limit 1",
    ).bind(emailNormalized),
  ]);

  const contactResult = results.at(-1)?.results?.[0] as
    | { id?: unknown }
    | undefined;
  const contactId = asString(contactResult?.id);
  if (!contactId) {
    throw new Error("Lead transaction did not return a contact id.");
  }

  return {
    contactId,
    leadEventId,
    attributionSessionId,
    propertyContextId,
    routingDecisionId,
    notificationJobId,
    workflowLane,
    idempotencyKey,
    duplicate: false,
  };
}
