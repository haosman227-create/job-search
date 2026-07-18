import { expect, test } from "@playwright/test";

/**
 * Public-surface smoke (audit follow-up): the route guard once silently
 * redirected the legal pages and the PWA offline fallback to /login through
 * three sessions of green CI, because nothing exercised real routing. These
 * assertions pin the public allowlist at the running-app level.
 */

test("legal pages are reachable without signing in", async ({ page }) => {
  await page.goto("/legal/terms");
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(
    page.getByRole("heading", { name: "Terms of Service" }),
  ).toBeVisible();

  await page.goto("/legal/privacy");
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(
    page.getByRole("heading", { name: "Privacy Policy" }),
  ).toBeVisible();

  // The draft banner must be present until counsel signs off.
  await expect(page.getByText("pending legal review").first()).toBeVisible();
});

test("the PWA offline fallback is reachable without signing in", async ({
  page,
}) => {
  await page.goto("/offline");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(
    page.getByRole("heading", { name: "You're offline" }),
  ).toBeVisible();
});

test("the web app manifest is served", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.length).toBeGreaterThan(0);
});

test("the app itself still requires auth", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
