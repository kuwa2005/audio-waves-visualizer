import { dropsMeta } from "./catalog";
import { hash01 } from "./rng";
import { heartPath, pawPath, starPath } from "./shapes";
import { num, str, type VisualizerPlugin } from "./types";

type Variant = "ripple" | "heart" | "firework" | "star" | "paw";
type Drop = { birth: number; seed: number; strength: number };

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const HUE_BUCKETS = 12;
const FIREWORK_SPARKS = 28;

/**
 * 時刻 t に生きている「しずく」の一覧。
 * 一定間隔のもの（rate/秒）と、ビートでまとめて落ちるもの（audio）の 2 系統。
 * どちらも時刻・拍番号から決まるので状態を持たない（シーク・書き出しで一致）。
 */
export function liveDrops(t: number, rate: number, life: number, audio: number, beatIndex: number, sinceBeat: number, bpm: number): Drop[] {
  const out: Drop[] = [];
  if (rate > 0) {
    const from = Math.floor((t - life) * rate);
    const to = Math.floor(t * rate);
    for (let k = from; k <= to; k++) {
      const birth = (k + hash01(k * 7 + 1)) / rate;
      if (birth <= t && t - birth < life) out.push({ birth, seed: k * 13 + 5, strength: 0.75 + hash01(k * 7 + 2) * 0.25 });
    }
  }
  if (audio > 0 && bpm > 0 && beatIndex >= 0 && Number.isFinite(sinceBeat)) {
    const beatSec = 60 / bpm;
    const back = Math.ceil(life / beatSec);
    for (let j = 0; j <= back; j++) {
      const b = beatIndex - j;
      if (b < 0) break;
      const birth = t - sinceBeat - j * beatSec;
      if (t - birth >= life) continue;
      const count = Math.round(audio * (2 + hash01(b * 31 + 9) * 4));
      for (let c = 0; c < count; c++) out.push({ birth, seed: 1_000_003 + b * 97 + c * 7, strength: 1 });
    }
  }
  return out;
}

/** 単位図形のパスはキャッシュして使い回す */
const SHAPES: Partial<Record<Variant, Path2D>> = {};
function shape(v: "heart" | "star" | "paw"): Path2D {
  let p = SHAPES[v];
  if (!p) {
    p = new Path2D();
    if (v === "heart") heartPath(p);
    else if (v === "star") starPath(p);
    else pawPath(p);
    SHAPES[v] = p;
  }
  return p;
}

/**
 * 描画: 画面に落ちて広がる水滴の波紋。種類で ハート・花火・星型・猫の手 に変わる。
 */
