import { expect, test, type Page } from "@playwright/test";

const ready = (page: Page) => expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
/** 使用中のスペアナ等の名前（表示順 = 上ほど手前） */
const layerNames = (page: Page) => page.getByTestId("layer-list").locator("li").evaluateAll((els) => els.map((e) => e.textContent?.replace(/[⠿▲▼✕🔒🔓]/gu, "").trim()));

test("ロゴ・ファビコン・電球でライト／ダーク切替（保存される）", async ({ page }) => {
  await page.goto("");
  await ready(page);
  await expect(page.getByTestId("logo")).toBeVisible();
  expect(await page.locator('link[rel="icon"]').getAttribute("href")).toMatch(/favicon\.svg$/);

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lightBg).not.toBe(darkBg);
  await page.screenshot({ path: test.info().outputPath("light.png") });

  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
});

test("レイヤーの並べ替え（▲▼・ドラッグ）、初期値に戻す、外して付け直しても設定が残る", async ({ page }) => {
  await page.goto("");
  await ready(page);
  await page.getByTestId("step-visual").click();
  await expect(page.getByTestId("layer-list").locator("li")).toHaveCount(0); // 起動直後は空
  await page.getByTestId("add-neon-bars").click();
  await page.getByTestId("add-pulse-ring").click();
  await page.getByTestId("add-warp-tunnel").click();
  expect(await layerNames(page)).toEqual(["ワープトンネル", "パルスリング", "ネオンバー"]);

  // ▼（奥へ）
  const rows = page.getByTestId("layer-list").locator("li");
  await rows.nth(0).getByRole("button", { name: "奥へ" }).click();
  expect(await layerNames(page)).toEqual(["パルスリング", "ワープトンネル", "ネオンバー"]);
  // ドラッグ: いちばん奥（ネオンバー）を、いちばん上の行の上半分へ
  const neonHandle = rows.nth(2).locator("[draggable=true]");
  const top = rows.nth(0);
  const tb = (await top.boundingBox())!;
  await neonHandle.dragTo(top, { targetPosition: { x: tb.width / 2, y: 2 } });
  expect(await layerNames(page)).toEqual(["ネオンバー", "パルスリング", "ワープトンネル"]);
  // 並べ替え中に「ファイルのドロップ待ち」表示は出ない
  await expect(page.getByText("ここにドロップ（音声・画像・字幕）")).toHaveCount(0);

  // 右側の「初期値に戻す」
  await page.getByTestId("layer-list").getByRole("button", { name: "パルスリング" }).click();
  const inspector = page.getByTestId("inspector");
  const light = inspector.locator("label", { hasText: "光の強さ" }).locator("input");
  await light.fill("30");
  await expect(light).toHaveValue("30");
  await page.getByTestId("params-reset").click();
  await expect(light).toHaveValue("100");

  // 外して付け直すと、前の設定値で追加される
  await light.fill("40");
  await page.getByTestId("add-pulse-ring").click(); // 外す
  await expect(page.getByTestId("add-pulse-ring")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("add-pulse-ring").click(); // 付け直す
  await expect(inspector.locator("label", { hasText: "光の強さ" }).locator("input")).toHaveValue("40");

  // 再読み込みするとレイヤーは空。追加すると種類ごとの設定値で出る
  await page.waitForTimeout(600);
  await page.reload();
  await ready(page);
  await page.getByTestId("step-visual").click();
  await expect(page.getByTestId("layer-list").locator("li")).toHaveCount(0);
  await page.getByTestId("add-pulse-ring").click();
  await expect(inspector.locator("label", { hasText: "光の強さ" }).locator("input")).toHaveValue("40");
});

test("重なったレイヤーは、同じ場所をもう一度クリックすると下のレイヤーを選べる。固定したレイヤーは選べない・消せない", async ({ page }) => {
  await page.goto("");
  await ready(page);
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-neon-bars").click();
  await page.getByTestId("add-pulse-ring").click();
  await page.getByTestId("add-warp-tunnel").click(); // 画面全体 = いちばん手前
  const stage = page.getByTestId("stage");
  const b = (await stage.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const heading = page.getByTestId("inspector").locator("h3");
  await expect(heading).toHaveText("ワープトンネル"); // 追加したものが選ばれている
  // 選択中（いちばん手前）をもう一度クリック → 下のレイヤーへ順に
  for (const name of ["パルスリング", "ネオンバー", "ワープトンネル"]) {
    await page.waitForTimeout(600); // ダブルクリック扱いにしない
    await page.mouse.click(x, y);
    await expect(heading).toHaveText(name);
  }
  // 下のレイヤーを選んだ状態で、そのままドラッグするとそのレイヤーが動く
  await page.waitForTimeout(600);
  await page.mouse.click(x, y); // パルスリング
  await expect(heading).toHaveText("パルスリング");
  await page.waitForTimeout(600);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.up();
  await expect(heading).toHaveText("パルスリング");
  await expect(page.getByTestId("transform-controls").locator("label", { hasText: "横位置" })).not.toContainText(/^横位置0\.00$/);

  // ワープトンネルを固定 → 削除できず、プレビューのクリックでは選ばれない（下のレイヤーが選ばれる）
  const warpRow = page.getByTestId("layer-list").locator("li", { hasText: "ワープトンネル" });
  await warpRow.getByRole("button", { name: "固定する" }).click();
  await expect(warpRow.getByRole("button", { name: "削除" })).toBeDisabled();
  await page.getByTestId("add-warp-tunnel").click(); // カードを押しても外れない
  await expect(page.getByTestId("layer-list").locator("li", { hasText: "ワープトンネル" })).toHaveCount(1);
  await page.getByTestId("layer-list").getByRole("button", { name: "ネオンバー" }).click();
  await page.waitForTimeout(600);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.1); // 上の方 = ワープトンネル（とパルスリング？）だけ
  await expect(heading).not.toHaveText("ワープトンネル");
  // 解除すると選べる
  await warpRow.getByRole("button", { name: "固定を解除" }).click();
  await expect(warpRow.getByRole("button", { name: "削除" })).toBeEnabled();
});

test("止まっている間は描画を休止し、再生中だけ描く。先頭へ戻るボタン", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-sparkle").click(); // 時間で動く演出
  await page.getByTestId("perf-toggle").click();
  await expect(page.getByTestId("perf-fps")).toHaveText("停止中");

  const canvas = page.getByTestId("stage-canvas");
  const still = async () => {
    const a = await canvas.screenshot();
    await page.waitForTimeout(700);
    const b = await canvas.screenshot();
    return Buffer.compare(a, b) === 0;
  };
  // デモ画像の読み込みが終わって描き直しが落ち着けば、止まったまま変わらない
  await expect.poll(still, { timeout: 20_000 }).toBe(true);

  await page.getByTestId("play-button").click();
  await expect.poll(async () => Number(await page.getByTestId("perf-fps").textContent()), { timeout: 10_000 }).toBeGreaterThan(1);
  expect(await still()).toBe(false);
  await expect(page.getByTestId("time-display")).not.toHaveText(/^0:00 /, { timeout: 5_000 });

  await page.getByTestId("play-button").click(); // 一時停止
  await expect(page.getByTestId("perf-fps")).toHaveText("停止中");
  await page.waitForTimeout(300);
  expect(await still()).toBe(true);

  // 先頭へ戻る（止まったまま。プレビューも先頭の絵に描き直される）
  const before = await canvas.screenshot();
  await page.getByTestId("seek-start").click();
  await expect(page.getByTestId("time-display")).toHaveText(/^0:00 /);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), before) !== 0, { timeout: 5_000 }).toBe(true);
});

