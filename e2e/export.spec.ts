import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * MP4 書き出しの通し確認。sample/ の素材を使い、出力を ffprobe で検証する。
 * 素材または ffprobe が無い環境ではスキップする。
 */
const SAMPLE_DIR = join(import.meta.dirname, "..", "sample");
const files = existsSync(SAMPLE_DIR) ? readdirSync(SAMPLE_DIR) : [];
const audio = files.find((f) => /\.(wav|mp3|m4a|flac)$/i.test(f));
const images = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const hasFfprobe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test.skip(!audio || !hasFfprobe, "sample/ の音声または ffprobe がありません");

type Probe = { streams: { codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; nb_frames?: string }[]; format: { duration: string } };

for (const [aspect, w, h] of [
  ["16:9", 1920, 1080],
  ["9:16", 1080, 1920],
] as const) {
  test(`${aspect} で 5 秒の範囲を MP4 に書き出せる（映像＋音声）`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("");
    await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
    await page.getByTestId("audio-input").setInputFiles(join(SAMPLE_DIR, audio!));
    await page.getByTestId("image-input").setInputFiles(images.map((f) => join(SAMPLE_DIR, f)));
    await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId(`aspect-${aspect}`).click();
    await page.getByTestId("step-visual").click();
    await page.getByTestId("add-pulse-ring").click();
    await page.getByTestId("header-export").click();
    await page.getByTestId("range-custom").check();
    await page.getByTestId("range-start").fill("1:00");
    await page.getByTestId("range-end").fill("1:05");
    await page.getByRole("button", { name: "30fps" }).click();
    await page.getByTestId("export-start").click();

    await expect(page.getByTestId("export-done")).toBeVisible({ timeout: 200_000 });
    console.log(`[${aspect}]`, await page.getByTestId("export-done").innerText());
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
    const out = test.info().outputPath(`export-${aspect.replace(":", "x")}.mp4`);
    await download.saveAs(out);
    expect(statSync(out).size).toBeGreaterThan(50_000);

    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-count_frames", "-of", "json", out], { encoding: "utf8" }),
    ) as Probe;
    const v = probe.streams.find((s) => s.codec_type === "video");
    const a = probe.streams.find((s) => s.codec_type === "audio");
    console.log(`[${aspect}] video=${v?.codec_name} ${v?.width}x${v?.height} frames=${v?.nb_frames} audio=${a?.codec_name} duration=${probe.format.duration}`);
    expect(v).toBeTruthy();
    expect(a).toBeTruthy();
    expect(v!.width).toBe(w);
    expect(v!.height).toBe(h);
    expect(Number(v!.nb_frames)).toBe(150);
    expect(Math.abs(Number(probe.format.duration) - 5)).toBeLessThan(0.15);

    // 中間フレームを画像として取り出しておく（目視確認用）
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "2.5", "-i", out, "-frames:v", "1", test.info().outputPath(`frame-${aspect.replace(":", "x")}.png`)]);
    expect(errors).toEqual([]);
  });
}
