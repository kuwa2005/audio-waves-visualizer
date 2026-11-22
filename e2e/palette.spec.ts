import { expect, test } from "@playwright/test";

/** 配色プリセットを押すと、レイヤーの色がまとめて切り替わる */
test("配色プリセットで色の組み合わせを選べる", async ({ page }) => {
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });
  // 盛り上がる所を再生しながら確認する
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  await page.mouse.click(tl.x + tl.width * 0.42, tl.y + tl.height / 2);
  await page.getByTestId("play-button").click();
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  const inspector = page.getByTestId("inspector");
  await expect(page.getByTestId("palette-picker")).toBeVisible();
  // 初期の色はネオン
  await expect(page.getByTestId("palette-neon")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("palette-fire").click();
  await expect(page.getByTestId("palette-fire")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("palette-name")).toContainText("ファイア");
  const colors = inspector.locator('input[type="color"]');
  await expect(colors.nth(0)).toHaveValue("#ff2a00");
  await expect(colors.nth(1)).toHaveValue("#ffb000");
  await page.waitForTimeout(500);
  await page.getByTestId("stage").screenshot({ path: test.info().outputPath("neon-bars-fire.png") });

  // 色を個別に変えると、どのプリセットとも一致しなくなる
  await colors.nth(0).fill("#123456");
  await expect(page.getByTestId("palette-fire")).toHaveAttribute("aria-pressed", "false");

  // 3 色のグライコにも当たる
  await page.getByTestId("add-graphic-eq").click();
  await page.getByTestId("palette-ocean").click();
  await expect(inspector.locator('input[type="color"]').nth(0)).toHaveValue("#0077b6");
  await page.waitForTimeout(500);
  await page.getByTestId("stage").screenshot({ path: test.info().outputPath("graphic-eq-ocean.png") });
});
