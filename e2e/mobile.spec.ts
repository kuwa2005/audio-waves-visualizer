import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** スマホ幅: パネルの内容までスクロールでき、再生ボタンは常に画面内、性能表示はヘッダーに畳んで格納 */
test("スマホ幅でも素材の設定までスクロールでき、再生ボタンが常に見える", async ({ page }) => {
  await page.goto("");
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  // 性能表示は畳まれていて、▼で開ける。ヘッダーが横にはみ出さない
  await expect(page.getByTestId("perf-hud")).toBeHidden();
  const bulb = (await page.getByTestId("theme-toggle").boundingBox())!;
  expect(bulb.x + bulb.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId("perf-toggle").click();
  await expect(page.getByTestId("perf-fps")).toBeVisible();
  await page.getByTestId("perf-toggle").click();

  const fade = page.getByTestId("fade-out");
  await fade.scrollIntoViewIfNeeded();
  await expect(fade).toBeInViewport();
  // スクロールしても再生ボタン（タイムライン）は画面の下に残る
  await expect(page.getByTestId("play-button")).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("mobile-scrolled.png") });
});
