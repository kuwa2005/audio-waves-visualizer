import { expect, test } from "@playwright/test";

/** ?demo によるデモ素材の読み込みと、プレビュー上のマウス操作（移動・拡大縮小・リセット） */
test("?demo でデモ素材を読み込み、レイヤーをドラッグ・ホイール・ダブルクリックで操作できる", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("?demo"); // デモ素材を読み込む
  await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("持ち帰るとは行ったけど（デモ）.m4a")).toBeVisible();

  const stage = page.getByTestId("stage");
  const box = (await stage.boundingBox())!;
  // ネオンバー（画面下部）をつかんで上へドラッグ
  const sx = box.x + box.width * 0.5;
  const sy = box.y + box.height * 0.75;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy - 120, { steps: 6 });
  await page.mouse.up();

  const sel = page.getByTestId("selection-box");
  await expect(sel).toBeVisible();
  await expect(sel).toContainText("ネオンバー");
  await expect(page.getByTestId("transform-controls")).toBeVisible();
  const before = (await sel.boundingBox())!;

  // ホイールで縮小（下方向に回す）
  await page.mouse.move(sx + 40, sy - 120);
  await page.mouse.wheel(0, 300);
  await expect(sel).not.toContainText("100%");
  const after = (await sel.boundingBox())!;
  expect(after.width).toBeLessThan(before.width);
  await page.screenshot({ path: test.info().outputPath("moved.png") });

  // ダブルクリックで元に戻る
  await page.mouse.dblclick(after.x + after.width / 2, after.y + after.height / 2);
  await expect(sel).toContainText("100%");

  // プレビューの外（インスペクター）をクリックするとガイドが消え、選択は残る
  // （スライダー等の部品に当たって値が変わらないよう、見出しの文字をクリックする）
  await page.getByTestId("inspector").locator("h3").first().click();
  await expect(sel).toBeHidden();
  await expect(page.getByTestId("transform-controls")).toBeVisible();
  // レイヤーをクリックすると再表示、何も無い所（画面上端）をクリックすると消える
  await page.mouse.click(sx, sy);
  await expect(sel).toBeVisible();
  await page.mouse.click(box.x + box.width * 0.5, box.y + 4);
  await expect(sel).toBeHidden();

  expect(errors).toEqual([]);
});
