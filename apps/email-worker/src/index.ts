const DEFAULT_FORWARD_TO = "joel@homeinstgeorge.com";
const DEFAULT_AUTO_REPLY_FROM = "contact@homeinstgeorgeutah.com";
const INTERNAL_DELIVERY_HOST = "email-delivery.internal";
const INTERNAL_DELIVERY_PATH = "/internal/owner-lead";
const MAX_INTERNAL_BODY_BYTES = 64 * 1024;

export const CANONICAL_WORKFLOW_LANES = [
  "seller_high_priority",
  "valuation",
  "buyer_active_search",
  "buyer_early_stage",
  "relocation",
  "property_inquiry",
  "showing_request",
  "general_contact",
  "booked_consult",
  "nurture",
] as const;

export type WorkflowLane = (typeof CANONICAL_WORKFLOW_LANES)[number];

const WORKFLOW_LANE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

const aliasRules: Record<
  string,
  { intentType: string; workflowLane: WorkflowLane }
> = {
  "buyers@homeinstgeorgeutah.com": {
    intentType: "buyer_email",
    workflowLane: "buyer_early_stage",
  },
  "sellers@homeinstgeorgeutah.com": {
    intentType: "seller_email",
    workflowLane: "seller_high_priority",
  },
  "relocation@homeinstgeorgeutah.com": {
    intentType: "relocation_email",
    workflowLane: "relocation",
  },
  "contact@homeinstgeorgeutah.com": {
    intentType: "general_email",
    workflowLane: "general_contact",
  },
};

export interface Env {
  DB: D1Database;
  EMAIL?: SendEmail;
  OWNER_EMAIL?: SendEmail;
  FORWARD_TO?: string;
  AUTO_REPLY_FROM?: string;
  AUTO_REPLY_ENABLED?: string;
  ADDITIONAL_WORKFLOW_LANES?: string;
}

type OwnerLeadDelivery = {
  event: "owner.lead.received";
  to: string;
  subject?: string;
  lead: {
    eventId: string;
    contactId: string;
    name: string;
    email: string;
    phone?: string | null;
    message?: string | null;
    workflowLane: string;
    pageUrl?: string | null;
    context?: Record<string, unknown>;
  };
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function extractName(fromHeader: string) {
  const value = clean(fromHeader);
  const match = value.match(/^"?([^"<]+)"?\s*</);
  return clean(match?.[1] || value.split("@")[0] || "Email lead");
}

function splitName(fullName: string) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function getRule(toAddress: string) {
  const to = normalizeEmail(toAddress);

  return (
    aliasRules[to] || {
      intentType: "inbound_email",
      workflowLane: "general_contact" as const,
    }
  );
}

function shouldSkipAutoReply(message: ForwardableEmailMessage) {
  const from = normalizeEmail(message.from);
  const autoSubmitted = clean(
    message.headers.get("auto-submitted"),
  ).toLowerCase();
  const precedence = clean(message.headers.get("precedence")).toLowerCase();

  return (
    !from ||
    from.includes("noreply") ||
    from.includes("no-reply") ||
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    from === "joel@homeinstgeorge.com" ||
    (autoSubmitted && autoSubmitted !== "no") ||
    precedence === "bulk" ||
    precedence === "junk" ||
    precedence === "list"
  );
}

async function upsertContact(
  env: Env,
  input: { fullName: string; email: string },
) {
  const emailNormalized = normalizeEmail(input.email);
  const fullName = clean(input.fullName) || emailNormalized;
  const { firstName, lastName } = splitName(fullName);

  const existing = await env.DB.prepare(
    "select id from contacts where email_normalized = ? limit 1",
  )
    .bind(emailNormalized)
    .first<{ id: string }>();

  if (existing?.id) {
    await env.DB.prepare(
      `update contacts
         set full_name = ?, first_name = ?, last_name = ?, email = ?,
             updated_at = CURRENT_TIMESTAMP
         where id = ?`,
    )
      .bind(fullName, firstName, lastName, input.email, existing.id)
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
      fullName,
      firstName,
      lastName,
      input.email,
      emailNormalized,
      null,
      null,
      "inbound_email",
    )
    .run();

  return contactId;
}

