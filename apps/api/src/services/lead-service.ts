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
}

export type StoredLeadResult = {
  contactId: string;
  leadEventId: string;
  attributionSessionId: string;
  propertyContextId: string;
  routingDecisionId: string;
  workflowLane: WorkflowLane;
};

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

export function classifyWorkflowLane(
  body: Record<string, unknown>,
  pathname: string,
): WorkflowLane {
  const intent = asString(body.intent).toLowerCase();
  const explicitLane = asString(body.workflowLane).toLowerCase();
  const requested = explicitLane || intent;

  if (pathname.includes("/showing") || requested === "showing_request") {
    return "showing_request";
  }
  if (pathname.includes("/inquiry") || requested === "property_inquiry") {
    return "property_inquiry";
  }
  if (pathname.includes("/valuation") || requested === "valuation") {
    return "valuation";
  }

  const accepted = new Set<WorkflowLane>([
    "seller_high_priority",
    "relocation",
    "booked_consult",
    "buyer_active_search",
    "buyer_early_stage",
    "general_contact",
    "nurture",
  ]);

  return accepted.has(requested as WorkflowLane)
    ? (requested as WorkflowLane)
    : "general_contact";
}

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
  const workflowLane = classifyWorkflowLane(body, input.pathname);
  const { firstName, lastName } = splitName(name);
  const eventPayload = {
    formVariant: asString(body.formVariant) || undefined,
    details: asRecord(body.details),
    attribution,
    device,
  };

  const candidateContactId = crypto.randomUUID();
  const attributionSessionId = crypto.randomUUID();
  const propertyContextId = crypto.randomUUID();
  const leadEventId = crypto.randomUUID();
  const routingDecisionId = crypto.randomUUID();

  const contactIdSql =
    "(select id from contacts where email_normalized = ? limit 1)";

  const results = await env.DB.batch([
    env.DB.prepare(
      `insert into contacts
        (id, full_name, first_name, last_name, email, email_normalized, phone,
         phone_normalized, source)
       values (?, ?, ?, ?, ?, ?, ?, ?, 'website')
       on conflict(email_normalized) do update set
         full_name = excluded.full_name,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         email = excluded.email,
         phone = coalesce(excluded.phone, contacts.phone),
         phone_normalized = coalesce(
           excluded.phone_normalized,
           contacts.phone_normalized
         ),
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
        (id, contact_id, lead_event_id, workflow_lane, reason, status)
       values (?, ${contactIdSql}, ?, ?, ?, 'new')`,
    ).bind(
      routingDecisionId,
      emailNormalized,
      leadEventId,
      workflowLane,
      `Lead intake classified as ${workflowLane}.`,
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
    workflowLane,
  };
}
