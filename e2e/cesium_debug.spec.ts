import { test, expect } from "@playwright/test";

test("inspect cesium clipping logs", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (e) => logs.push(`[ERR] ${e.message}`));

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const input = page.getByPlaceholder(/Enter address|lat/i);
  await input.fill("Im Winkel 37, 14195 Berlin");
  await input.blur();
  await page.waitForTimeout(8000);

  console.log("=== BROWSER LOGS ===");
  for (const l of logs) console.log(l);
});
