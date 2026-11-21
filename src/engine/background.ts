import type { BackgroundLayer } from "./scene";
import type { AudioFeatures } from "./features";

/**
 * 背景レイヤー。画像全体を表示に必要な解像度で一度だけ縮小・キャッシュし、
 * 毎フレームはキャッシュを 1 回 drawImage するだけにする（倍率・位置・ビートズームは描くときに掛ける）。
 */
export class BackgroundRenderer {
  private cache: OffscreenCanvas | null = null;
  private cacheKey = "";

  render(
    ctx: OffscreenCanvasRenderingContext2D,
    W: number,
    H: number,
    layer: BackgroundLayer,
    image: ImageBitmap | undefined,
    imageId: string | undefined,
    f: AudioFeatures,
  ): void {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, W, H);
    if (!image || !imageId) return;

    // 画面を覆う大きさ（cover）の 1.1 倍を 100% とする（ビートでズームアウトしても端が見えないように）
    const over = 1.1;
    const scale = Math.min(3, Math.max(0.5, layer.scale ?? 1));
    const cover = Math.max(W / image.width, H / image.height);
    // 画像全体を「表示する大きさ」で 1 回だけキャッシュする（毎フレームはほぼ等倍で描くだけにして軽くする）。
    // 拡大時のメモリを抑えるため、長辺は最大 4096px
    const kc = Math.min(cover * over * Math.max(1, scale), 4096 / Math.max(image.width, image.height));
    const key = `${imageId}:${W}x${H}:${kc.toFixed(3)}`;
    if (key !== this.cacheKey) {
      const c = new OffscreenCanvas(Math.max(1, Math.round(image.width * kc)), Math.max(1, Math.round(image.height * kc)));
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(image, 0, 0, c.width, c.height);
      this.cache = c;
      this.cacheKey = key;
    }
    const c = this.cache!;
    // マイナスはズームアウト（最小 0.92 倍）
    const zoom = 1 + layer.zoomPunch * (f.kick * 0.06 + f.bass * 0.02);
    const k = cover * over * scale * zoom;
    const dw = image.width * k;
    const dh = image.height * k;
    // 位置: はみ出している分の範囲で動かす（+1 で右端・下端が見える）
    const offX = Math.max(0, (dw - W) / 2) * Math.min(1, Math.max(-1, layer.panX ?? 0));
    const offY = Math.max(0, (dh - H) / 2) * Math.min(1, Math.max(-1, layer.panY ?? 0));
    // 毎フレームの補間は既定（軽い）のまま。高品質な補間はキャッシュを作るときだけ使う
    ctx.drawImage(c, (W - dw) / 2 - offX, (H - dh) / 2 - offY, dw, dh);
    // ビートで少し明るくする（ズームイン・アウトどちらでも強さは絶対値）
    const dim = Math.min(1, Math.max(0, layer.dim - f.kick * Math.abs(layer.zoomPunch) * 0.15));
    if (dim > 0) {
      ctx.globalAlpha = dim;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  invalidate(): void {
    this.cacheKey = "";
    this.cache = null;
  }
}
