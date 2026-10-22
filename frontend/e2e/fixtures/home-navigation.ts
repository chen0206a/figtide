import { expect, type Page } from "@playwright/test";

/** The latest chart has a large continue card; older charts remain list buttons. */
export async function openHomeChart(page: Page, name: string) {
  await expect(page.locator(".home").getByText(name, { exact: true }).first()).toBeVisible();
  const latest = page.locator(".home-continue").filter({ has: page.getByRole("heading", { name, exact: true }) });
  if (await latest.count()) await latest.getByRole("button", { name: "继续编辑", exact: true }).click();
  else await page.locator(".home-list-item").filter({ has: page.getByText(name, { exact: true }) }).click();
}
