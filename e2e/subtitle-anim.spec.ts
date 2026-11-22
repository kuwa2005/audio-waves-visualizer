import { expect, test } from "@playwright/test";
import { SUBTITLE_PARAMS } from "../src/text/textCatalog";

const anims = (SUBTITLE_PARAMS.find((d) => d.key === "anim") as { options: { value: string }[] }).options.map((o) => o.value);

/** 字幕の表示の動きを全部切り替えて、登場中と表示中を撮る（エラーが出ないこと＋目視確認用） */
test("字幕の表示の動き（全種類・縦書き）", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });
  // 背景のスペアナを外し、字幕だけを見る
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  await page.getByTestId("step-text").click();
  await page.getByTestId("subs-style").click();
  const inspector = page.getByTestId("inspector");
  const animSelect = inspector.locator("label", { hasText: "表示の動き" }).locator("select");
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  const seek = async (sec: number) => {
    await page.mouse.click(tl.x + tl.width * (sec / 182.8), tl.y + tl.height / 2);
    await page.waitForTimeout(250);
  };
  const stage = page.getByTestId("stage");
  for (const a of anims) {
    await animSelect.selectOption(a);
    await seek(1.25);
    await stage.screenshot({ path: test.info().outputPath(`sub-${a}-in.png`) });
    await seek(2.6);
    await stage.screenshot({ path: test.info().outputPath(`sub-${a}-mid.png`) });
  }
  // 縦書き
  await inspector.locator("label", { hasText: "文字の向き" }).locator("select").selectOption("vertical");
  await animSelect.selectOption("charDrop");
  await seek(2.6);
  await stage.screenshot({ path: test.info().outputPath("sub-vertical.png") });
  expect(errors).toEqual([]);
});
