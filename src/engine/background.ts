import type { BackgroundLayer } from "./scene";
import type { AudioFeatures } from "./features";

/**
 * 背景レイヤー。画像全体を表示に必要な解像度で一度だけ縮小・キャッシュし、
 * 毎フレームはキャッシュを 1 回 drawImage するだけにする（倍率・位置・ビートズームは描くときに掛ける）。
 */
/** ビートでズームの最大量（キック・低音それぞれ、倍率に対する割合） */
export const MAX_KICK_ZOOM = 0.06;
export const MAX_BASS_ZOOM = 0.02;

/** ズームアウトの補正込みで、倍率 scale の背景を描く実際の拡大率（cover に対する比） */
export function backgroundZoom(scale: number, zoomPunch: number, kick: number, bass: number): number {
  const comp = 1 / (1 + Math.min(0, zoomPunch) * (MAX_KICK_ZOOM + MAX_BASS_ZOOM));
  return scale * comp * (1 + zoomPunch * (kick * MAX_KICK_ZOOM + bass * MAX_BASS_ZOOM));
}

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

    // 100% = 画面をちょうど覆う大きさ（画面と同じ縦横比の画像なら全体がぴったり収まる）
    const scale = Math.min(3, Math.max(0.5, layer.scale ?? 1));
    const cover = Math.max(W / image.width, H / image.height);
    // 画像全体を「表示する大きさ」で 1 回だけキャッシュする（毎フレームはほぼ等倍で描くだけにして軽くする）。
    // 拡大時のメモリを抑えるため、長辺は最大 4096px
    // ビートでズームアウト（マイナス）のときだけ、いちばん縮んだ瞬間に設定の倍率へ戻る分だけ大きめにしておく（端が黒くならない）
    const kc = Math.min(cover * Math.max(1, backgroundZoom(scale, layer.zoomPunch, 0, 0)), 4096 / Math.max(image.width, image.height));
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
    // ビートでズーム（プラスはズームイン、マイナスはズームアウト。ズームアウト時の補正込み）
    const k = cover * backgroundZoom(scale, layer.zoomPunch, f.kick, f.bass);
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
