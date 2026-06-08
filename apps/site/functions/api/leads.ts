interface Env {
  LEAD_NOTIFY_EMAIL?: string;
}

type LeadPayload = {
  intent?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  pageUrl?: string;
  consent?: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let payload: LeadPayload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (!payload.email || !String(payload.email).includes("@")) {
    return json({ ok: false, error: "Valid email required" }, 400);
  }

  if (!payload.consent) {
    return json({ ok: false, error: "Consent required" }, 400);
  }

  const lead = {
    intent: payload.intent || "general",
    name: payload.name || "",
    email: payload.email,
    phone: payload.phone || "",
    message: payload.message || "",
    pageUrl: payload.pageUrl || "",
    consent: payload.consent === true,
    receivedAt: new Date().toISOString(),
  };

  console.log("lead", JSON.stringify(lead));

  return json({
    ok: true,
    message: "Lead received",
  });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "POST, OPTIONS",
    },
  });
};
