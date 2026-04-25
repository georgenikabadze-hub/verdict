import { test, expect, chromium } from "@playwright/test";

test("Use my location button works", async () => {
  // Custom context with geolocation granted
  const browser = await chromium.launch();
  const context = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: 52.516274, longitude: 13.377704 }, // Brandenburg Gate
  });
  const page = await context.newPage();

  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (e) => logs.push(`[ERR] ${e.message}`));

  await page.goto("http://localhost:3000/");
  await page.waitForLoadState("networkidle");

  // Capture initial address input value
  const input = page.getByPlaceholder(/Enter address|lat/i);
  const before = await input.inputValue();
  console.log(`[before] address input: "${before}"`);

  // Click the Use my location button
  const button = page.getByRole("button", { name: /Use my location/i });
  await expect(button).toBeVisible();
  await button.click();

  // Wait for either: address fills in, error appears, or 5s timeout
  await page.waitForTimeout(5000);

  const after = await input.inputValue();
  console.log(`[after] address input: "${after}"`);

  // Look for error text
  const errPill = page.locator('p.text-\\[\\#F2B84B\\]');
  const errVisible = await errPill.isVisible().catch(() => false);
  if (errVisible) {
    const errText = await errPill.textContent();
    console.log(`[err pill] ${errText}`);
  }

  // Check if Cesium loaded (LayerSwitcher appears = coords were set in HomeShell)
  const layerSwitcher = page.getByRole("button", { name: /3D View/ });
  const layerVisible = await layerSwitcher.isVisible().catch(() => false);
  console.log(`[layer-switcher visible after click] ${layerVisible}`);

  await page.screenshot({ path: "/tmp/verdict_use_location_test.png", fullPage: false });

  console.log(`\n=== ALL CONSOLE LOGS ===`);
  for (const l of logs) console.log(l);

  await browser.close();
});
