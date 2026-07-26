import { afterEach, describe, expect, test } from "bun:test";
import { APPROVED_POLICY_VERSIONS } from "./mls-scope-service";
import {
  normalizeProviderListing,
  syncMlsPropertyCache,
} from "./mls-source-adapter";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createDb(cursor: string | null = null) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  let batchCalls = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            sql,
            values,
            async first() {
              return sql.includes("select cursor_value")
                ? { cursor_value: cursor }
                : null;
            },
            async run() {
              writes.push({ sql, values });
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      batchCalls += 1;
      writes.push(...statements);
      return statements.map(() => ({ success: true, results: [] }));
    },
  } as unknown as D1Database;

  return { DB: db, writes, getBatchCalls: () => batchCalls };
}

describe("MLS source adapter", () => {
  test("normalizes only the approved canonical field set", () => {
    const listing = normalizeProviderListing(
      {
        ListingKey: "abc-123",
        ListingId: "9876",
        StandardStatus: "Active",
        ListPrice: 650000,
        UnparsedAddress: "25 Desert View",
        City: "St. George",
        StateOrProvince: "UT",
        PostalCode: "84770",
        BedroomsTotal: 4,
        BathroomsTotalInteger: 3,
        LivingArea: 2500,
        PropertyType: "Residential",
        PropertySubType: "Single Family Residence",
        LotSizeAcres: 0.2,
        SubdivisionName: "Example",
        ListOfficeName: "Example Office",
        ModificationTimestamp: "2026-07-26T12:00:00Z",
        PrivateRemarks: "must not persist",
      },
      "washington",
      "approved-reso-source",
    );

    expect(listing?.id).toBe("washington:abc-123");
    expect(listing?.sourceListingKey).toBe("abc-123");
    expect(listing).not.toHaveProperty("PrivateRemarks");
  });

  test("records a skipped run and never calls the source while approval is pending", async () => {
    globalThis.fetch = (async () => {
      throw new Error("source must not be called");
    }) as typeof fetch;
    const db = createDb();

    const result = await syncMlsPropertyCache(
      {
        DB: db.DB,
        WASHINGTON_IDX_APPROVAL_STATUS: "pending",
        WASHINGTON_IDX_ENABLED: "false",
      },
      "washington",
    );

    expect(result.status).toBe("skipped");
    expect(db.writes[0]?.sql).toContain("insert into mls_sync_runs");
    expect(db.getBatchCalls()).toBe(0);
  });

  test("accepts Spark Results and D.Results collection envelopes", async () => {
    const envelopes = [
      {
        Results: [
          {
            ListingKey: "spark-root-1",
            StandardStatus: "Active",
            ModificationTimestamp: "2026-07-26T00:00:00Z",
          },
        ],
      },
      {
        D: {
          Results: [
            {
              ListingKey: "spark-nested-1",
              StandardStatus: "Active",
              ModificationTimestamp: "2026-07-26T00:00:00Z",
            },
          ],
        },
      },
    ];

    for (const payload of envelopes) {
      globalThis.fetch = (async () => Response.json(payload)) as typeof fetch;
      const db = createDb();

      const result = await syncMlsPropertyCache(
        {
          DB: db.DB,
          IRON_IDX_APPROVAL_STATUS: "approved",
          IRON_IDX_ENABLED: "true",
          IRON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.idx,
          IRON_IDX_PROVIDER: "approved-reso-source",
          IRON_IDX_API_BASE_URL: "https://example.com/reso",
          IRON_IDX_ACCESS_TOKEN: "secret",
        },
        "iron",
      );

      expect(result.status).toBe("succeeded");
      expect(result.recordsReceived).toBe(1);
      expect(result.recordsWritten).toBe(1);
      expect(db.getBatchCalls()).toBe(1);
    }
  });

  test("writes approved records, membership, cursor, and run completion atomically", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        value: [
          {
            ListingKey: "iron-1",
            StandardStatus: "Active",
            ListPrice: 450000,
            UnparsedAddress: "1 Main Street",
            City: "Cedar City",
            StateOrProvince: "UT",
            ModificationTimestamp: "2026-07-26T13:00:00Z",
          },
        ],
      })) as typeof fetch;
    const db = createDb();

    const result = await syncMlsPropertyCache(
      {
        DB: db.DB,
        IRON_IDX_APPROVAL_STATUS: "approved",
        IRON_IDX_ENABLED: "true",
        IRON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.idx,
        IRON_IDX_PROVIDER: "approved-reso-source",
        IRON_IDX_API_BASE_URL: "https://example.com/reso",
        IRON_IDX_ACCESS_TOKEN: "secret",
      },
      "iron",
    );

    expect(result.status).toBe("succeeded");
    expect(result.recordsWritten).toBe(1);
    expect(result.cursorAfter).toBe("2026-07-26T13:00:00Z");
    expect(db.getBatchCalls()).toBe(1);
    expect(
      db.writes.some((write) =>
        write.sql.includes("insert into listing_cache"),
      ),
    ).toBe(true);
    expect(
      db.writes.some((write) =>
        write.sql.includes("insert into listing_scope_membership"),
      ),
    ).toBe(true);
    expect(
      db.writes.some((write) =>
        write.sql.includes("insert into mls_sync_cursors"),
      ),
    ).toBe(true);
  });
});
