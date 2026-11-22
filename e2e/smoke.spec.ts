import { expect, test } from "@playwright/test";

/**
 * 起動確認テスト。ローカル（vite preview）と本番（AWV_URL=https://lil.la/visualizer/）の両方で使う。
 * 注意: ヘッドレス環境は GPU を使わないため、FPS の値は実機の性能を表さない。ここでは動作の有無だけを確認する。
 */
test("描画エンジンが起動し、WASM が動き、止まっている間は描画を休止する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("");
  await expect(page.getByRole("heading", { name: "Audio Waves Visualizer" })).toBeVisible();
  await expect(page.getByTestId("stage-canvas")).toBeVisible();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });

  // 性能表示はヘッダーに格納（▼で開く）。止まっている間は描画を休止するので「停止中」
  await expect(page.getByTestId("perf-hud")).toBeHidden();
  await page.getByTestId("perf-toggle").click();
  await expect(page.getByTestId("perf-hud")).toBeVisible();
  await expect(page.getByTestId("perf-fps")).toHaveText("停止中");

  // 本番仕様: 起動時に素材は読み込まない
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("perf-bpm")).toHaveCount(0);
  await expect(page.getByTestId("play-button")).toBeDisabled();

  // 旧版へのリンク（赤の静的表示・点滅なし）
  const classic = page.getByTestId("classic-link");
  expect(await classic.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await classic.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(220, 38, 38)");
  await expect(page.getByTestId("classic-link")).toHaveAttribute("href", "/visualizer-classic/");

  // SharedArrayBuffer 用のクロスオリジン分離が効いていること
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // 音声を読み込む前は無音: ビートの波動などで画面が定期的に変わらない
  const shots: Buffer[] = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(300);
    shots.push(await page.getByTestId("stage-canvas").screenshot());
  }
  for (let i = 1; i < shots.length; i++) expect(Buffer.compare(shots[i], shots[0])).toBe(0);

  await page.screenshot({ path: test.info().outputPath("app.png") });
  console.log("HUD:", (await page.getByTestId("perf-hud").innerText()).replace(/\n/g, " | "));

  expect(errors).toEqual([]);
});
