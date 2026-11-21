import { FLASH_MIN_INTERVAL } from "./effectCatalog";
import { lightningMeta } from "./catalog";
import { mulberry32 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

const LIFE = 0.35;
const MIN_GAP = 0.12;

type Bolt = { born: number; strength: number; paths: Float32Array[]; widths: number[]; sky: boolean };

/** 中点変位法で稲妻の折れ線を作る */
function boltPath(rnd: () => number, x0: number, y0: number, x1: number, y1: number, depth: number, rough: number): number[] {
  let pts = [x0, y0, x1, y1];
  let disp = Math.hypot(x1 - x0, y1 - y0) * rough;
  for (let d = 0; d < depth; d++) {
    const next: number[] = [pts[0], pts[1]];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const nx = -(by - ay);
      const ny = bx - ax;
      const nl = Math.hypot(nx, ny) || 1;
      const o = (rnd() - 0.5) * disp;
      next.push(mx + (nx / nl) * o, my + (ny / nl) * o, bx, by);
    }
    pts = next;
    disp *= 0.55;
  }
  return pts;
}

/**
 * ライトニング: オンセット（音の立ち上がり）が閾値を超えたら稲妻を発生させる。
 * 形は発生時刻から作る種で決まる（プレビューと書き出しで同じ形になる）。
 */
export const lightning: VisualizerPlugin = {
  ...lightningMeta,
  create() {
    let bolts: Bolt[] = [];
    let lastTrigger = -Infinity;
    let lastSkyFlash = -Infinity;
    let prevOnset = 0;

    return {
      reset() {
        bolts = [];
        lastTrigger = -Infinity;
        lastSkyFlash = -Infinity;
        prevOnset = 0;
      },
      render(ctx, frame, params) {
        const { width: W, height: H, features: f, t } = frame;
        const threshold = num(params, "threshold", 0.55);
        const count = Math.round(num(params, "bolts", 2));
        const branches = num(params, "branches", 0.5);
        const color = str(params, "color", "#9bd7ff");
        const flash = num(params, "flash", 0.18);

        // 立ち上がり（前フレームより増えて閾値を超えた瞬間）で発生
        const rising = f.onset >= threshold && f.onset > prevOnset;
        prevOnset = f.onset;
        if (rising && t - lastTrigger > MIN_GAP) {
          lastTrigger = t;
          const rnd = mulberry32(Math.floor(t * 1000) + 17);
          const strength = Math.min(1, 0.4 + f.onset * 0.6);
          // 空を光らせるのは前回から FLASH_MIN_INTERVAL 以上空いたときだけ（光過敏への配慮）
          const sky = t - lastSkyFlash >= FLASH_MIN_INTERVAL;
          if (sky) lastSkyFlash = t;
          for (let b = 0; b < count; b++) {
            const x0 = W * (0.1 + rnd() * 0.8);
            const y0 = -H * 0.05;
            const x1 = x0 + (rnd() - 0.5) * W * 0.5;
            const y1 = H * (0.55 + rnd() * 0.45);
            const main = boltPath(rnd, x0, y0, x1, y1, 7, 0.28);
            const paths = [Float32Array.from(main)];
            const widths = [1];
            // 枝分かれ
            const nb = Math.floor(branches * 4 * strength + rnd() * branches * 2);
            for (let k = 0; k < nb; k++) {
              const idx = 2 * (4 + Math.floor(rnd() * (main.length / 2 - 8)));
              const sx = main[idx];
              const sy = main[idx + 1];
              const ang = Math.atan2(y1 - y0, x1 - x0) + (rnd() - 0.5) * 1.6;
              const len = Math.hypot(x1 - x0, y1 - y0) * (0.15 + rnd() * 0.3);
              paths.push(Float32Array.from(boltPath(rnd, sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, 5, 0.3)));
              widths.push(0.45);
            }
            bolts.push({ born: t, strength, paths, widths, sky: sky && b === 0 });
          }
        }
        bolts = bolts.filter((b) => t - b.born < LIFE && t >= b.born);
        if (bolts.length === 0) return;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // 空の光り（発生直後 0.08 秒だけ）
        for (const b of bolts) {
          if (!b.sky || flash <= 0 || t - b.born >= 0.08) continue;
          ctx.globalAlpha = flash * b.strength * (1 - (t - b.born) / 0.08);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, W, H);
        }

        const scale = Math.min(W, H) / 1080;
        for (const b of bolts) {
          const age = (t - b.born) / LIFE;
          // ちらつき（時刻から決まる）
          const flicker = 0.65 + 0.35 * mulberry32(Math.floor(t * 60) + Math.floor(b.born * 1000))();
          const a = (1 - age) * (1 - age) * b.strength * flicker;
          b.paths.forEach((p, pi) => {
            const w = b.widths[pi] * scale;
            for (const [lw, alpha, col] of [
              [18 * w, 0.18, color],
              [6 * w, 0.5, color],
              [2.2 * w, 1, "#ffffff"],
            ] as const) {
              ctx.globalAlpha = a * alpha;
              ctx.strokeStyle = col;
              ctx.lineWidth = lw * (0.7 + b.strength * 0.6);
              ctx.beginPath();
              ctx.moveTo(p[0], p[1]);
              for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
              ctx.stroke();
            }
          });
        }
        ctx.restore();
      },
    };
  },
};
