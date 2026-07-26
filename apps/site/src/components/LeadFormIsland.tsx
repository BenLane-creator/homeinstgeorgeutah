import { site } from "@home/config/site";
import { motion } from "motion/react";
import { useRef, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type LeadFormVariant =
  | "general"
  | "valuation"
  | "relocation"
  | "property_inquiry"
  | "showing_request";

type ApiResponse = {
  ok?: boolean;
  error?: {
    message?: string;
  };
};

const inputClassName =
  "min-h-12 w-full border border-stone-300 bg-white px-4 py-3 text-base text-[var(--brand-ink)] outline-none transition placeholder:text-stone-400 focus:border-[var(--brand-gold)] focus:ring-2 focus:ring-[var(--brand-gold)]/20";

const labelClassName =
  "grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600";

export default function LeadFormIsland({
  intent = "general_contact",
  variant = "general",
}: {
  intent?: string;
  variant?: LeadFormVariant;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState("");
  const submissionIdRef = useRef<string | null>(null);
  const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as
    | string
    | undefined;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setFeedback("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const get = (name: string) => String(formData.get(name) || "").trim();

    const searchParams = new URLSearchParams(window.location.search);
    const screenWidth = String(window.screen?.width || window.innerWidth || "");
    const screenHeight = String(
      window.screen?.height || window.innerHeight || "",
    );
    const deviceCategory = window.matchMedia("(pointer: coarse)").matches
      ? window.innerWidth >= 768
        ? "tablet"
        : "mobile"
      : "desktop";

    const listingId = get("listingId") || searchParams.get("listingId") || "";
    const sourceListingKey =
      get("sourceListingKey") || searchParams.get("sourceListingKey") || "";
    const propertyAddress =
      get("propertyAddress") || searchParams.get("propertyAddress") || "";
    const submissionId = submissionIdRef.current || crypto.randomUUID();
    submissionIdRef.current = submissionId;

    try {
      const response = await fetch("/api/v1/leads/intake", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": submissionId,
        },
        body: JSON.stringify({
          intent,
          workflowLane: intent,
          formVariant: variant,
          name: get("name"),
          email: get("email"),
          phone: get("phone"),
          message: get("message"),
          pageUrl: window.location.href,
          referrer: document.referrer,
          consent: formData.get("consent") === "on",
          turnstileToken: get("cf-turnstile-response"),
          listingId: listingId || undefined,
          sourceListingKey: sourceListingKey || undefined,
          details: {
            propertyAddress,
            targetPriceRange: get("targetPriceRange"),
            currentAddress: get("currentAddress"),
            sellingTimeline: get("sellingTimeline"),
            movingFrom: get("movingFrom"),
            moveTimeline: get("moveTimeline"),
            preferredAreas: get("preferredAreas"),
            buyerBudget: get("buyerBudget"),
            propertyQuestion: get("propertyQuestion"),
            showingDate: get("showingDate"),
            showingTime: get("showingTime"),
          },
          attribution: {
            source: searchParams.get("utm_source") || "",
            medium: searchParams.get("utm_medium") || "",
            campaign: searchParams.get("utm_campaign") || "",
          },
          device: {
            category: deviceCategory,
            screenWidth,
            screenHeight,
            language: navigator.language || "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.error?.message ||
            "We could not send your request. Please try again.",
        );
      }

      submissionIdRef.current = null;
      setStatus("success");
      setFeedback(
        "Your request was received. Joel will follow up using the contact information you provided.",
      );
      form.reset();
    } catch {
      setStatus("error");
      setFeedback(
        "We could not send your request. Please try again or call Joel directly.",
      );
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      onSubmit={submit}
      className="border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5 sm:p-8"
      aria-describedby="lead-form-status"
    >
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
          Direct inquiry
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-[var(--brand-ink)]">
          Tell Joel what you need.
        </h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Required fields are marked with an asterisk.
        </p>
      </div>

      <div className="grid gap-5">
        <label className={labelClassName}>
          Name *
          <input
            className={inputClassName}
            name="name"
            autoComplete="name"
            required
          />
        </label>

        <label className={labelClassName}>
          Email *
          <input
            className={inputClassName}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        <label className={labelClassName}>
          Phone
          <input
            className={inputClassName}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
        </label>

        {variant === "valuation" && (
          <>
            <label className={labelClassName}>
              Property address
              <input
                className={inputClassName}
                name="currentAddress"
                autoComplete="street-address"
              />
            </label>

            <label className={labelClassName}>
              Selling timeline
              <select className={inputClassName} name="sellingTimeline">
                <option value="">Select a timeline</option>
                <option value="now">Now</option>
                <option value="30_90_days">30–90 days</option>
                <option value="3_6_months">3–6 months</option>
                <option value="researching">Researching</option>
              </select>
            </label>
          </>
        )}

        {variant === "relocation" && (
          <>
            <label className={labelClassName}>
              Moving from
              <input className={inputClassName} name="movingFrom" />
            </label>

            <label className={labelClassName}>
              Target move timeline
              <input className={inputClassName} name="moveTimeline" />
            </label>

            <label className={labelClassName}>
              Preferred areas or communities
              <input className={inputClassName} name="preferredAreas" />
            </label>

            <label className={labelClassName}>
              Target budget
              <input
                className={inputClassName}
                name="buyerBudget"
                inputMode="numeric"
              />
            </label>
          </>
        )}

        {(variant === "property_inquiry" || variant === "showing_request") && (
          <>
            <label className={labelClassName}>
              Property address or MLS number
              <input className={inputClassName} name="propertyAddress" />
            </label>

            <label className={labelClassName}>
              Listing ID
              <input className={inputClassName} name="listingId" />
            </label>
          </>
        )}

        {variant === "property_inquiry" && (
          <label className={labelClassName}>
            Property question
            <textarea
              className={`${inputClassName} min-h-28 resize-y`}
              name="propertyQuestion"
            />
          </label>
        )}

        {variant === "showing_request" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClassName}>
              Preferred date
              <input
                className={inputClassName}
                name="showingDate"
                type="date"
              />
            </label>

            <label className={labelClassName}>
              Preferred time
              <input className={inputClassName} name="showingTime" />
            </label>
          </div>
        )}

        <label className={labelClassName}>
          How can Joel help?
          <textarea
            className={`${inputClassName} min-h-32 resize-y`}
            name="message"
          />
        </label>

        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-stone-700">
          <input
            name="consent"
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
            required
          />
          <span>I agree to be contacted about my real estate request. *</span>
        </label>

        {turnstileSiteKey && (
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-theme="light"
          />
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="min-h-14 bg-[var(--brand-ink)] px-6 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[var(--brand-deep-olive)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-gold)]"
        >
          {status === "submitting" ? "Sending request…" : "Send request"}
        </button>

        <div
          id="lead-form-status"
          aria-live="polite"
          role={status === "error" ? "alert" : "status"}
          className={
            status === "success"
              ? "border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium leading-6 text-green-800"
              : status === "error"
                ? "border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-800"
                : "sr-only"
          }
        >
          {feedback}
        </div>

        {status === "error" && (
          <a
            href={site.phoneHref}
            className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-[var(--brand-ink)] underline decoration-[var(--brand-gold)] underline-offset-4"
          >
            Call Joel at {site.phone}
          </a>
        )}
      </div>
    </motion.form>
  );
}
