import { motion } from "motion/react";
import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type LeadFormVariant =
  | "general"
  | "valuation"
  | "relocation"
  | "property_inquiry"
  | "showing_request";

const allowedIntents = new Set([
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
]);

const allowedVariants = new Set([
  "general",
  "valuation",
  "relocation",
  "property_inquiry",
  "showing_request",
]);

export default function LeadFormIsland({
  intent = "general_contact",
  variant = "general",
}: {
  intent?: string;
  variant?: LeadFormVariant;
}) {
  const [status, setStatus] = useState<Status>("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
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

    const requestedIntent = searchParams.get("intent") || "";
    const requestedVariant = searchParams.get("form") || "";
    const effectiveIntent = allowedIntents.has(requestedIntent)
      ? requestedIntent
      : intent;
    const effectiveVariant = allowedVariants.has(requestedVariant)
      ? (requestedVariant as LeadFormVariant)
      : variant;

    const listingId = get("listingId");
    const sourceListingKey = get("sourceListingKey");

    try {
      const response = await fetch("/api/v1/leads/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: effectiveIntent,
          workflowLane: effectiveIntent,
          formVariant: effectiveVariant,
          name: formData.get("name"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          message: formData.get("message"),
          pageUrl: window.location.href,
          referrer: document.referrer,
          consent: formData.get("consent") === "on",
          listingId: listingId || undefined,
          sourceListingKey: sourceListingKey || undefined,
          details: {
            propertyAddress: get("propertyAddress"),
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
      if (!response.ok) throw new Error("Lead request failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      onSubmit={submit}
      className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-900/5"
    >
      <div className="grid gap-4">
        <input
          className="rounded-2xl border border-stone-200 px-4 py-3"
          name="name"
          placeholder="Name"
          required
        />
        <input
          className="rounded-2xl border border-stone-200 px-4 py-3"
          name="email"
          placeholder="Email"
          type="email"
          required
        />
        <input
          className="rounded-2xl border border-stone-200 px-4 py-3"
          name="phone"
          placeholder="Phone"
        />

        {variant === "valuation" && (
          <>
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="currentAddress"
              placeholder="Property address"
            />
            <select
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="sellingTimeline"
            >
              <option value="">Selling timeline</option>
              <option value="now">Now</option>
              <option value="30_90_days">30–90 days</option>
              <option value="3_6_months">3–6 months</option>
              <option value="researching">Researching</option>
            </select>
          </>
        )}

        {variant === "relocation" && (
          <>
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="movingFrom"
              placeholder="Where are you moving from?"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="moveTimeline"
              placeholder="Target move timeline"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="preferredAreas"
              placeholder="Preferred areas or communities"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="buyerBudget"
              placeholder="Target budget"
            />
          </>
        )}

        {variant === "property_inquiry" && (
          <>
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="propertyAddress"
              placeholder="Property address or MLS number"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="listingId"
              placeholder="Listing ID, if available"
            />
            <textarea
              className="min-h-24 rounded-2xl border border-stone-200 px-4 py-3"
              name="propertyQuestion"
              placeholder="What would you like to know about this property?"
            />
          </>
        )}

        {variant === "showing_request" && (
          <>
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="propertyAddress"
              placeholder="Property address or MLS number"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="listingId"
              placeholder="Listing ID, if available"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="showingDate"
              type="date"
            />
            <input
              className="rounded-2xl border border-stone-200 px-4 py-3"
              name="showingTime"
              placeholder="Preferred time"
            />
          </>
        )}

        <textarea
          className="min-h-32 rounded-2xl border border-stone-200 px-4 py-3"
          name="message"
          placeholder="How can we help?"
        />
        <label className="flex gap-3 text-sm text-stone-600">
          <input name="consent" type="checkbox" className="mt-1" required />I
          agree to be contacted about my real estate request.
        </label>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-stone-950 px-6 py-3 font-semibold text-white disabled:opacity-60"
        >
          {status === "submitting" ? "Sending..." : "Send request"}
        </button>
        {status === "success" && (
          <p className="text-sm font-medium text-green-700">Request sent.</p>
        )}
        {status === "error" && (
          <p className="text-sm font-medium text-red-700">
            Something failed. Try again or call directly.
          </p>
        )}
      </div>
    </motion.form>
  );
}
