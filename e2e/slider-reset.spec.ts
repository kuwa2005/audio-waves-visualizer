import { expect, test } from "@playwright/test";

/** スライダーのつまみをダブルクリックすると初期値に戻る（保存にも反映される） */
test("スライダーをダブルクリックすると初期値に戻る", async ({ page }) => {
  await page.goto("");
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });

  // 素材タブ
  const dim = page.locator("label", { hasText: "暗さ" }).locator("input");
  for (const [loc, changed, def] of [
    [dim, "0.7", "0"],
    [page.getByTestId("zoom-punch"), "-0.8", "0"],
    [page.getByTestId("bg-scale"), "2.5", "1"],
  ] as const) {
    await loc.fill(changed);
    await expect(loc).toHaveValue(changed);
    await loc.dblclick();
    await expect(loc).toHaveValue(def);
  }
  await expect(page.locator("label", { hasText: "暗さ" })).toContainText("0%");

  // インスペクター（ネオンバーの本数と、位置・大きさ）
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  const inspector = page.getByTestId("inspector");
  const bars = inspector.locator("label", { hasText: "本数" }).locator("input");
  await bars.fill("40");
  await bars.dblclick();
  await expect(bars).toHaveValue("96");
  const size = inspector.locator("label", { hasText: "大きさ" }).first().locator("input");
  await size.fill("2");
  await size.dblclick();
  await expect(size).toHaveValue("1");

  // 戻した値が保存される
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  await expect(page.locator("label", { hasText: "暗さ" }).locator("input")).toHaveValue("0");
});
