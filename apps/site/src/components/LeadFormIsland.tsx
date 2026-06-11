import { motion } from "motion/react";
import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function LeadFormIsland({
  intent = "general_contact",
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
      const response = await fetch("/api/leads", {
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
      className="rounded-[1.75rem] border border-[#e3d8ca] bg-white/88 p-6 shadow-[0_18px_50px_rgba(28,25,23,0.10)] backdrop-blur"
    >
      <div className="grid gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7A8B75]">
            Contact Joel
          </p>
          <h3 className="mt-2 font-serif text-3xl font-semibold text-[#1c1917]">
            Start the conversation.
          </h3>
        </div>

        <input
          className="min-h-12 rounded-2xl border border-[#d8c8b8] bg-[#fffaf3] px-4 py-3 text-[#1c1917] placeholder:text-[#6f665d]"
          name="name"
          placeholder="Name"
          required
        />
        <input
          className="min-h-12 rounded-2xl border border-[#d8c8b8] bg-[#fffaf3] px-4 py-3 text-[#1c1917] placeholder:text-[#6f665d]"
          name="email"
          placeholder="Email"
          type="email"
          required
        />
        <input
          className="min-h-12 rounded-2xl border border-[#d8c8b8] bg-[#fffaf3] px-4 py-3 text-[#1c1917] placeholder:text-[#6f665d]"
          name="phone"
          placeholder="Phone"
        />
        <textarea
          className="min-h-32 rounded-2xl border border-[#d8c8b8] bg-[#fffaf3] px-4 py-3 text-[#1c1917] placeholder:text-[#6f665d]"
          name="message"
          placeholder="How can we help?"
        />
        <label className="flex gap-3 text-sm leading-6 text-[#4f4942]">
          <input
            name="consent"
            type="checkbox"
            className="mt-1 accent-[#7A8B75]"
            required
          />
          I agree to be contacted about my real estate request.
        </label>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="min-h-12 rounded-full bg-[#1c1917] px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white disabled:opacity-60"
        >
          {status === "submitting" ? "Sending..." : "Send request"}
        </button>
        {status === "success" && (
          <p className="text-sm font-medium text-[#4d6b44]">Request sent.</p>
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
