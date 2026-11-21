import { expect, test } from "@playwright/test";

/**
 * 起動確認テスト。ローカル（vite preview）と本番（AWV_URL=https://lil.la/visualizer/）の両方で使う。
 * 注意: ヘッドレス環境は GPU を使わないため、FPS の値は実機の性能を表さない。ここでは動作の有無だけを確認する。
 */
test("描画エンジンが起動し、WASM が動き、フレームが進む", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("");
  await expect(page.getByRole("heading", { name: "Audio Waves Visualizer" })).toBeVisible();
  await expect(page.getByTestId("stage-canvas")).toBeVisible();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 15_000 });

  // HUD に FPS が出るまで待つ（0.5 秒ごとに更新）
  await expect.poll(async () => Number(await page.getByTestId("perf-fps").textContent()), { timeout: 10_000 }).toBeGreaterThan(1);

  // 旧版へのリンク
  await expect(page.getByTestId("classic-link")).toHaveAttribute("href", "/visualizer-classic/");

  // SharedArrayBuffer 用のクロスオリジン分離が効いていること
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // キャンバスに実際に何か描かれていること（単色ではない）
  const png = await page.getByTestId("stage-canvas").screenshot();
  expect(png.byteLength).toBeGreaterThan(5_000);

  await page.screenshot({ path: test.info().outputPath("app.png") });
  console.log("HUD:", (await page.getByTestId("perf-hud").innerText()).replace(/\n/g, " | "));

  expect(errors).toEqual([]);
});
