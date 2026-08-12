import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

describe("Turnstile integration contract", () => {
  test("keeps the existing widget sitekey and Spin action on every shared lead form", () => {
    const productionEnv = read("apps/site/.env.production");
    const leadForm = read("apps/site/src/components/LeadFormIsland.tsx");

    expect(productionEnv).toContain(
      "PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAEBRnBXOhm-2N05o",
    );
    expect(leadForm).toContain('className="cf-turnstile"');
    expect(leadForm).toContain('data-action="turnstile-spin-v2"');
    expect(leadForm).toContain('get("cf-turnstile-response")');
    expect(leadForm).toContain("window.turnstile?.reset(turnstileRef.current)");
  });

  test("pins the production action and hostname allowlist", () => {
    const wrangler = read("apps/api/wrangler.toml");

    expect(wrangler).toContain(
      'TURNSTILE_HOSTNAMES = "homeinstgeorgeutah.com,www.homeinstgeorgeutah.com"',
    );
    expect(wrangler).toContain(
      'TURNSTILE_EXPECTED_ACTION = "turnstile-spin-v2"',
    );
  });
});
