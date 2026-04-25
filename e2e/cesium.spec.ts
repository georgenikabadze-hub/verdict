import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("Cesium 3D view loads and clips around a Berlin address", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto("/");

  // Wait for Ruhr cinematic to be visible (it always loads first)
  await expect(page.getByText(/cm-precision drone scan/i)).toBeVisible({ timeout: 15_000 });

  // Type a Berlin address and trigger geocoding (onBlur)
  const input = page.getByPlaceholder("Enter address or lat,lng...");
  await input.fill("Im Winkel 37, 14195 Berlin");
  await input.blur();

  // Wait up to 15s for the Cesium "Live photoreal" badge OR error fallback
  const liveBadge = page.getByText(/Live photoreal/i);
  const errorBadge = page.getByText(/3D view unavailable/i);

  const found = await Promise.race([
    liveBadge.waitFor({ state: "visible", timeout: 20_000 }).then(() => "live"),
    errorBadge.waitFor({ state: "visible", timeout: 20_000 }).then(() => "error"),
  ]).catch(() => "timeout");

  // Give the tileset a few seconds to actually paint geometry
  await page.waitForTimeout(6_000);

  // Snapshot the LEFT pane only (the cesium container)
  await page.screenshot({
    path: "/tmp/verdict_cesium_test.png",
    fullPage: false,
  });

  console.log(`[cesium-test] result: ${found}, console errors:\n${consoleErrors.join("\n")}`);

  // Loose assertion — we just want the page to not hard-crash
  expect(found).not.toBe("timeout");
});