test("字幕の配色プリセットと、項目名が縦に折り返されないこと", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("?demo");
  await expect(page.getByTestId("perf-bpm")).toBeAttached({ timeout: 60_000 });
  await page.getByTestId("step-text").click();
  await page.getByTestId("subs-style").click();
  const inspector = page.getByTestId("inspector");
  await expect(page.getByTestId("text-palette-picker")).toBeVisible();
  await expect(page.getByTestId("text-palette-classic")).toHaveAttribute("aria-pressed", "true");

  // 長い選択肢を選んでも「表示の動き」は 1 行のまま
  const anim = inspector.locator("label", { hasText: "表示の動き" });
  await anim.locator("select").selectOption("scramble");
  const labelBox = (await anim.locator("span").first().boundingBox())!;
  expect(labelBox.height).toBeLessThan(30);
  expect(labelBox.width).toBeGreaterThan(labelBox.height);

  await page.getByTestId("text-palette-neon-pink").click();
  await expect(page.getByTestId("text-palette-neon-pink")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("text-palette-name")).toContainText("ネオン（ピンク）");
  await expect(inspector.locator("label", { hasText: "光彩の色" }).locator("input")).toHaveValue("#ff3fb4");
  await expect(inspector.locator("label", { hasText: "カラオケの色" }).locator("input")).toHaveValue("#7cf7ff");
  // 個別に変えるとプリセットの選択が外れる
  await inspector.locator("label", { hasText: "文字色" }).locator("input").fill("#123456");
  await expect(page.getByTestId("text-palette-neon-pink")).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: test.info().outputPath("text-palette.png") });
});
