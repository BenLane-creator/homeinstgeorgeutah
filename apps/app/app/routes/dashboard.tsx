export function meta() {
  return [{ title: "HomeInStGeorge Dashboard" }];
}

export default function Dashboard() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-900/70">App zone</p>
      <h1 className="mt-4 font-serif text-5xl font-semibold">Dashboard</h1>
      <p className="mt-4 max-w-2xl text-stone-700">
        Use this area later for authenticated lead review, client portal, saved-search augmentation, or internal tools. Do not bypass the local account model; link to Spark/Flex identity only where VOW or authenticated MLS access requires it.
      </p>
    </main>
  );
}