export const drops: VisualizerPlugin = {
  ...dropsMeta,
  create() {
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const variant = str(p, "variant", "ripple") as Variant;
        const life = num(p, "life", 1.6);
        const audio = num(p, "audio", 0.5);
        const base = Math.min(W, H) * 0.07 * num(p, "size", 1);
        const color = str(p, "color", "#8fd8ff");
        const colorful = num(p, "colorful", 0.3);
        const glow = num(p, "glow", 0.5);
        const bright = 0.75 + f.rms * 0.5 * audio;
        const list = liveDrops(t, num(p, "rate", 3), life, audio, f.beatIndex, f.sinceBeat, f.bpm);
        if (list.length === 0) return;

        ctx.save();
        for (const d of list) {
          const a = (t - d.birth) / life; // 0 → 1
          const h = (k: number) => hash01(d.seed * 17 + k);
          const x = W * (0.06 + h(1) * 0.88);
          const y = H * (0.06 + h(2) * 0.88);
          const size = base * (0.6 + h(3) * 0.8) * d.strength;
          const col = h(4) < colorful ? `hsl(${Math.floor(h(5) * HUE_BUCKETS) * (360 / HUE_BUCKETS)} 90% 68%)` : color;
          const fade = Math.pow(1 - a, 1.4) * bright;

          if (glow > 0 && variant !== "paw") {
            const g = size * (variant === "firework" ? 2.2 : 1.4) * (a < 0.15 ? 1.4 : 1);
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = Math.min(1, glow * fade * (a < 0.15 ? 0.9 : 0.4));
            ctx.drawImage(sprites.tintedGlow(col), x - g, y - g, g * 2, g * 2);
          }

          switch (variant) {
            case "ripple": {
              ctx.globalCompositeOperation = "lighter";
              ctx.strokeStyle = col;
              for (const [lag, w] of [
                [0, 1],
                [0.18, 0.6],
                [0.36, 0.35],
              ] as const) {
                const aa = a - lag;
                if (aa <= 0) continue;
                const r = size * (0.15 + easeOut(aa) * 1.9);
                ctx.globalAlpha = Math.min(1, Math.pow(1 - aa, 1.6) * bright * w);
                ctx.lineWidth = Math.max(1, size * 0.06 * (1 - aa) + 1);
                ctx.beginPath();
                ctx.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2);
                ctx.stroke();
              }
              if (a < 0.12) {
                ctx.globalAlpha = (1 - a / 0.12) * bright;
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(x, y, size * 0.08, 0, Math.PI * 2);
                ctx.fill();
              }
              break;
            }
            case "heart":
            case "star": {
              const sc = size * (0.35 + easeOut(Math.min(1, a * 1.6)) * (variant === "heart" ? 0.85 : 1));
              ctx.save();
              ctx.translate(x, y - (variant === "heart" ? a * size * 1.2 : 0));
              ctx.rotate(variant === "star" ? (h(6) - 0.5) + a * 2.2 : (h(6) - 0.5) * 0.5 + Math.sin(a * 9) * 0.06);
              ctx.scale(sc, sc);
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = Math.min(1, fade * 0.45);
              ctx.fillStyle = col;
              ctx.fill(shape(variant));
              ctx.globalAlpha = Math.min(1, fade);
              ctx.strokeStyle = col;
              ctx.lineWidth = 2.4 / sc;
              ctx.lineJoin = "round";
              ctx.stroke(shape(variant));
              ctx.restore();
              break;
            }
            case "paw": {
              // スタンプ: 押した瞬間に少し大きく、後半で薄くなる
              const pop = a < 0.08 ? 1.25 - (a / 0.08) * 0.25 : 1;
              const alpha = a < 0.55 ? 0.9 : 0.9 * ((1 - a) / 0.45);
              const sc = size * 0.95 * pop;
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate((h(6) - 0.5) * 1.2);
              ctx.scale(sc, sc);
              ctx.globalCompositeOperation = "source-over";
              if (glow > 0) {
                ctx.globalAlpha = alpha * glow * 0.5;
                ctx.drawImage(sprites.tintedGlow(col), -1.1, -1.1, 2.2, 2.2);
              }
              ctx.globalAlpha = alpha * bright;
              ctx.fillStyle = col;
              ctx.fill(shape("paw"));
              ctx.restore();
              break;
            }
            case "firework": {
              ctx.globalCompositeOperation = "lighter";
              ctx.lineCap = "round";
              const v = size * 3.4;
              const pos = (aa: number, i: number) => {
                const ang = (i / FIREWORK_SPARKS) * Math.PI * 2 + (h(10 + i) - 0.5) * 0.25;
                const sp = v * (0.75 + h(50 + i) * 0.5);
                const dist = sp * (1 - Math.exp(-aa * 3.2));
                return [x + Math.cos(ang) * dist, y + Math.sin(ang) * dist + aa * aa * size * 1.6] as const;
              };
              const tw = a > 0.6 ? 0.55 + 0.45 * Math.sin((t + d.seed) * 40) : 1;
              for (let i = 0; i < FIREWORK_SPARKS; i++) {
                const [x1, y1] = pos(a, i);
                const [x0, y0] = pos(Math.max(0, a - 0.08), i);
                ctx.globalAlpha = Math.min(1, fade * tw);
                ctx.strokeStyle = i % 3 === 0 ? "#ffffff" : col;
                ctx.lineWidth = Math.max(1, size * 0.05 * (1 - a) + 1);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
              }
              break;
            }
          }
        }
        ctx.restore();
      },
    };
  },
};
