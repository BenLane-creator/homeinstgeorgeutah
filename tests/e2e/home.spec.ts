import { expect, test } from "@playwright/test";

test("homepage matches the approved brand and featured areas", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Better Real Estate Decisions." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /search homes/i }).first(),
  ).toHaveAttribute("href", /\/homes\/search\//);

  const featured = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: /explore southern utah neighborhoods/i,
    }),
  });
  for (const area of [
    "Winchester Hills",
    "Dammeron Valley",
    "Sunbrook",
    "Ivins",
  ]) {
    await expect(featured.getByRole("heading", { name: area })).toBeVisible();
  }
});

test("prelaunch metadata and canonical URL are present", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,nofollow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://homeinstgeorgeutah.com/",
  );
});

test("legal routes render and an unknown route is a true 404", async ({
  page,
}) => {
  for (const route of ["/privacy/", "/terms/", "/accessibility/"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
  }

  const missing = await page.goto("/this-route-must-not-exist/");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /page not found/i }),
  ).toBeVisible();
});

test("forms expose programmatic labels", async ({ page }) => {
  await page.goto("/contact/");

  const unlabeledControls = await page
    .locator('input:not([type="hidden"]), select, textarea')
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          const field = control as HTMLInputElement;
          return (
            field.labels?.length === 0 &&
            !field.getAttribute("aria-label") &&
            !field.getAttribute("aria-labelledby")
          );
        })
        .map((control) => control.outerHTML),
    );

  expect(unlabeledControls).toEqual([]);
});

test("homepage has no horizontal overflow at target mobile widths", async ({
  page,
}) => {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.scrollWidth,
      `overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
});

test("keyboard navigation reaches the skip link", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
});
