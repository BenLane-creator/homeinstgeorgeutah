import { motion } from "motion/react";
import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function LeadFormIsland({
  intent = "general",
}: {
  intent?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/v1/leads/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent,
          name: formData.get("name"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          message: formData.get("message"),
          pageUrl: window.location.href,
          consent: formData.get("consent") === "on",
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