async function captureInboundEmail(
  env: Env,
  message: ForwardableEmailMessage,
  rawEmailText: string,
) {
  const toAlias = normalizeEmail(message.to);
  const fromEmail = normalizeEmail(message.from);
  const fromName = extractName(message.headers.get("from") || message.from);
  const subject = clean(message.headers.get("subject")) || "(No subject)";
  const rule = getRule(toAlias);

  const contactId = await upsertContact(env, {
    fullName: fromName,
    email: fromEmail,
  });

  const attributionSessionId = crypto.randomUUID();
  const propertyContextId = crypto.randomUUID();
  const leadEventId = crypto.randomUUID();
  const routingDecisionId = crypto.randomUUID();

  const payload = {
    source: "inbound_email",
    intakeStatus: "incomplete_intake",
    fromEmail,
    fromName,
    toAlias,
    subject,
    messageId: clean(message.headers.get("message-id")),
    intentType: rule.intentType,
    workflowLane: rule.workflowLane,
    rawPreview: rawEmailText.slice(0, 4000),
  };

  await env.DB.batch([
    env.DB.prepare(
      `insert into attribution_sessions
        (id, contact_id, landing_page_url, referrer, utm_source, utm_medium, utm_campaign,
         device_category, screen_width, screen_height, user_agent)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attributionSessionId,
      contactId,
      null,
      null,
      null,
      null,
      null,
      "email",
      null,
      null,
      "inbound_email",
    ),
    env.DB.prepare(
      `insert into property_context
        (id, listing_id, source_listing_key, page_url, geo_context, source)
       values (?, ?, ?, ?, ?, ?)`,
    ).bind(
      propertyContextId,
      null,
      null,
      null,
      JSON.stringify({}),
      "inbound_email",
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
      "inbound_email",
      rule.intentType,
      rule.workflowLane,
      `Subject: ${subject}`,
      null,
      0,
      JSON.stringify(payload),
    ),
    env.DB.prepare(
      `insert into routing_decisions
        (id, contact_id, lead_event_id, workflow_lane, reason, status)
       values (?, ?, ?, ?, ?, ?)`,
    ).bind(
      routingDecisionId,
      contactId,
      leadEventId,
      rule.workflowLane,
      `Inbound email to ${toAlias} classified as ${rule.workflowLane}.`,
      "new",
    ),
  ]);

  return {
    contactId,
    leadEventId,
    workflowLane: rule.workflowLane,
  };
}

async function sendAutoReply(env: Env, message: ForwardableEmailMessage) {
  if (env.AUTO_REPLY_ENABLED !== "true") {
    return;
  }

  if (!env.EMAIL || shouldSkipAutoReply(message)) {
    return;
  }

  const from = env.AUTO_REPLY_FROM || DEFAULT_AUTO_REPLY_FROM;

  await env.EMAIL.send({
    to: message.from,
    from,
    subject: "Joel received your message",
    text:
      "Thanks — Joel received your message.\n\n" +
      "He’ll review it and follow up as soon as possible. If your message is about a specific home, search area, timeline, or price range, feel free to reply with any extra details.\n\n" +
      "— Robertson Real Estate\n" +
      "HomeInStGeorgeUtah.com",
    html:
      "<p>Thanks — Joel received your message.</p>" +
      "<p>He’ll review it and follow up as soon as possible. If your message is about a specific home, search area, timeline, or price range, feel free to reply with any extra details.</p>" +
      "<p>— Robertson Real Estate<br>HomeInStGeorgeUtah.com</p>",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedWorkflowLanes(env: Env) {
  const lanes = new Set<string>(CANONICAL_WORKFLOW_LANES);
  const additional = clean(env.ADDITIONAL_WORKFLOW_LANES);

  for (const lane of additional.split(",")) {
    const normalized = lane.trim();
    if (normalized && WORKFLOW_LANE_PATTERN.test(normalized)) {
      lanes.add(normalized);
    }
  }

  return lanes;
}

function isWorkflowLane(value: unknown, env: Env): value is string {
  return (
    typeof value === "string" &&
    WORKFLOW_LANE_PATTERN.test(value) &&
    allowedWorkflowLanes(env).has(value)
  );
}

function isOwnerLeadDelivery(
  value: unknown,
  env: Env,
): value is OwnerLeadDelivery {
  if (!isRecord(value) || value.event !== "owner.lead.received") return false;
  if (typeof value.to !== "string") return false;
  if (value.subject !== undefined && typeof value.subject !== "string")
    return false;
  if (!isRecord(value.lead)) return false;

  const lead = value.lead;
  if (typeof lead.eventId !== "string" || !clean(lead.eventId)) return false;
  if (typeof lead.contactId !== "string" || !clean(lead.contactId))
    return false;
  if (typeof lead.name !== "string") return false;
  if (typeof lead.email !== "string" || !clean(lead.email)) return false;
  if (!isWorkflowLane(lead.workflowLane, env)) return false;

  if (
    lead.phone !== undefined &&
    lead.phone !== null &&
    typeof lead.phone !== "string"
  ) {
    return false;
  }
  if (
    lead.message !== undefined &&
    lead.message !== null &&
    typeof lead.message !== "string"
  ) {
    return false;
  }
  if (
    lead.pageUrl !== undefined &&
    lead.pageUrl !== null &&
    typeof lead.pageUrl !== "string"
  ) {
    return false;
  }
  if (lead.context !== undefined && !isRecord(lead.context)) return false;

  return true;
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeSubject(value: unknown, workflowLane: string) {
  const subject = clean(value)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180);
  return subject || `New ${workflowLane.replaceAll("_", " ")} website request`;
}

function formatContext(context: Record<string, unknown> | undefined) {
  if (!context || Object.keys(context).length === 0) return "";

  try {
    return JSON.stringify(context, null, 2).slice(0, 4000);
  } catch {
    return "";
  }
}

function ownerNotificationBodies(payload: OwnerLeadDelivery) {
  const { lead } = payload;
  const context = formatContext(lead.context);
  const phone = clean(lead.phone) || "Not provided";
  const message = clean(lead.message) || "Not provided";
  const pageUrl = clean(lead.pageUrl) || "Not provided";
  const name = clean(lead.name) || "Website lead";

  const text = [
    "New HomeInStGeorgeUtah.com website request",
    "",
    `Lane: ${lead.workflowLane}`,
    `Name: ${name}`,
    `Email: ${clean(lead.email)}`,
    `Phone: ${phone}`,
    `Page: ${pageUrl}`,
    `Lead event: ${clean(lead.eventId)}`,
    `Contact ID: ${clean(lead.contactId)}`,
    "",
    "Message:",
    message,
    ...(context ? ["", "Context:", context] : []),
  ].join("\n");

  const html = [
    "<h2>New HomeInStGeorgeUtah.com website request</h2>",
    "<dl>",
    `<dt>Lane</dt><dd>${escapeHtml(lead.workflowLane)}</dd>`,
    `<dt>Name</dt><dd>${escapeHtml(name)}</dd>`,
    `<dt>Email</dt><dd>${escapeHtml(lead.email)}</dd>`,
    `<dt>Phone</dt><dd>${escapeHtml(phone)}</dd>`,
    `<dt>Page</dt><dd>${escapeHtml(pageUrl)}</dd>`,
    `<dt>Lead event</dt><dd>${escapeHtml(lead.eventId)}</dd>`,
    `<dt>Contact ID</dt><dd>${escapeHtml(lead.contactId)}</dd>`,
    "</dl>",
    "<h3>Message</h3>",
    `<p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
    ...(context
      ? ["<h3>Context</h3>", `<pre>${escapeHtml(context)}</pre>`]
      : []),
  ].join("");

  return { text, html };
}

function internalError(status: number, code: string, message: string) {
  return Response.json(
    { ok: false, error: { code, message } },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

async function handleOwnerLeadDelivery(request: Request, env: Env) {
  const url = new URL(request.url);

  if (
    url.hostname !== INTERNAL_DELIVERY_HOST ||
    url.pathname !== INTERNAL_DELIVERY_PATH
  ) {
    return internalError(
      404,
      "NOT_FOUND",
      "Internal delivery route not found.",
    );
  }

  if (request.method !== "POST") {
    return internalError(405, "METHOD_NOT_ALLOWED", "Use POST.");
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return internalError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Use application/json.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_INTERNAL_BODY_BYTES
  ) {
    return internalError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Notification payload is too large.",
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_INTERNAL_BODY_BYTES) {
    return internalError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Notification payload is too large.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return internalError(
      400,
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }

  if (!isOwnerLeadDelivery(parsed, env)) {
    return internalError(
      400,
      "INVALID_NOTIFICATION",
      "Owner notification payload is invalid.",
    );
  }

  const approvedRecipient = normalizeEmail(
    env.FORWARD_TO || DEFAULT_FORWARD_TO,
  );
  if (
    normalizeEmail(parsed.to) !== approvedRecipient ||
    approvedRecipient === "buyers@homeinstgeorgeutah.com"
  ) {
    return internalError(
      403,
      "RECIPIENT_NOT_APPROVED",
      "Recipient is not approved.",
    );
  }

  if (!env.OWNER_EMAIL) {
    return internalError(
      503,
      "OWNER_EMAIL_UNAVAILABLE",
      "Owner email delivery binding is unavailable.",
    );
  }

  const from = env.AUTO_REPLY_FROM || DEFAULT_AUTO_REPLY_FROM;
  const { text, html } = ownerNotificationBodies(parsed);

  try {
    const result = await env.OWNER_EMAIL.send({
      to: approvedRecipient,
      from,
      subject: safeSubject(parsed.subject, parsed.lead.workflowLane),
      text,
      html,
    });

    return new Response(null, {
      status: 202,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-message-id": result.messageId,
      },
    });
  } catch (error) {
    console.error("Failed to send owner lead notification", error);
    return internalError(
      502,
      "OWNER_EMAIL_SEND_FAILED",
      "Owner email delivery failed.",
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleOwnerLeadDelivery(request, env);
  },

  async email(
    message: ForwardableEmailMessage,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const forwardTo = env.FORWARD_TO || DEFAULT_FORWARD_TO;

    let rawEmailText = "";

    try {
      rawEmailText = await new Response(message.raw).text();
    } catch (error) {
      console.error("Failed to read raw inbound email", error);
    }

    try {
      await captureInboundEmail(env, message, rawEmailText);
    } catch (error) {
      console.error("Failed to capture inbound email lead", error);
    }

    await message.forward(forwardTo);

    try {
      await sendAutoReply(env, message);
    } catch (error) {
      console.error("Failed to send auto-reply", error);
    }
  },
} satisfies ExportedHandler<Env>;
