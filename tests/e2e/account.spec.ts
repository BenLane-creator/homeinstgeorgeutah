import { expect, test } from "@playwright/test";

const pendingScopes = [
  {
    key: "washington-vow",
    countyLabel: "Washington County",
    active: false,
    approvalStatus: "pending",
  },
  {
    key: "iron-vow",
    countyLabel: "Iron County",
    active: false,
    approvalStatus: "pending",
  },
];

test("consumer account remains honest and fail-closed while VOW scopes are pending", async ({
  page,
}) => {
  await page.route("**/api/v1/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { authenticated: false, account: null },
      }),
    });
  });
  await page.route("**/api/mls-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { active: false, scopes: pendingScopes },
      }),
    });
  });

  await page.goto("/account/");

  await expect(
    page.getByRole("heading", { name: "Keep your home search organized." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in through the authorized MLS scope." }),
  ).toBeVisible();
  await expect(page.getByText("Authorization pending")).toHaveCount(2);
  await expect(page.locator('a[href*="/api/v1/auth/flexmls/start"]')).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
