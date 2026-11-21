import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/** スクリーンショットの左上 (x,y) から w×h の平均の明るさ（0..255） */
function luma(file: string, x: number, y: number, w: number, h: number): number {
  return execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `crop=${w}:${h}:${x}:${y},scale=1:1,format=gray`, "-f", "rawvideo", "-"])[0];
}

test("背景の倍率と位置を変えられる", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });
  // 背景だけを見るため、スペアナを外し、暗さとビートズームを 0 にする
  await page.locator("label", { hasText: "暗さ" }).locator("input").fill("0");
  await page.getByTestId("zoom-punch").fill("0");
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  await page.getByTestId("step-media").click();
  const stage = page.getByTestId("stage");

  const shot = async (name: string) => {
    const path = test.info().outputPath(name);
    await page.waitForTimeout(400);
    await stage.screenshot({ path });
    return path;
  };

  const normal = await shot("bg-100.png");
  await page.getByTestId("bg-scale").fill("0.5");
  const small = await shot("bg-50.png");
  // 50% では四隅が黒い（画像が無い）
  expect(luma(small, 4, 4, 20, 20)).toBeLessThan(25);
  expect(luma(normal, 4, 4, 20, 20)).toBeGreaterThan(luma(small, 4, 4, 20, 20) + 10);

  // 200% にして横位置を左右に振ると、見える部分が変わる
  await page.getByTestId("bg-scale").fill("2");
  await page.getByTestId("bg-pan-x").fill("-1");
  const left = await shot("bg-200-left.png");
  await page.getByTestId("bg-pan-x").fill("1");
  const right = await shot("bg-200-right.png");
  const box = (await stage.boundingBox())!;
  const cx = Math.floor(box.width / 2) - 40;
  const cy = Math.floor(box.height / 2) - 40;
  expect(Math.abs(luma(left, cx, cy, 80, 80) - luma(right, cx, cy, 80, 80))).toBeGreaterThan(3);

  // 元に戻す
  await page.getByTestId("bg-fit-reset").click();
  await expect(page.getByTestId("bg-scale")).toHaveValue("1");
});
