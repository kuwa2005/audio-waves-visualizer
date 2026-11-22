import { Galaxy } from "../wasm/pkg/awv_core";
import { wasmMemory } from "../engine/wasmEnv";
import { galaxyMeta } from "./catalog";
import { num, str, type VisualizerPlugin } from "./types";

/** ラスタ解像度は出力の 1/RASTER_DIV（拡大時のぼけが発光の役割を兼ねる） */
const RASTER_DIV = 3;

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * パーティクル・ギャラクシー: シミュレーションと描画は WASM（Galaxy）。
 * JS 側は putImageData 1 回と拡大 drawImage 1 回だけ。
 */
export const galaxy: VisualizerPlugin = {
  ...galaxyMeta,
  create() {
    let sim: Galaxy | null = null;
    let key = "";
    let raster: OffscreenCanvas | null = null;
    let rctx: OffscreenCanvasRenderingContext2D | null = null;

    return {
      dispose() {
        sim?.free();
        sim = null;
        key = "";
      },
      reset() {
        // シーク時は作り直して初期状態から（書き出しと同じ開始状態にする）
        sim?.free();
        sim = null;
        key = "";
      },
      render(ctx, frame, params) {
        const { width: W, height: H, features: f, dt } = frame;
        const count = Number(str(params, "count", "40000")) || 40000;
        const rw = Math.ceil(W / RASTER_DIV);
        const rh = Math.ceil(H / RASTER_DIV);
        const k = `${count}:${rw}x${rh}`;
        if (k !== key || !sim) {
          sim?.free();
          sim = new Galaxy(count, rw, rh, 20261121);
          key = k;
          raster = new OffscreenCanvas(rw, rh);
          rctx = raster.getContext("2d")!;
        }
        sim.step(dt, f.bass, f.kick, num(params, "swirl", 1), num(params, "explode", 1));
        const [r0, g0, b0] = hexRgb(str(params, "inner", "#ff6ad5"));
        const [r1, g1, b1] = hexRgb(str(params, "outer", "#3cc8ff"));
        // 粒が多いほど 1 粒を暗くして、全体の明るさを揃える
        const gain = num(params, "brightness", 1) * 0.22 * Math.sqrt(40000 / count) * (0.8 + f.rms * 0.5);
        sim.render(num(params, "trail", 0.6), num(params, "size", 0.9), r0, g0, b0, r1, g1, b1, gain);

        const len = rw * rh * 4;
        const pixels = new Uint8ClampedArray(wasmMemory().buffer, sim.buf_ptr(), len);
        rctx!.putImageData(new ImageData(pixels, rw, rh), 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(raster!, 0, 0, W, H);
        ctx.restore();
      },
    };
  },
};
