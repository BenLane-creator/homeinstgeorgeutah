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

export function hasConsent(value: unknown) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "on"
  );
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

  if (requested === "seller_high_priority") {
    return "seller_high_priority";
  }

  if (requested === "relocation") {
    return "relocation";
  }

  if (requested === "booked_consult") {
    return "booked_consult";
  }

  if (requested === "buyer_active_search") {
    return "buyer_active_search";
  }

  if (requested === "buyer_early_stage") {
    return "buyer_early_stage";
  }

  if (requested === "general_contact") {
    return "general_contact";
  }

  return "general_contact";
}

async function upsertContact(
  env: LeadServiceEnv,
  input: {
    fullName: string;
    email: string;
    phone: string;
  },
) {
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);

  const existing = await env.DB.prepare(
    "select id from contacts where email_normalized = ? limit 1",
  )
    .bind(emailNormalized)
    .first<{ id: string }>();

  const { firstName, lastName } = splitName(input.fullName);

  if (existing?.id) {
    await env.DB.prepare(
      `update contacts
       set full_name = ?, first_name = ?, last_name = ?, email = ?, phone = ?,
           phone_normalized = ?, updated_at = CURRENT_TIMESTAMP
       where id = ?`,
    )
      .bind(
        input.fullName,
        firstName,
        lastName,
        input.email,
        input.phone || null,
        phoneNormalized || null,
        existing.id,
      )
      .run();

    return existing.id;
  }

  const contactId = crypto.randomUUID();

  await env.DB.prepare(
    `insert into contacts
      (id, full_name, first_name, last_name, email, email_normalized, phone, phone_normalized, source)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      contactId,
      input.fullName,
      firstName,
      lastName,
      input.email,
      emailNormalized,
      input.phone || null,
      phoneNormalized || null,
      "website",
    )
    .run();

  return contactId;
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
  const phone = asString(body.phone);
  const message = asString(body.message);
  const pageUrl =
    asString(body.pageUrl) || asString(body.sourcePath) || url.toString();
  const listingId = asString(body.listingId);
  const sourceListingKey = asString(body.sourceListingKey);

  const workflowLane = classifyWorkflowLane(body, input.pathname);
  const contactId = await upsertContact(env, { fullName: name, email, phone });
  const attributionSessionId = crypto.randomUUID();
  const propertyContextId = crypto.randomUUID();
  const leadEventId = crypto.randomUUID();
  const routingDecisionId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `insert into attribution_sessions
        (id, contact_id, landing_page_url, referrer, utm_source, utm_medium, utm_campaign,
         device_category, screen_width, screen_height, user_agent)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attributionSessionId,
      contactId,
      pageUrl || null,
      input.referrer || asString(body.referrer) || null,
      asString(body.utmSource) || null,
      asString(body.utmMedium) || null,
      asString(body.utmCampaign) || null,
      asString(body.deviceCategory) || null,
      asString(body.screenWidth) || null,
      asString(body.screenHeight) || null,
      input.userAgent || asString(body.userAgent) || null,
    ),
    env.DB.prepare(
      `insert into property_context
        (id, listing_id, source_listing_key, page_url, geo_context, source)
       values (?, ?, ?, ?, ?, ?)`,
    ).bind(
      propertyContextId,
      listingId || null,
      sourceListingKey || null,
      pageUrl || null,
      JSON.stringify(body.geoContext || {}),
      "lead_intake",
    ),
    env.DB.prepare(
      `insert into lead_events
        (id, contact_id, attribution_session_id, property_context_id, event_type,
         intent_type, workflow_lane, message, page_url, consent, payload_json)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      leadEventId,
      contactId,
      attributionSessionId,
      propertyContextId,
      "lead_intake",
      asString(body.intent) || workflowLane,
      workflowLane,
      message || null,
      pageUrl || null,
      1,
      JSON.stringify(body),
    ),
    env.DB.prepare(
      `insert into routing_decisions
        (id, contact_id, lead_event_id, workflow_lane, reason, status)
       values (?, ?, ?, ?, ?, ?)`,
    ).bind(
      routingDecisionId,
      contactId,
      leadEventId,
      workflowLane,
      `Lead intake classified as ${workflowLane}.`,
      "new",
    ),
  ]);

  return {
    contactId,
    leadEventId,
    attributionSessionId,
    propertyContextId,
    routingDecisionId,
    workflowLane,
  };
}
