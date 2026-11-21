import { warpTunnelMeta } from "./catalog";
import { hash01 } from "./rng";
import { num, type VisualizerPlugin } from "./types";

const STARS = 140;

/**
 * ワープトンネル: 奥行きのあるリングと光の筋が手前へ流れる。
 * 進行度（phase）は dt の積算なので、書き出し時（一定の dt）でも同じ動きになる。
 */
export const warpTunnel: VisualizerPlugin = {
  ...warpTunnelMeta,
  create() {
    let phase = 0;
    let starPhase = 0;
    return {
      reset() {
        /* 位置は連続でなくても破綻しないので保持する */
      },
      render(ctx, frame, params) {
        const { width: W, height: H, features: f, dt, t, sprites } = frame;
        const n = Math.round(num(params, "rings", 36));
        const speed = num(params, "speed", 1);
        const sides = Math.round(num(params, "sides", 6));
        const twist = num(params, "twist", 0.35);
        const hue = num(params, "hue", 200);
        const hueShift = num(params, "hueShift", 90);
        const cx = W / 2;
        const cy = H / 2;
        const m = Math.min(W, H);
        const maxR = Math.hypot(W, H) * 0.6;

        const v = speed * (0.12 + f.bass * 0.5 + f.kick * 0.6);
        phase = (phase + v * dt) % 1;
        starPhase = (starPhase + v * dt * 1.6) % 1;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // 中心の光（ビートで閃く。「光の強さ」0〜100% を掛ける）
        const light = Math.min(100, Math.max(0, num(params, "light", 100))) / 100;
        ctx.globalAlpha = Math.min(1, (0.3 + f.kick * 0.7) * light);
        const core = m * (0.18 + f.bass * 0.12);
        ctx.drawImage(sprites.tintedGlow(`hsl(${hue + hueShift} 100% 70%)`), cx - core, cy - core, core * 2, core * 2);

        // 光の筋（星）
        ctx.lineCap = "round";
        for (let i = 0; i < STARS; i++) {
          const a = hash01(i) * Math.PI * 2;
          const z = (hash01(i + 999) + starPhase) % 1; // 0 = 奥, 1 = 手前
          const r1 = m * 0.05 / Math.max(0.04, 1 - z);
          const r2 = r1 * (1.08 + v * 0.6);
          if (r1 > maxR) continue;
          ctx.globalAlpha = Math.min(1, z * z * (0.6 + f.high));
          ctx.strokeStyle = `hsl(${hue + hueShift * hash01(i + 7)} 90% 75%)`;
          ctx.lineWidth = 1 + z * 3;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
          ctx.stroke();
        }

        // リング（奥から手前の順）
        const spec = f.spectrum;
        for (let i = 0; i < n; i++) {
          const z = 1 - ((i / n + phase) % 1); // 1 = 奥, 0 = 手前
          const r = (m * 0.06) / Math.max(0.035, z);
          if (r > maxR * 1.2) continue;
          const bin = 2 + Math.floor((1 - z) * (1 - z) * spec.length * 0.25);
          const amp = Math.min(1, Math.sqrt(spec[bin] ?? 0) * 2.2);
          const rr = r * (1 + amp * 0.12 + f.kick * 0.06 * (1 - z));
          const fadeNear = Math.min(1, z / 0.08);
          const fadeFar = Math.min(1, (1 - z) / 0.25);
          ctx.globalAlpha = fadeNear * fadeFar * (0.35 + amp * 0.65);
          ctx.strokeStyle = `hsl(${hue + hueShift * (1 - z) + t * 8} 95% ${55 + amp * 25}%)`;
          ctx.lineWidth = 1.5 + (1 - z) * (6 + f.kick * 10);
          const rot = twist * z * 4 + t * 0.15 * twist;
          ctx.beginPath();
          if (sides < 3) {
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          } else {
            for (let k = 0; k <= sides; k++) {
              const a = rot + (k / sides) * Math.PI * 2;
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              if (k === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  },
};
