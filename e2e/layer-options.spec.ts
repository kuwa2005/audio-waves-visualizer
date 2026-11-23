import { expect, test, type Page } from "@playwright/test";

/** キャンバスの平均の明るさ（0..255） */
async function brightness(page: Page): Promise<number> {
  const png = await page.getByTestId("stage-canvas").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    return sum / (d.length / 4);
  }, png.toString("base64"));
}

/** 止まっている間の描き直しが落ち着くまで待つ */
async function settle(page: Page) {
  const canvas = page.getByTestId("stage-canvas");
  await expect
    .poll(
      async () => {
        const a = await canvas.screenshot();
        await page.waitForTimeout(400);
        return Buffer.compare(a, await canvas.screenshot()) === 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function demoAtLoudPart(page: Page) {
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  await page.mouse.click(tl.x + tl.width * 0.42, tl.y + tl.height / 2);
}

test("ネオンバーの発光 0 では光らない・透明度・サークルバーの中央の絵", async ({ page }) => {
  test.setTimeout(150_000);
  await demoAtLoudPart(page);
  // 背景を暗くして光の差を見やすくする
  await page.locator("label", { hasText: "暗さ" }).locator("input").fill("0.9");
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  // 再生してバーを伸ばしてから止める（止まっている間は同じ時刻の絵になる）
  await page.getByTestId("play-button").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("play-button").click();
  await settle(page);

  const inspector = page.getByTestId("inspector");
  const glow = inspector.locator("label", { hasText: "発光" }).locator("input");
  await glow.fill("1");
  await settle(page);
  const bright = await brightness(page);
  await glow.fill("0");
  await settle(page);
  const plain = await brightness(page);
  console.log("neon glow 1 / 0:", bright.toFixed(1), plain.toFixed(1));
  expect(bright).toBeGreaterThan(plain * 1.15); // 止めた位置で棒の高さが変わるため、差は控えめに見る
  await page.getByTestId("stage").screenshot({ path: test.info().outputPath("neon-glow0.png") });

  // 透明度 100% = レイヤーを消したのと同じ絵
  await inspector.getByTestId("opacity-field").locator("input").fill("100");
  await settle(page);
  const invisible = await page.getByTestId("stage-canvas").screenshot();
  await inspector.getByTestId("opacity-field").locator("input").fill("50");
  await settle(page);
  const half = await brightness(page);
  const row = page.getByTestId("layer-list").locator("li", { hasText: "ネオンバー" });
  await row.getByRole("checkbox").uncheck();
  await settle(page);
  expect(Buffer.compare(await page.getByTestId("stage-canvas").screenshot(), invisible)).toBe(0);
  const none = await brightness(page);
  expect(half).toBeGreaterThan(none);
  expect(half).toBeLessThan(plain);

  // サークルバー: 中央の絵の表示・非表示
  await page.getByTestId("add-radial-bars").click();
  const art = inspector.locator("label", { hasText: "中央の絵" }).locator("select");
  await expect(art).toHaveValue("show");
  await settle(page);
  const withArt = await page.getByTestId("stage-canvas").screenshot();
  await art.selectOption("hide");
  await settle(page);
  expect(Buffer.compare(await page.getByTestId("stage-canvas").screenshot(), withArt)).not.toBe(0);
  await page.getByTestId("stage").screenshot({ path: test.info().outputPath("radial-noart.png") });
});

test("タイトル・字幕の固定と縦書き、リピート再生、プレビューの外枠", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });

  // プレビュー: 角を丸めない、外側に色がある
  const canvas = page.getByTestId("stage-canvas");
  expect(await canvas.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("0px");
  const surround = await canvas.evaluate((el) => getComputedStyle(el.closest("section")!).backgroundColor);
  expect(surround).not.toBe("rgb(11, 13, 18)"); // 以前の地の色（黒に近く、映像との境目が見えなかった）

  // タイトルを縦書きで出す
  await page.getByTestId("step-text").click();
  await page.getByTestId("title-text").fill("縦書きのタイトル");
  await page.getByTestId("title-writing-vertical").click();
  await expect(page.getByTestId("title-writing-vertical")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("subtitles-writing-vertical").click();
  await settle(page);
  await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vertical-title.png") });

  // プレビューの中央をクリック → タイトルが選ばれる。固定すると選べない
  const b = (await page.getByTestId("stage").boundingBox())!;
  const heading = page.getByTestId("inspector").locator("h3");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(heading).toHaveText("タイトル");
  const box = (await page.getByTestId("selection-box").boundingBox())!;
  expect(box.height).toBeGreaterThan(box.width); // 縦長
  await page.getByTestId("title-lock").click();
  await expect(page.getByTestId("locked-note")).toBeVisible();
  await page.getByTestId("subs-style").click(); // 字幕を選んでおく
  await page.waitForTimeout(600);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByTestId("inspector").locator("h3", { hasText: "タイトル" })).toHaveCount(0);
  // 字幕を固定すると外せない
  await page.getByTestId("subtitles-lock").click();
  await expect(page.getByTestId("subs-remove")).toBeDisabled();
  await page.getByTestId("subtitles-lock").click();
  await expect(page.getByTestId("subs-remove")).toBeEnabled();

  // リピート: 最後まで再生したら先頭から続く
  const repeat = page.getByTestId("repeat-button");
  await expect(repeat).toHaveAttribute("aria-pressed", "false");
  await repeat.click();
  await expect(repeat).toHaveAttribute("aria-pressed", "true");
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  await page.mouse.click(tl.x + tl.width * 0.997, tl.y + tl.height / 2);
  await page.getByTestId("play-button").click();
  await expect(page.getByTestId("time-display")).toHaveText(/^0:0[0-5] /, { timeout: 8_000 });
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-label", "一時停止");
  await page.getByTestId("play-button").click();
  await page.reload();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  await expect(page.getByTestId("repeat-button")).toHaveAttribute("aria-pressed", "true");
});
