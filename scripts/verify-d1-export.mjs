import { Database } from "bun:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";

const exportPath = process.argv[2];
if (!exportPath) {
  throw new Error("Usage: bun scripts/verify-d1-export.mjs <export.sql>");
}
if (!existsSync(exportPath) || statSync(exportPath).size === 0) {
  throw new Error("The D1 export is missing or empty.");
}

const sql = readFileSync(exportPath, "utf8");
const database = new Database(":memory:", { create: true, strict: true });

try {
  database.exec(sql);

  const integrityRow = database.query("pragma integrity_check").get();
  const integrityValue = integrityRow
    ? String(Object.values(integrityRow)[0] ?? "")
    : "";
  if (integrityValue !== "ok") {
    throw new Error(`Restored export failed SQLite integrity_check: ${integrityValue}`);
  }

  const requiredTables = [
    "contacts",
    "lead_events",
    "routing_decisions",
    "listing_cache",
    "d1_migrations",
  ];
  const tableRows = database
    .query("select name from sqlite_master where type = 'table'")
    .all();
  const tableNames = new Set(tableRows.map((row) => String(row.name)));
  const missingTables = requiredTables.filter((name) => !tableNames.has(name));
  if (missingTables.length > 0) {
    throw new Error(`Restored export is missing required tables: ${missingTables.join(", ")}.`);
  }

  const counts = Object.fromEntries(
    requiredTables.map((table) => {
      const row = database.query(`select count(*) as count from ${table}`).get();
      return [table, Number(row?.count ?? 0)];
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        integrity: integrityValue,
        requiredTables,
        rowCounts: counts,
      },
      null,
      2,
    ),
  );
} finally {
  database.close();
}
