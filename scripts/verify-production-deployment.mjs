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

const versionsText = JSON.stringify(versions);
if (!versionsText.includes(releaseSha)) {
  throw new Error(`The Worker version inventory does not contain release SHA ${releaseSha}.`);
}

const deploymentText = JSON.stringify(deployment);
if (!deploymentText.includes(releaseSha)) {
  throw new Error(`The active Worker deployment is not tagged or described with ${releaseSha}.`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      releaseSha,
      pagesDeploymentVerified: true,
      workerVersionVerified: true,
      workerDeploymentVerified: true,
    },
    null,
    2,
  ),
);
