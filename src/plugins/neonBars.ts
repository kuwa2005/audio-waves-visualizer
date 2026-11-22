import { neonBarsMeta } from "./catalog";
import { mixColor } from "./color";
import { num, str, type VisualizerPlugin } from "./types";

/**
 * ネオンバー: 対数周波数の棒グラフ。
 * - 発光は shadowBlur を使わず、着色済みスプライトの加算合成
 * - 色は本数・色相が変わったときだけ作り直す（毎フレームの文字列生成を避ける）
 */
export const neonBars: VisualizerPlugin = {
  ...neonBarsMeta,
  create() {
    let levels = new Float32Array(0);
    let peaks = new Float32Array(0);
    let colors: string[] = [];
    let colorKey = "";

    return {
      reset() {
        levels.fill(0);
        peaks.fill(0);
      },
      render(ctx, frame, params) {
        const bars = Math.round(num(params, "bars", 96));
        const hFrac = num(params, "height", 0.55);
        const yFrac = num(params, "y", 0.82);
        const colorLow = str(params, "colorLow", "#9b5cff");
        const colorHigh = str(params, "colorHigh", "#22e1ff");
        const glow = num(params, "glow", 0.6);
        const mirror = params.mirror !== false;
        const { width: W, height: H, features: f, dt, sprites } = frame;

        if (levels.length !== bars) {
          levels = new Float32Array(bars);
          peaks = new Float32Array(bars);
        }
        const key = `${bars}:${colorLow}:${colorHigh}`;
        if (key !== colorKey) {
          colorKey = key;
          colors = Array.from({ length: bars }, (_, i) => mixColor(colorLow, colorHigh, i / Math.max(1, bars - 1)));
        }

        // スペクトル → バー（対数スケール、各区間の最大値）
        const spec = f.spectrum;
        const maxBin = Math.max(8, Math.floor(spec.length * 0.72));
        const fall = Math.exp(-dt * 9);
        const peakFall = dt * 0.6;
        for (let b = 0; b < bars; b++) {
          const from = Math.max(1, Math.floor(Math.pow(maxBin, b / bars)));
          const to = Math.max(from + 1, Math.floor(Math.pow(maxBin, (b + 1) / bars)));
          let peak = 0;
          for (let k = from; k < to; k++) if (spec[k] > peak) peak = spec[k];
          // 高域ほど振幅が小さいので持ち上げる
          const tilt = 1 + (b / bars) * 1.8;
          const v = Math.min(1, Math.pow(peak * tilt * 3, 0.6));
          levels[b] = v > levels[b] ? v : levels[b] * fall + v * (1 - fall);
          peaks[b] = Math.max(levels[b], peaks[b] - peakFall);
        }

        const baseY = H * yFrac;
        const maxH = H * hFrac;
        const gap = W / bars;
        const barW = Math.max(1, gap * 0.56);
        const punch = 1 + f.kick * 0.12;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // 床の光（低音とビートで明るく）
        const floor = sprites.tintedGlow(colors[Math.floor(bars * 0.15)]);
        ctx.globalAlpha = Math.min(1, 0.15 + f.bass * 0.45 + f.kick * 0.4);
        ctx.drawImage(floor, -W * 0.1, baseY - H * 0.12, W * 1.2, H * 0.24);

        for (let b = 0; b < bars; b++) {
          const h = Math.max(2, levels[b] * maxH * punch);
          const x = b * gap + (gap - barW) / 2;
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors[b];
          ctx.fillRect(x, baseY - h, barW, h);
          // ピークの残像
          ctx.fillRect(x, baseY - peaks[b] * maxH * punch - 6, barW, 3);
          if (mirror) {
            ctx.globalAlpha = 0.18;
            ctx.fillRect(x, baseY + 4, barW, h * 0.35);
          }
          if (glow > 0 && levels[b] > 0.05) {
            ctx.globalAlpha = glow * 0.5 * levels[b];
            ctx.drawImage(sprites.tintedGlow(colors[b]), x - gap * 1.6, baseY - h - gap * 1.5, barW + gap * 3.2, h + gap * 3);
          }
        }
        ctx.restore();
      },
    };
  },
};
