import { lineScapeMeta } from "./catalog";
import { num, str, type VisualizerPlugin } from "./types";

const COLS = 96;

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => {
    const x = (pa >> s) & 255;
    const y = (pb >> s) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * 3D ラインスケープ: 過去のスペクトル（t − k·Δ）を奥に並べた地形。
 * 履歴は spectrumAt(過去の時刻) で毎回求めるので状態を持たず、シークしても破綻しない（決定的）。
 * 中央に低音、左右に高音が来るよう左右対称に並べる。
 */
export const lineScape: VisualizerPlugin = {
  ...lineScapeMeta,
  create() {
    const row = new Float32Array(COLS);
    return {
      render(ctx, frame, params) {
        const { width: W, height: H, t } = frame;
        const lines = Math.round(num(params, "lines", 44));
        const hist = num(params, "history", 2.4);
        const amp = num(params, "height", 0.26) * H;
        const horizonY = num(params, "horizon", 0.36) * H;
        const near = str(params, "color", "#7cf7ff");
        const far = str(params, "far", "#b56bff");
        const kick = frame.features.kick;

        ctx.save();
        ctx.lineJoin = "round";
        // 奥から手前へ描く（手前の面で奥の線を隠す）
        for (let k = lines - 1; k >= 0; k--) {
          const z = k / lines; // 0 = 手前, 1 = 奥
          const spec = frame.spectrumAt(t - z * hist);
          const maxBin = Math.floor(spec.length * 0.55);
          for (let c = 0; c < COLS; c++) {
            const d = Math.abs(c / (COLS - 1) - 0.5) * 2; // 中央 0 → 端 1
            const bin = Math.max(1, Math.floor(Math.pow(maxBin, d * 0.92 + 0.08)));
            const v = Math.min(1, Math.sqrt(spec[bin]) * (1.6 + d * 1.6));
            row[c] = v;
          }
          const s = 1 / (1 + z * 3); // 遠近の縮尺 1 → 0.25
          const norm = (s - 0.25) / 0.75;
          const baseY = horizonY + (H * 1.02 - horizonY) * norm;
          const spread = W * 1.35 * s;
          const a = amp * s * (1 + (k === 0 ? kick * 0.3 : 0));

          ctx.beginPath();
          for (let c = 0; c < COLS; c++) {
            const x = W / 2 + (c / (COLS - 1) - 0.5) * spread;
            const y = baseY - row[c] * a;
            if (c === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          // 面で塗って奥を隠す
          ctx.lineTo(W / 2 + spread / 2, baseY + 4);
          ctx.lineTo(W / 2 - spread / 2, baseY + 4);
          ctx.closePath();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.88;
          ctx.fillStyle = "#05060c";
          ctx.fill();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.min(1, 0.25 + (1 - z) * 0.85);
          ctx.strokeStyle = mixHex(near, far, z);
          ctx.lineWidth = 1 + (1 - z) * 2.2;
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  },
};
