import { expect, test } from "@playwright/test";

/** 設定がローカルストレージに保存され、再読み込みで復元される */
test("素材の調整・レイヤー・エフェクトの設定が再読み込み後も残る", async ({ page }) => {
  await page.goto("");
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });

  // 素材の調整
  await page.getByTestId("fade-in").fill("1.5");
  const dim = page.locator("label", { hasText: "暗さ" }).locator("input");
  await dim.fill("0.6");
  // ビートでズームはマイナス（ズームアウト）も保存される
  await page.getByTestId("zoom-punch").fill("-0.5");

  // レイヤーとエフェクトを追加して値を変える
  await page.getByTestId("step-visual").click();
  await page.getByTestId("add-mirror-ball").click();
  await page.getByTestId("add-fx-bloom").click();
  const inspector = page.getByTestId("inspector");
  await inspector.locator("label", { hasText: "ビートへの感度" }).locator("input").fill("1.7");
  await page.waitForTimeout(600); // 保存の待ち時間（300ms）より長く

  await page.reload();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  await expect(page.getByTestId("fade-in")).toHaveValue("1.5");
  await expect(page.locator("label", { hasText: "暗さ" }).locator("input")).toHaveValue("0.6");
  await expect(page.getByTestId("zoom-punch")).toHaveValue("-0.5");
  await expect(page.locator("label", { hasText: "ビートでズーム" })).toContainText("-50%");
  await page.getByTestId("step-visual").click();
  await expect(page.getByTestId("add-mirror-ball")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("add-neon-bars")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("effect-list").getByRole("button", { name: /ブルーム/ }).click();
  await expect(inspector.locator("label", { hasText: "ビートへの感度" })).toContainText("1.70");

  // 初期状態に戻す
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("reset-settings").click();
  await expect(page.getByTestId("add-mirror-ball")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  await expect(page.getByTestId("fade-in")).toHaveValue("0");
});
