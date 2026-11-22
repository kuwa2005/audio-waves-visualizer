import { expect, test } from "@playwright/test";

/** タイトルと字幕（?demo でデモ素材の字幕を読み込む） */
test("字幕とタイトルを表示・調整・移動できる", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("?demo"); // デモ素材を読み込む
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });
  await page.getByTestId("step-text").click();
  await expect(page.getByTestId("subs-info")).toContainText("件の字幕");

  // 最初の字幕が出ている 2 秒地点で一時停止のまま表示
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  const duration = 182.8;
  await page.mouse.click(tl.x + tl.width * (2 / duration), tl.y + tl.height / 2);
  await page.waitForTimeout(600);
  const stage = page.getByTestId("stage");
  const withSubs = await stage.screenshot({ path: test.info().outputPath("subs-on.png") });

  // 字幕を消すと絵が変わる
  await page.getByTestId("subs-enabled").uncheck();
  await page.waitForTimeout(400);
  const withoutSubs = await stage.screenshot();
  expect(Buffer.compare(withSubs, withoutSubs)).not.toBe(0);
  await page.getByTestId("subs-enabled").check();

  // 字幕の見た目: カラオケ表示＋背景の帯
  await page.getByTestId("subs-style").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("字幕");
  await inspector.locator("label", { hasText: "表示の動き" }).locator("select").selectOption("karaoke");
  await inspector.locator("label", { hasText: "背景の帯" }).locator("input").fill("0.5");

  // タイトル
  await page.getByTestId("title-text").fill("持ち帰るとは\n言ったけど");
  await page.getByTestId("title-subtext").fill("Audio Waves Visualizer");
  await expect(page.getByTestId("title-enabled")).toBeChecked();
  await page.getByTestId("title-style").click();
  await inspector.locator("label", { hasText: "光彩" }).first().locator("input").fill("0.8");
  await inspector.locator("label", { hasText: "登場の動き" }).locator("select").selectOption("none");
  await page.waitForTimeout(500);
  await stage.screenshot({ path: test.info().outputPath("title-and-karaoke.png") });

  // タイトル（画面中央）をドラッグで上へ移動
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("selection-box")).toContainText("タイトル");
  await expect(inspector.locator("label", { hasText: "縦位置" })).toContainText("-0.2");
  await stage.screenshot({ path: test.info().outputPath("title-moved.png") });

  expect(errors).toEqual([]);
});
