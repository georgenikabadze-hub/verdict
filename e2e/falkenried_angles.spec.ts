import { test, expect } from "@playwright/test";

/**
 * Falkenried 9, 14195 Berlin — drive the 3D view through every camera preset
 * and screenshot each one. The user reports the view "doesn't work properly"
 * after the OSM-clip change; this test gives us a paper trail of what the
 * camera actually frames at each preset so we can see whether the building
 * is centered, clipped correctly, and visible at all angles.
 */
test.describe.configure({ mode: "serial" });

const PRESETS = ["Top", "Front", "Side", "Oblique", "Roof angle"] as const;

test("Falkenried 9 — every camera preset", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push(`${msg.type()}: ${msg.text()}`);
    }
  });

  await page.goto("/");

  // Type the address and let onBlur forward-geocode.
  const input = page.getByPlaceholder("Enter address or lat,lng...");
  await input.fill("Falkenried 9, 14195 Berlin");
  await input.blur();

  // Wait for Cesium to load. Either the success badge or the error fallback.
  const liveBadge = page.getByText(/Live photoreal/i);
  const ready = await Promise.race([
    liveBadge
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "ready"),
    page
      .getByText(/3D view unavailable/i)
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "error"),
  ]).catch(() => "timeout");

  console.log(`[falkenried] cesium status: ${ready}`);

  // Let the tileset paint geometry before we start clicking presets.
  await page.waitForTimeout(8_000);

  // Capture the dimensions panel text — confirms which source supplied them
  // (OSM vs Solar) and the actual numbers.
  const dimsPanel = page.locator('text=Dimensions').locator("..");
  let dims = "";
  try {
    dims = await dimsPanel.innerText({ timeout: 3_000 });
  } catch {
    dims = "(dimensions panel not visible)";
  }
  console.log(`[falkenried] dimensions panel:\n${dims}`);

  // Save default-framing screenshot.
  await page.screenshot({
    path: "/tmp/falkenried_00_default.png",
    fullPage: false,
  });

  // Click each preset and screenshot. The toolbar lives in the top-right of
  // the left pane; aria-label="Camera presets" is on the toolbar wrapper.
  for (let i = 0; i < PRESETS.length; i++) {
    const label = PRESETS[i];
    const btn = page.getByRole("toolbar", { name: /camera presets/i }).getByRole("button", { name: new RegExp(`^${label}$`, "i") });
    await btn.click();
    // lookAtTransform snap is instant, but tiles re-stream on big pitch
    // changes — give it ~3s to settle before we screenshot.
    await page.waitForTimeout(3_000);
    const fname = `/tmp/falkenried_${String(i + 1).padStart(2, "0")}_${label.toLowerCase().replace(/\s+/g, "-")}.png`;
    await page.screenshot({ path: fname, fullPage: false });
    console.log(`[falkenried] saved ${fname} (preset=${label})`);
  }

  // Test the recenter button at the very end.
  const recenter = page
    .getByRole("toolbar", { name: /camera presets/i })
    .getByRole("button", { name: /recenter/i });
  await recenter.click();
  await page.waitForTimeout(2_000);
  await page.screenshot({
    path: "/tmp/falkenried_06_recenter.png",
    fullPage: false,
  });

  if (consoleErrors.length > 0) {
    console.log(`[falkenried] console diagnostics:\n${consoleErrors.join("\n")}`);
  }

  // Soft assertion — Cesium should have loaded, not errored.
  expect(ready).toBe("ready");
});
