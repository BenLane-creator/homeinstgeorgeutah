export interface Env {
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

const providerMeta = {
	provider: "Washington County BOR - IDX",
	source: "Spark® / RESO Web API",
	compliance: [
		"Display only MLS fields approved by IDX/Web API agreement.",
		"Do not scrape, cache, or copy MLS content outside permitted API rules.",
		"Listing availability, attribution, update timestamps, and disclaimers must be handled before production launch.",
	],
};

function json(payload: ApiResponse, init: ResponseInit = {}) {
	return new Response(JSON.stringify(payload, null, 2), {
		...init,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "GET,POST,OPTIONS",
			"access-control-allow-headers": "content-type,authorization",
			...init.headers,
		},
	});
}

function notFound(pathname: string) {
	return json(
		{
			ok: false,
			error: {
				code: "NOT_FOUND",
				message: `No API route exists for ${pathname}`,
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		},
		{ status: 404 },
	);
}

function badRequest(message: string) {
	return json(
		{
			ok: false,
			error: {
				code: "BAD_REQUEST",
				message,
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		},
		{ status: 400 },
	);
}

function upstreamError(message: string) {
	return json(
		{
			ok: false,
			error: {
				code: "MLS_UPSTREAM_ERROR",
				message,
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		},
		{ status: 502 },
	);
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

async function handleHealth() {
	return json({
		ok: true,
		data: {
			service: "homeinstgeorgeutah-api",
			status: "ok",
			routes: ["/api/search", "/api/listings/:id", "/api/leads"],
		},
		meta: {
			...providerMeta,
			generatedAt: new Date().toISOString(),
		},
	});
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
		return json({
			ok: true,
			data: {
				mode: "stub",
				message:
					"MLS search endpoint is wired, but Spark® / RESO credentials are not configured yet.",
				query: params,
				results: [],
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		});
	}

	return json({
		ok: true,
		data: {
			mode: "live",
			query: params,
			result: liveResult,
		},
		meta: {
			...providerMeta,
			generatedAt: new Date().toISOString(),
		},
	});
}

async function handleListingDetail(
	_request: Request,
	env: Env,
	listingId: string,
) {
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
		return json({
			ok: true,
			data: {
				mode: "stub",
				message:
					"Listing detail endpoint is wired, but Spark® / RESO credentials are not configured yet.",
				listingId,
				listing: null,
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		});
	}

	return json({
		ok: true,
		data: {
			mode: "live",
			listingId,
			result: liveResult,
		},
		meta: {
			...providerMeta,
			generatedAt: new Date().toISOString(),
		},
	});
}

async function handleLead(request: Request, env: Env) {
	if (request.method !== "POST") {
		return json(
			{
				ok: false,
				error: {
					code: "METHOD_NOT_ALLOWED",
					message: "Use POST for /api/leads.",
				},
				meta: {
					...providerMeta,
					generatedAt: new Date().toISOString(),
				},
			},
			{ status: 405 },
		);
	}

	let body: Record<string, unknown>;

	try {
		body = await request.json();
	} catch {
		return badRequest("Invalid JSON body.");
	}

	const name = String(body.name || "").trim();
	const email = String(body.email || "").trim();
	const phone = String(body.phone || "").trim();
	const message = String(body.message || "").trim();
	const intent = String(body.intent || "general").trim();
	const pageUrl = String(body.pageUrl || body.sourcePath || "").trim();
	const listingId = String(body.listingId || "").trim();
	const consent = body.consent === true;

	if (!name || !email?.includes("@")) {
		return badRequest("Name and a valid email are required.");
	}

	if (!consent) {
		return badRequest("Consent is required before capturing a lead.");
	}

	const lead = {
		id: crypto.randomUUID(),
		intent,
		name,
		email,
		phone,
		message,
		pageUrl,
		listingId,
		consent,
		createdAt: new Date().toISOString(),
	};

	if (env.LEADS_KV) {
		await env.LEADS_KV.put(`lead:${lead.id}`, JSON.stringify(lead));
	}

	return json(
		{
			ok: true,
			data: {
				mode: env.LEADS_KV ? "stored" : "stub",
				message: env.LEADS_KV
					? "Lead captured."
					: "Lead endpoint is wired. Bind LEADS_KV or add email/CRM delivery before production.",
				lead,
			},
			meta: {
				...providerMeta,
				generatedAt: new Date().toISOString(),
			},
		},
		{ status: 201 },
	);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === "OPTIONS") {
			return json({
				ok: true,
				meta: { generatedAt: new Date().toISOString() },
			});
		}

		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\/$/, "") || "/";

		if (pathname === "/" || pathname === "/api" || pathname === "/api/health") {
			return handleHealth();
		}

		if (pathname === "/api/search") {
			return handleSearch(request, env);
		}

		if (pathname.startsWith("/api/listings/")) {
			const listingId = decodeURIComponent(
				pathname.replace("/api/listings/", ""),
			);
			return handleListingDetail(request, env, listingId);
		}

		if (pathname === "/api/leads") {
			return handleLead(request, env);
		}

		if (pathname === "/api/mls-status") {
			return json({
				ok: true,
				data: {
					configured: Boolean(env.SPARK_API_BASE_URL && env.SPARK_ACCESS_TOKEN),
					requiredEnv: ["SPARK_API_BASE_URL", "SPARK_ACCESS_TOKEN"],
					optionalBindings: ["LEADS_KV"],
				},
				meta: {
					...providerMeta,
					generatedAt: new Date().toISOString(),
				},
			});
		}

		return notFound(url.pathname);
	},
};
