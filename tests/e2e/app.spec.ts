import { expect, test } from "@playwright/test";

test("renders the SkillPin application shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SkillPin" })).toBeVisible();
  await expect(page.getByText("P0 baseline")).toBeVisible();
});
