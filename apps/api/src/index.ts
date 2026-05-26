import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
	DB?: D1Database;
	SPARK_API_BASE_URL?: string;
	SPARK_ACCESS_TOKEN?: string;
	LEADS_KV?: KVNamespace;
}

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

type ApiResponse = {
	ok: boolean;
	data?: JsonValue;
	error?: {
		code: string;
		message: string;
	};
	meta?: {
		provider?: string;
		source?: string;
		compliance?: string[];
		generatedAt: string;
	};
};

type LeadIntakePayload = {
	intent?: string;
	eventType?: string;
	name?: string;
	email?: string;
	phone?: string;
	message?: string;
	pageUrl?: string;
	sourcePath?: string;
	landingUrl?: string;
	referrer?: string;
	listingId?: string;
	propertyUrl?: string;
	city?: string;
	neighborhood?: string;
	addressSummary?: string;
	price?: string | number;
	consent?: boolean;
	utm?: {
		source?: string;
		medium?: string;
		campaign?: string;
		term?: string;
		content?: string;
	};
};

const providerMeta = {
	provider: "Washington County BOR - IDX",
	source: "Spark® / RESO Web API",
	compliance: [
		"Display only MLS fields approved by IDX/Web API agreement.",
		"Do not scrape, cache, or copy MLS content outside permitted API rules.",
		"Listing availability, attribution, update timestamps, and disclaimers must be handled before production launch.",
	],
};

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["content-type", "authorization"],
	}),
);

function apiJson(payload: ApiResponse, status = 200) {
	return new Response(JSON.stringify(payload, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});
}

function meta() {
	return {
		...providerMeta,
		generatedAt: new Date().toISOString(),
	};
}

function ok(data: JsonValue, status = 200) {
	return apiJson(
		{
			ok: true,
			data,
			meta: meta(),
		},
		status,
	);
}

function badRequest(message: string) {
	return apiJson(
		{
			ok: false,
			error: {
				code: "BAD_REQUEST",
				message,
			},
			meta: meta(),
		},
		400,
	);
}

function notFound(pathname: string) {
	return apiJson(
		{
			ok: false,
			error: {
				code: "NOT_FOUND",
				message: `No API route exists for ${pathname}`,
			},
			meta: meta(),
		},
		404,
	);
}

function upstreamError(message: string) {
	return apiJson(
		{
			ok: false,
			error: {
				code: "MLS_UPSTREAM_ERROR",
				message,
			},
			meta: meta(),
		},
		502,
	);
}

function serverError(message: string) {
	return apiJson(
		{
			ok: false,
			error: {
				code: "SERVER_ERROR",
				message,
			},
			meta: meta(),
		},
		500,
	);
}

function textValue(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
	const text = textValue(value);
	return text.length > 0 ? text : null;
}

