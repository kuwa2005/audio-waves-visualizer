import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** スマホ幅: パネルの内容までスクロールでき、再生ボタンは常に画面内、性能表示は FPS だけ */
test("スマホ幅でも素材の設定までスクロールでき、再生ボタンが常に見える", async ({ page }) => {
  await page.goto("");
  await expect(page.getByTestId("perf-fps")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("perf-wasm")).toBeHidden(); // 詳細は隠す

  const fade = page.getByTestId("fade-out");
  await fade.scrollIntoViewIfNeeded();
  await expect(fade).toBeInViewport();
  // スクロールしても再生ボタン（タイムライン）は画面の下に残る
  await expect(page.getByTestId("play-button")).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("mobile-scrolled.png") });
});
