import type { BackgroundLayer } from "./scene";
import type { AudioFeatures } from "./features";

/**
 * 背景レイヤー。画像は出力サイズに合わせて一度だけ cover 配置で縮小・キャッシュし、
 * 毎フレームはキャッシュを 1 回 drawImage するだけにする。
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
    /** 画像のフェード係数 0..1（0 で真っ黒） */
    fade = 1,
  ): void {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, W, H);
    if (!image || !imageId || fade <= 0) return;

    // ズーム時に端が見えないよう、少し大きめ（110%）でキャッシュする
    const over = 1.1;
    const key = `${imageId}:${W}x${H}`;
    if (key !== this.cacheKey) {
      const cw = Math.round(W * over);
      const ch = Math.round(H * over);
      const c = new OffscreenCanvas(cw, ch);
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      const s = Math.max(cw / image.width, ch / image.height);
      const dw = image.width * s;
      const dh = image.height * s;
      g.drawImage(image, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      this.cache = c;
      this.cacheKey = key;
    }
    const c = this.cache!;
    const zoom = 1 + layer.zoomPunch * (f.kick * 0.06 + f.bass * 0.02);
    const dw = (W * zoom * over);
    const dh = (H * zoom * over);
    ctx.globalAlpha = fade;
    ctx.drawImage(c, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
    const dim = Math.min(1, Math.max(0, layer.dim - f.kick * layer.zoomPunch * 0.15));
    if (dim > 0) {
      ctx.globalAlpha = dim * fade;
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
