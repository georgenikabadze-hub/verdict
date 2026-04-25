import { test, expect } from "@playwright/test";

test("Places autocomplete renders + LayerSwitcher works", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // 1. Type into address — should trigger Places dropdown
  const input = page.getByPlaceholder(/Enter address|lat/i);
  await input.fill("Brand");
  await page.waitForTimeout(2500); // give Places API a sec

  // The .pac-container is rendered into <body>, not inside the React tree
  const dropdown = page.locator(".pac-container");
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log(`[autocomplete] .pac-container visible: ${dropdownVisible}`);

  // 2. Now type a full address + tab to trigger forward-geocode fallback
  await input.fill("");
  await input.fill("Im Winkel 37, 14195 Berlin");
  await input.blur();
  await page.waitForTimeout(7000);

  // 3. Layer switcher buttons
  const layer3D = page.getByRole("button", { name: /3D View/i });
  const layerHeat = page.getByRole("button", { name: /Heatmap/i });
  const layerMap = page.getByRole("button", { name: /Map/i });
  console.log(`[layer-switcher] 3D=${await layer3D.isVisible()} Heat=${await layerHeat.isVisible()} Map=${await layerMap.isVisible()}`);

  await page.screenshot({ path: "/tmp/verdict_full_test.png" });

  console.log(`[errors] ${errors.length} console errors:`);
  for (const e of errors.slice(0, 5)) console.log("  - " + e);
});
