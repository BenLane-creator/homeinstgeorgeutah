import { readdirSync, readFileSync } from "node:fs";

const required = [
  "config",
  "d1List",
  "d1Info",
  "d1State",
  "workerDeployment",
  "workerSecrets",
  "health",
  "mlsStatus",
  "accountSession",
  "vowStart",
  "vowStartStatus",
];
const argumentsByName = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
for (const name of required) {
  if (!argumentsByName[name]) throw new Error(`Missing --${name}=<path>.`);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseName = process.env.D1_DATABASE;
if (!accountId || !databaseName) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and D1_DATABASE are required.");
}

const parse = (name) => JSON.parse(readFileSync(argumentsByName[name], "utf8"));
const config = readFileSync(argumentsByName.config, "utf8");
const configuredAccountId = config.match(/^account_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
if (configuredAccountId !== accountId) {
  throw new Error("Worker account_id does not match the production environment.");
}
const databaseBlock = config
  .split("[[d1_databases]]")
  .slice(1)
  .find((block) => block.match(/^database_name\s*=\s*"([^"]+)"\s*$/m)?.[1] === databaseName);
const configuredDatabaseId = databaseBlock?.match(/^database_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
if (!configuredDatabaseId) throw new Error(`No configured database_id for ${databaseName}.`);

const d1ListPayload = parse("d1List");
const databases = Array.isArray(d1ListPayload)
  ? d1ListPayload
  : Array.isArray(d1ListPayload?.result)
    ? d1ListPayload.result
    : [];
const databaseMatches = databases.filter((database) => database?.name === databaseName);
if (databaseMatches.length !== 1) {
  throw new Error(`Expected exactly one ${databaseName} database; found ${databaseMatches.length}.`);
}
const remoteDatabaseId = databaseMatches[0]?.uuid ?? databaseMatches[0]?.id;
if (remoteDatabaseId !== configuredDatabaseId) {
  throw new Error("Configured D1 UUID does not match the authenticated account.");
}

const d1InfoPayload = parse("d1Info");
const d1InfoRows = Array.isArray(d1InfoPayload) ? d1InfoPayload : [d1InfoPayload];
if (!d1InfoRows.some((entry) => entry?.name === databaseName)) {
  throw new Error("Configured production D1 database was not returned by d1 info.");
}

const d1StatePayload = parse("d1State");
const d1State = (Array.isArray(d1StatePayload) ? d1StatePayload : [d1StatePayload])
  .flatMap((entry) => entry?.results || [])[0];
if (!d1State) throw new Error("D1 returned no production-state row.");
const expectedMigrations = readdirSync("packages/db/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
const appliedMigrations = String(d1State.applied_migrations || "")
  .split("|")
  .filter(Boolean)
  .sort();
const pendingMigrations = expectedMigrations.filter((name) => !appliedMigrations.includes(name));
const unexpectedMigrations = appliedMigrations.filter((name) => !expectedMigrations.includes(name));
if (JSON.stringify(appliedMigrations) !== JSON.stringify(expectedMigrations)) {
  throw new Error(
    `Production migration mismatch. Pending: ${pendingMigrations.join(", ") || "none"}; unexpected: ${unexpectedMigrations.join(", ") || "none"}.`,
  );
}
if (Number(d1State.unique_index_count) !== 1) {
  throw new Error("Unique normalized-email index is not present.");
}
if (Number(d1State.duplicate_email_group_count) !== 0) {
  throw new Error("Duplicate normalized-email groups exist.");
}

const workerDeployment = parse("workerDeployment");
if (!workerDeployment || JSON.stringify(workerDeployment) === "{}" || JSON.stringify(workerDeployment) === "[]") {
  throw new Error("No active Worker deployment was returned.");
}
const approvedSecrets = new Set([
  "EMAIL_DELIVERY_TOKEN",
  "INTERNAL_JOB_TOKEN",
  "IRON_IDX_ACCESS_TOKEN",
  "IRON_VOW_CLIENT_SECRET",
  "TURNSTILE_SECRET_KEY",
  "VOW_STATE_SECRET",
  "VOW_TOKEN_ENCRYPTION_KEY",
  "WASHINGTON_IDX_ACCESS_TOKEN",
  "WASHINGTON_VOW_CLIENT_SECRET",
]);
const requiredSecrets = ["INTERNAL_JOB_TOKEN", "TURNSTILE_SECRET_KEY"];
const secretsPayload = parse("workerSecrets");
if (!Array.isArray(secretsPayload)) throw new Error("Worker secret inventory is not an array.");
const secretNames = secretsPayload.map((secret) => secret?.name).filter(Boolean);
const unapprovedSecrets = secretNames.filter((name) => !approvedSecrets.has(name));
const missingSecrets = requiredSecrets.filter((name) => !secretNames.includes(name));
if (unapprovedSecrets.length > 0) {
  throw new Error(`Unapproved Worker secret names: ${unapprovedSecrets.join(", ")}.`);
}
if (missingSecrets.length > 0) {
  throw new Error(`Required Worker secret names are missing: ${missingSecrets.join(", ")}.`);
}

const health = parse("health");
if (
  health?.ok !== true ||
  health?.data?.service !== "homeinstgeorgeutah-api" ||
  health?.data?.status !== "ok"
) {
  throw new Error("Root-domain API health route is not serving the expected Worker.");
}

const mls = parse("mlsStatus");
const expectedScopes = ["washington-idx", "washington-vow", "iron-idx", "iron-vow"];
const scopes = Array.isArray(mls?.data?.scopes) ? mls.data.scopes : [];
const scopeKeys = scopes.map((scope) => scope?.key).sort();
if (
  mls?.ok !== true ||
  mls?.data?.active !== false ||
  scopes.length !== expectedScopes.length ||
  JSON.stringify(scopeKeys) !== JSON.stringify(expectedScopes.sort()) ||
  scopes.some((scope) => scope?.active !== false)
) {
  throw new Error("MLS activation is not in the required four-scope disabled state.");
}

const accountSession = parse("accountSession");
if (
  accountSession?.ok !== true ||
  accountSession?.data?.authenticated !== false ||
  accountSession?.data?.account !== null
) {
  throw new Error("Anonymous production account session is not fail-closed.");
}

const vowStartStatus = Number(
  readFileSync(argumentsByName.vowStartStatus, "utf8").trim(),
);
const vowStart = parse("vowStart");
if (
  vowStartStatus !== 503 ||
  vowStart?.ok !== false ||
  vowStart?.error?.code !== "VOW_AUTHORIZATION_PENDING"
) {
  throw new Error("Washington VOW authorization start is not fail-closed.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      accountIdVerified: true,
      databaseId: configuredDatabaseId,
      migrations: expectedMigrations,
      uniqueEmailIndex: true,
      duplicateEmailGroups: 0,
      approvedWorkerSecretNames: secretNames.sort(),
      apiHealth: true,
      inactiveMlsScopes: expectedScopes,
      anonymousAccountSession: true,
      inactiveVowAuthorizationStart: true,
    },
    null,
    2,
  ),
);
