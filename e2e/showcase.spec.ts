import { execFileSync } from "node:child_process";
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

  await page.goto("?demo"); // デモ素材を読み込む
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
    if (meta.id === "pulse-ring" || meta.id === "warp-tunnel") {
      // 「光の強さ」0% にすると中心が暗くなる（演奏中なのでフレームごとの揺れを避け、0% と 100% を交互に 2 回ずつ測る）
      const center = async (light: string) => {
        await page.getByTestId("inspector").locator("label", { hasText: "光の強さ" }).locator("input").fill(light);
        await page.waitForTimeout(300);
        const path = test.info().outputPath(`${meta.id}-light-${light}.png`);
        await page.getByTestId("stage").screenshot({ path });
        const box = (await page.getByTestId("stage").boundingBox())!;
        const w = 60;
        return execFileSync("ffmpeg", ["-v", "error", "-i", path, "-vf", `crop=${w}:${w}:${Math.floor(box.width / 2 - w / 2)}:${Math.floor(box.height / 2 - w / 2)},scale=1:1,format=gray`, "-f", "rawvideo", "-"])[0];
      };
      const on = (await center("100")) + (await center("100"));
      const off = (await center("0")) + (await center("0"));
      console.log(meta.id, "center luma 100%/0%:", on / 2, off / 2);
      expect(off).toBeLessThan(on);
      await page.getByTestId("inspector").locator("label", { hasText: "光の強さ" }).locator("input").fill("100");
    }
    if (meta.id === "drops") {
      // 種類をすべて切り替えて確認
      for (const v of ["heart", "firework", "star", "paw"]) {
        await page.getByTestId("inspector").locator("label", { hasText: "種類" }).locator("select").selectOption(v);
        await page.getByTestId("inspector").locator("label", { hasText: "落ちる量" }).locator("input").fill("12");
        await page.waitForTimeout(900);
        await page.getByTestId("stage").screenshot({ path: test.info().outputPath(`vis-drops-${v}.png`) });
      }
    }
    if (meta.id === "mirror-ball") {
      // 光源ごとに色を変えて、0.5 秒後と比べる（動きの確認用）
      await page.getByTestId("inspector").locator("label", { hasText: "光の色" }).locator("select").selectOption("rainbow");
      await page.getByTestId("inspector").locator("label", { hasText: "回転速度" }).locator("input").fill("0.3");
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-mirror-ball-a.png") });
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-mirror-ball-b.png") });
    }
    if (meta.id === "starry-sky") {
      const size = page.getByTestId("inspector").locator("label", { hasText: "明るい星" }).locator("input");
      await size.fill("3");
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-starry-sky-big.png") });
      // 最小にしても小さな星の点は残る
      await size.fill("0.1");
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-starry-sky-min.png") });
      await expect(page.getByTestId("inspector")).not.toContainText("ビートへの感度");
    }
    if (meta.id === "space") {
      // 星雲の色を 2 色とも黒にすると、星雲も進む先の光も見えなくなる
      const colors = page.getByTestId("inspector").locator('input[type="color"]');
      await colors.nth(0).fill("#000000");
      await colors.nth(1).fill("#000000");
      await page.waitForTimeout(500);
      await page.getByTestId("stage").screenshot({ path: test.info().outputPath("vis-space-black-nebula.png") });
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

  // エフェクトを 1 つずつ単独で確認（全部外してから、付けて撮って外す）
  for (const meta of EFFECT_CATALOG) await page.getByTestId(`add-fx-${meta.id}`).click();
  await expect(page.getByTestId("effect-list").locator("li")).toHaveCount(0);
  for (const meta of EFFECT_CATALOG) {
    const card = page.getByTestId(`add-fx-${meta.id}`);
    await card.click();
    await expect(page.getByTestId("inspector")).toContainText("ビートへの感度");
    await page.waitForTimeout(700);
    await page.getByTestId("stage").screenshot({ path: test.info().outputPath(`fx-${meta.id}.png`) });
    await card.click();
  }
  expect(errors).toEqual([]);
});
