import { readFileSync } from "node:fs";

const [workerName, workersPath] = process.argv.slice(2);
if (!workerName || !workersPath) {
  throw new Error("Usage: bun scripts/verify-worker-bootstrap-state.mjs <worker-name> <workers-json>.");
}

const payload = JSON.parse(readFileSync(workersPath, "utf8"));
if (payload?.success !== true || !Array.isArray(payload.result)) {
  throw new Error("Cloudflare Worker list response is invalid.");
}

const matches = payload.result.filter((worker) => worker?.id === workerName);
if (matches.length > 1) {
  throw new Error(`Cloudflare returned duplicate Worker records for ${workerName}.`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      worker: workerName,
      exists: matches.length === 1,
      visibleWorkerCount: payload.result.length,
    },
    null,
    2,
  ),
);
