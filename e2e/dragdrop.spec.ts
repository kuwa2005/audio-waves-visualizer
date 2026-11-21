import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** サイドバーの素材エリアにドロップしても、プレビューの「ドロップ待ち」表示が残らない */
test("素材エリアへのドロップで読み込まれ、ドロップ待ちの表示が解除される", async ({ page }) => {
  await page.goto("");
  await expect(page.getByTestId("perf-wasm")).toHaveText("OK", { timeout: 30_000 });
  const png = readFileSync(join(import.meta.dirname, "..", "public", "sample", "demo-16x9.jpg")).toString("base64");

  // ブラウザ内で DataTransfer を作り、ドラッグ → ドロップのイベントを素材エリアに送る
  const dt = await page.evaluateHandle((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bin], "bg.jpg", { type: "image/jpeg" }));
    return d;
  }, png);
  const zone = page.getByTestId("media-drop");
  await zone.dispatchEvent("dragenter", { dataTransfer: dt });
  await zone.dispatchEvent("dragover", { dataTransfer: dt });
  await expect(page.getByText("ここにドロップ（音声・画像・字幕）")).toBeVisible();
  await zone.dispatchEvent("drop", { dataTransfer: dt });

  await expect(page.getByText("ここにドロップ（音声・画像・字幕）")).toBeHidden();
  await expect(page.getByTestId("media-images").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("media-images")).toContainText("bg.jpg");
});