function boundedPositiveInt(
	value: string | undefined,
	fallback: number,
	max: number,
) {
	const parsed = Number(value);

	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function sanitizeSearchParams(url: URL) {
	const allowed = new Set([
		"q",
		"city",
		"neighborhood",
		"minPrice",
		"maxPrice",
		"beds",
		"baths",
		"propertyType",
		"status",
		"page",
		"limit",
	]);

	const params: Record<string, string> = {};

	for (const [key, value] of url.searchParams.entries()) {
		if (allowed.has(key)) {
			params[key] = value.trim();
		}
	}

	const limit = boundedPositiveInt(params.limit, 12, 50);
	const page = boundedPositiveInt(params.page, 1, 10_000);

	return {
		...params,
		limit: String(limit),
		page: String(page),
	};
}

async function callSparkReso(
	env: Env,
	path: string,
	params?: Record<string, string>,
) {
	if (!env.SPARK_API_BASE_URL || !env.SPARK_ACCESS_TOKEN) {
		return null;
	}

	const base = env.SPARK_API_BASE_URL.replace(/\/$/, "");
	const url = new URL(`${base}${path}`);

	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}

	const response = await fetch(url.toString(), {
		headers: {
			authorization: `Bearer ${env.SPARK_ACCESS_TOKEN}`,
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Spark/RESO request failed with ${response.status}`);
	}

	return response.json();
}

function splitName(fullName: string) {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	const firstName = parts[0] || "";
	const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

	return { firstName, lastName };
}

function classifyWorkflowLane(payload: LeadIntakePayload) {
	const intent = textValue(payload.intent || payload.eventType).toLowerCase();
	const message = textValue(payload.message).toLowerCase();
	const listingId = textValue(payload.listingId);

	if (intent.includes("valuation") || intent.includes("seller")) {
		return {
			workflowLane: intent.includes("valuation")
				? "valuation"
				: "seller_high_priority",
			reason: "Seller or valuation intent detected.",
		};
	}

	if (intent.includes("showing")) {
		return {
			workflowLane: "showing_request",
			reason: "Showing request intent detected.",
		};
	}

	if (intent.includes("relocation") || message.includes("relocat")) {
		return {
			workflowLane: "relocation",
			reason: "Relocation intent detected.",
		};
	}

	if (listingId || intent.includes("property")) {
		return {
			workflowLane: "property_inquiry",
			reason: "Property context or property inquiry intent detected.",
		};
	}

	if (intent.includes("consult") || intent.includes("book")) {
		return {
			workflowLane: "booked_consult",
			reason: "Consultation or booking intent detected.",
		};
	}

	if (intent.includes("search") || intent.includes("buyer")) {
		return {
			workflowLane: "buyer_active_search",
			reason: "Buyer/search intent detected.",
		};
	}

	return {
		workflowLane: "general_contact",
		reason: "Default general contact routing.",
	};
}

function shouldCreateBookingHandoff(workflowLane: string) {
	return [
		"seller_high_priority",
		"valuation",
		"showing_request",
		"booked_consult",
		"relocation",
	].includes(workflowLane);
}

async function handleSearch(request: Request, env: Env) {
	const url = new URL(request.url);
	const params = sanitizeSearchParams(url);

	let liveResult: JsonValue | null;

	try {
		liveResult = (await callSparkReso(
			env,
			"/Property",
			params,
		)) as JsonValue | null;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown Spark/RESO error";
		return upstreamError(message);
	}

	if (!liveResult) {
		return ok({
			mode: "stub",
			message:
				"MLS search endpoint is wired, but Spark® / RESO credentials are not configured yet.",
			query: params,
			results: [],
		});
	}

	return ok({
		mode: "live",
		query: params,
		result: liveResult,
	});
}

async function handleListingDetail(env: Env, listingId: string) {
	if (!listingId) {
		return badRequest("Missing listing id.");
	}

	let liveResult: JsonValue | null;

	try {
		liveResult = (await callSparkReso(
			env,
			`/Property('${encodeURIComponent(listingId)}')`,
		)) as JsonValue | null;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown Spark/RESO error";
		return upstreamError(message);
	}

	if (!liveResult) {
		return ok({
			mode: "stub",
			message:
				"Listing detail endpoint is wired, but Spark® / RESO credentials are not configured yet.",
			listingId,
			listing: null,
		});
	}

	return ok({
		mode: "live",
		listingId,
		result: liveResult,
	});
}

async function handleLeadIntake(request: Request, env: Env) {
	let body: LeadIntakePayload;

	try {
		body = (await request.json()) as LeadIntakePayload;
	} catch {
		return badRequest("Invalid JSON body.");
	}

	const fullName = textValue(body.name);
	const email = textValue(body.email).toLowerCase();
	const phone = textValue(body.phone);
	const message = textValue(body.message);
	const intent = textValue(body.intent || body.eventType || "general_contact");
	const pageUrl = textValue(body.pageUrl || body.sourcePath || body.landingUrl);
	const consent = body.consent === true;

	if (!fullName) {
		return badRequest("Name is required.");
	}

	if (!email.includes("@") && !phone) {
		return badRequest("A valid email or phone is required.");
	}

	if (!consent) {
		return badRequest("Consent is required before capturing a lead.");
	}

	const now = new Date().toISOString();
	let contactId: string = crypto.randomUUID();
	const attributionSessionId = crypto.randomUUID();
	const propertyContextId = crypto.randomUUID();
	const leadEventId = crypto.randomUUID();
	const routingDecisionId = crypto.randomUUID();
	const crmSyncJobId = crypto.randomUUID();
	const bookingHandoffId = crypto.randomUUID();
	const { firstName, lastName } = splitName(fullName);
	const { workflowLane, reason } = classifyWorkflowLane(body);
	const bookingEligible = shouldCreateBookingHandoff(workflowLane);
	const eventType = textValue(body.eventType || "lead_intake");
	const rawPayloadJson = JSON.stringify(body);

	if (!env.DB) {
		const lead = {
			id: leadEventId,
			contactId,
			intent,
			eventType,
			name: fullName,
			email,
			phone,
			message,
			pageUrl,
			listingId: textValue(body.listingId),
			consent,
			workflowLane,
			createdAt: now,
		};

		if (env.LEADS_KV) {
			await env.LEADS_KV.put(`lead:${lead.id}`, JSON.stringify(lead));
		}

		return ok(
			{
				mode: env.LEADS_KV ? "kv_fallback" : "stub",
				message:
					"D1 binding is not configured yet. Lead intake contract is wired but canonical D1 storage is unavailable.",
				lead,
			},
			201,
		);
	}

	if (email) {
		const existingContact = await env.DB.prepare(
			"SELECT id FROM contacts WHERE email = ? LIMIT 1",
		)
			.bind(email)
			.first<{ id: string }>();

		if (existingContact?.id) {
			contactId = existingContact.id;
		}
	}

	try {
		await env.DB.batch([
			env.DB.prepare(
				`INSERT OR IGNORE INTO contacts (
					id, email, phone, first_name, last_name, full_name, source, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				contactId,
				email || null,
				phone || null,
				firstName || null,
				lastName || null,
				fullName,
				"website",
				now,
				now,
			),
			env.DB.prepare(
				`INSERT INTO attribution_sessions (
					id, contact_id, landing_url, referrer, utm_source, utm_medium,
					utm_campaign, utm_term, utm_content, user_agent, ip_hash, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				attributionSessionId,
				contactId,
				pageUrl || null,
				optionalText(body.referrer),
				optionalText(body.utm?.source),
				optionalText(body.utm?.medium),
				optionalText(body.utm?.campaign),
				optionalText(body.utm?.term),
				optionalText(body.utm?.content),
				request.headers.get("user-agent"),
				null,
				now,
			),
			env.DB.prepare(
				`INSERT INTO property_context (
					id, listing_id, property_url, city, neighborhood, address_summary, price, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				propertyContextId,
				optionalText(body.listingId),
				optionalText(body.propertyUrl || body.pageUrl),
				optionalText(body.city),
				optionalText(body.neighborhood),
				optionalText(body.addressSummary),
				body.price === undefined ? null : String(body.price),
				now,
			),
			env.DB.prepare(
				`INSERT INTO lead_events (
					id, contact_id, attribution_session_id, property_context_id,
					event_type, intent, message, raw_payload_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				leadEventId,
				contactId,
				attributionSessionId,
				propertyContextId,
				eventType,
				intent,
				message || null,
				rawPayloadJson,
				now,
			),
			env.DB.prepare(
				`INSERT INTO routing_decisions (
					id, lead_event_id, contact_id, workflow_lane, reason, created_at
				) VALUES (?, ?, ?, ?, ?, ?)`,
			).bind(
				routingDecisionId,
				leadEventId,
				contactId,
				workflowLane,
				reason,
				now,
			),
			env.DB.prepare(
				`INSERT INTO crm_sync_jobs (
					id, lead_event_id, contact_id, status, attempt_count, last_error, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				crmSyncJobId,
				leadEventId,
				contactId,
				"pending",
				0,
				null,
				now,
				now,
			),
			env.DB.prepare(
				`INSERT INTO booking_handoffs (
					id, lead_event_id, contact_id, eligible, reason, booking_url, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				bookingHandoffId,
				leadEventId,
				contactId,
				bookingEligible ? 1 : 0,
				bookingEligible
					? `Eligible for booking handoff through ${workflowLane}.`
					: `Not booking-eligible for ${workflowLane}.`,
				null,
				now,
			),
		]);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown D1 lead intake error";
		return serverError(message);
	}

	return ok(
		{
			mode: "stored",
			contactId,
			leadEventId,
			attributionSessionId,
			propertyContextId,
			routingDecisionId,
			crmSyncJobId,
			bookingHandoffId,
			workflowLane,
			bookingEligible,
		},
		201,
	);
}

app.get("/", (_c) =>
	ok({
		service: "homeinstgeorgeutah-api",
		status: "ok",
		routes: [
			"/api/health",
			"/api/mls-status",
			"/api/search",
			"/api/listings/:id",
			"/api/leads",
			"/api/v1/leads/intake",
		],
	}),
);

app.get("/api", (c) =>
	c.json({
		ok: true,
		data: {
			service: "homeinstgeorgeutah-api",
			status: "ok",
			routes: [
				"/api/health",
				"/api/mls-status",
				"/api/search",
				"/api/listings/:id",
				"/api/leads",
				"/api/v1/leads/intake",
			],
		},
		meta: meta(),
	}),
);

app.get("/api/health", (c) =>
	c.json({
		ok: true,
		data: {
			service: "homeinstgeorgeutah-api",
			status: "ok",
			routes: [
				"/api/search",
				"/api/listings/:id",
				"/api/leads",
				"/api/v1/leads/intake",
			],
		},
		meta: meta(),
	}),
);

app.get("/api/mls-status", (c) =>
	c.json({
		ok: true,
		data: {
			configured: Boolean(c.env.SPARK_API_BASE_URL && c.env.SPARK_ACCESS_TOKEN),
			requiredEnv: ["SPARK_API_BASE_URL", "SPARK_ACCESS_TOKEN"],
			optionalBindings: ["DB", "LEADS_KV"],
		},
		meta: meta(),
	}),
);

app.get("/api/search", async (c) => handleSearch(c.req.raw, c.env));

app.get("/api/listings/:id", async (c) => {
	const listingId = decodeURIComponent(c.req.param("id"));
	return handleListingDetail(c.env, listingId);
});

app.post("/api/leads", async (c) => handleLeadIntake(c.req.raw, c.env));

app.post("/api/v1/leads/intake", async (c) =>
	handleLeadIntake(c.req.raw, c.env),
);

app.notFound((c) => notFound(new URL(c.req.url).pathname));

export default app;
