import { expect, test } from "@playwright/test";

test("renders the protected SkillPin workspace without a dashboard", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("SkillPin");
  await expect(
    page.getByRole("navigation", { name: "SkillPin sections" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "onboarding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "sources" })).toBeVisible();
  await expect(page.getByRole("button", { name: "skills" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Set up your first source" }),
  ).toBeVisible();
  await expect(page.getByText(/dashboard/i)).toHaveCount(0);
});

test("supports the base source and skill routes", async ({ page }) => {
  await page.goto("/sources");
  await expect(
    page.getByRole("heading", { name: "No source directories yet" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "skills" }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(
    page.getByRole("heading", { name: "Your skills will appear here" }),
  ).toBeVisible();
});

test("persists theme choice and returns focus after closing session panels", async ({
  page,
}) => {
  await page.goto("/");

  const details = page.getByRole("button", { name: "Session details" });
  await details.click();
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(details).toBeFocused();

  const end = page.getByRole("button", { name: "End SkillPin" });
  await end.click();
  await expect(
    page.getByRole("dialog", { name: "End SkillPin session" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(end).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
