import { readFileSync } from "node:fs";

const [releaseSha, pagesPath, versionsPath, deploymentPath] = process.argv.slice(2);
if (!releaseSha || !pagesPath || !versionsPath || !deploymentPath) {
  throw new Error(
    "Usage: bun scripts/verify-production-deployment.mjs <sha> <pages.json> <versions.json> <deployment.json>",
  );
}
if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error("Release SHA must be a full lowercase 40-character commit SHA.");
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const pages = readJson(pagesPath);
const versions = readJson(versionsPath);
const deployment = readJson(deploymentPath);

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  if (value && typeof value === "object") {
    visitor(value);
    for (const child of Object.values(value)) walk(child, visitor);
  }
}

let pagesMatch = false;
walk(pages, (record) => {
  const trigger = record.deployment_trigger ?? record.deploymentTrigger;
  const metadata = trigger?.metadata ?? record.metadata;
  const commitHash = metadata?.commit_hash ?? metadata?.commitHash;
  const environment = record.environment;
  if (commitHash === releaseSha && (!environment || environment === "production")) {
    pagesMatch = true;
  }
});
if (!pagesMatch) {
  throw new Error(`No production Pages deployment is attached to ${releaseSha}.`);
}

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
let workerVersionId = "";
walk(versions, (record) => {
  if (workerVersionId) return;
  const recordText = JSON.stringify(record);
  if (!recordText.includes(releaseSha)) return;
  const explicitId = record.id ?? record.version_id ?? record.versionId;
  const inferredId = recordText.match(uuidPattern)?.[0];
  workerVersionId = String(explicitId || inferredId || "");
});
if (!workerVersionId) {
  throw new Error(`The Worker version inventory has no version tagged with ${releaseSha}.`);
}

const deploymentText = JSON.stringify(deployment);
if (!deploymentText.includes(workerVersionId)) {
  throw new Error(
    `The active Worker deployment does not reference SHA-tagged version ${workerVersionId}.`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      releaseSha,
      pagesDeploymentVerified: true,
      workerVersionId,
      workerVersionVerified: true,
      workerDeploymentVerified: true,
    },
    null,
    2,
  ),
);
