import { expect, test } from "@playwright/test";

test("the landing page is public and sells the product", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /Your invoice becomes your food cost/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start free — no card" }),
  ).toBeVisible();
});

test("unauthenticated visitors are redirected to login from the app", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/catalog");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/invoices/upload");
  await expect(page).toHaveURL(/\/login$/);

  // Deep links, including the review/detail route, are gated too.
  await page.goto("/invoices/11111111-1111-4111-8111-111111111111");
  await expect(page).toHaveURL(/\/login$/);
});

test("login and signup pages render and link to each other", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.getByRole("link", { name: "Start a free trial" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("heading", { name: "Start your free trial" }),
  ).toBeVisible();
  await expect(page.getByLabel("Business name")).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
