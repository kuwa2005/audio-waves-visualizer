import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * sample/ のテスト素材（ローカル専用・コミットしない）を使った通し確認。
 * 素材が無い環境（CI など）ではスキップする。
 */
const SAMPLE_DIR = join(import.meta.dirname, "..", "sample");
const files = existsSync(SAMPLE_DIR) ? readdirSync(SAMPLE_DIR) : [];
const audio = files.find((f) => /\.(wav|mp3|m4a|flac)$/i.test(f));
const images = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));

test.skip(!audio, "sample/ に音声ファイルがありません");

test("素材を読み込み、解析・再生・比率切替・レイヤー追加ができる", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("");
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });

  // 旧版リンクが赤く目立つこと
  const classic = page.getByTestId("classic-link");
  await expect(classic).toHaveAttribute("href", "/visualizer-classic/");
  expect(await classic.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(220, 38, 38)");

  await page.getByTestId("audio-input").setInputFiles(join(SAMPLE_DIR, audio!));
  await page.getByTestId("image-input").setInputFiles(images.map((f) => join(SAMPLE_DIR, f)));

  // 解析結果（BPM）が出る
  await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });
  const bpm = Number(await page.getByTestId("perf-bpm").textContent());
  expect(bpm).toBeGreaterThan(60);
  expect(bpm).toBeLessThan(200);

  // 1 分地点へシークして再生 → 時刻が進む
  const tl = page.getByTestId("timeline");
  const box = (await tl.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.33, box.y + box.height / 2);
  await page.getByTestId("play-button").click();
  const t1 = await page.getByTestId("time-display").textContent();
  await page.waitForTimeout(2500);
  const t2 = await page.getByTestId("time-display").textContent();
  expect(t2).not.toBe(t1);
  await page.screenshot({ path: test.info().outputPath("16x9.png") });

  // 比率を切り替え、レイヤーを追加
  await page.getByTestId("aspect-9:16").click();
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-pulse-ring").click();
  await expect(page.getByTestId("inspector")).toContainText("パルスリング");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath("9x16.png") });

  await page.getByTestId("aspect-1:1").click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath("1x1.png") });
  console.log("HUD:", (await page.getByTestId("perf-hud").innerText()).replace(/\n/g, " | "));

  expect(errors).toEqual([]);
});
