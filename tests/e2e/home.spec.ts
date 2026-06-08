import { expect, test } from "@playwright/test";

test("homepage renders primary IDX CTA", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /find the right home/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /search homes/i }).first(),
  ).toHaveAttribute("href", /\/homes\/search/);
});
