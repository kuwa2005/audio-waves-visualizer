import { expect, test } from "@playwright/test";
import { CATALOG } from "../src/plugins/catalog";
import { EFFECT_CATALOG } from "../src/plugins/effectCatalog";

/**
 * 全ビジュアライザーと全エフェクトを、デモ曲の盛り上がる所で 1 つずつ表示してスクリーンショットを残す（目視確認用）。
 * エラーが出ないことと、HUD が更新され続けることを確認する。
 */
test("全ビジュアライザー・全エフェクトがエラーなく描画できる", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("");
  await expect(page.getByTestId("perf-bpm")).toBeVisible({ timeout: 60_000 });
  const tl = (await page.getByTestId("timeline").boundingBox())!;
  await page.mouse.click(tl.x + tl.width * 0.42, tl.y + tl.height / 2);
  await page.getByTestId("play-button").click();
  await page.getByTestId("step-visual").click();

  // 既定のネオンバーを外す（ギャラリーのカードをもう一度押すと外れる）
  const layerList = page.getByTestId("layer-list");
  await expect(page.getByTestId("add-neon-bars")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("add-neon-bars").click();
  await expect(layerList.locator("li")).toHaveCount(0);

  for (const meta of CATALOG) {
    const card = page.getByTestId(`add-${meta.id}`);
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1800);
    await page.getByTestId("stage").screenshot({ path: test.info().outputPath(`vis-${meta.id}.png`) });
    console.log(meta.id, (await page.getByTestId("perf-hud").innerText()).replace(/\n/g, " | "));
    if (meta.id === "starry-sky") {
      await page.getByTestId("inspector").locator("label", { hasText: "星の大きさ" }).locator("input").fill("3");
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-starry-sky-big.png") });
    }
    if (meta.id === "turntable") {
      // 仕上げの切り替え
      for (const finish of ["walnut", "black"]) {
        await page.getByTestId("inspector").locator("select").first().selectOption(finish);
        await page.waitForTimeout(800);
        await page.getByTestId("stage").screenshot({ path: test.info().outputPath(`vis-turntable-${finish}.png`) });
      }
      // ピクチャーレコード（盤面全体に画像）
      await page.getByTestId("inspector").locator("label", { hasText: "画像の表示" }).locator("select").selectOption("full");
      await page.waitForTimeout(800);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-turntable-picture.png") });
    }
    // その場でもう一度押して外す
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(layerList.locator("li")).toHaveCount(0);
  }

  // ワープトンネル＋全エフェクト
  await page.getByTestId("add-warp-tunnel").click();
  for (const meta of EFFECT_CATALOG) await page.getByTestId(`add-fx-${meta.id}`).click();
  await expect(page.getByTestId("effect-list").locator("li")).toHaveCount(EFFECT_CATALOG.length);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(700);
    await page.getByTestId("stage").screenshot({ path: test.info().outputPath(`fx-all-${i}.png`) });
  }
  console.log("all-fx", (await page.getByTestId("perf-hud").innerText()).replace(/\n/g, " | "));
  expect(errors).toEqual([]);
});
