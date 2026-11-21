import { atmosphereMeta, rainMeta, snowMeta, sparkleMeta, spaceMeta, starrySkyMeta } from "./catalog";
import { hash01, mulberry32 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

/**
 * 環境演出（宇宙空間・きらきら・空気感・雨・雪）。
 * どの粒も「番号と時刻 t」だけから位置・明るさを計算する（状態を持たない）。
 * そのためシークしても破綻せず、プレビューと書き出しが必ず一致する。
 */

/** 0..1 の乱数表（番号 i・項目 k で引く）。生成は 1 回だけ */
function table(count: number, fields: number, seed: number): (i: number, k: number) => number {
  const rnd = mulberry32(seed);
  const t = new Float32Array(count * fields);
  for (let i = 0; i < t.length; i++) t[i] = rnd();
  return (i, k) => t[(i % count) * fields + k];
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ------------------------------------------------------------------ 宇宙空間

const MAX_STARS = 3000;
/** 星の奥行きの範囲（near で画面の外へ抜ける） */
const Z_FAR = 1;
const Z_NEAR = 0.02;

/**
 * 宇宙空間: 3D 空間の星へ向かって進む（スターフィールド）。
 * 進んだ距離 = 時刻 × 速さ なので状態を持たず、シーク・書き出しでも同じ映像になる。
 * ビートでは位置ではなく「光の筋の長さと明るさ」を伸ばしてワープ感を出す（位置が飛ばない）。
 */
export const space: VisualizerPlugin = {
  ...spaceMeta,
  create() {
    const R = table(MAX_STARS, 4, 101);
    let nebula: OffscreenCanvas | null = null;
    let nebKey = "";
    // 各星の線を明るさの段階ごとにまとめて描く
    const LEVELS = 5;
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const n = Math.min(MAX_STARS, Math.round(num(p, "stars", 1400)));
        const speed = num(p, "speed", 1) * 0.12;
        const warp = num(p, "warp", 0.6);
        const streak = num(p, "streak", 0.35);
        const cx = W * num(p, "cx", 0.5);
        const cy = H * num(p, "cy", 0.5);
        const focal = Math.max(W, H) * 0.5;
        const s = H / 1080;

        // 背景を宇宙の暗さに寄せる
        const darken = num(p, "darken", 0.75);
        if (darken > 0) {
          ctx.globalAlpha = darken;
          ctx.fillStyle = "#010208";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }

        // 遠くの星雲（ほぼ動かない遠景。ゆっくり回転し、低音でわずかに明るく）
        const nebAmt = num(p, "nebula", 0.3);
        const ca = str(p, "hueA", "#5b2cff");
        const cb = str(p, "hueB", "#1f8fff");
        if (nebAmt > 0) {
          const key = `${W}x${H}:${ca}:${cb}`;
          if (key !== nebKey) {
            nebKey = key;
            nebula = new OffscreenCanvas(Math.ceil(W / 4), Math.ceil(H / 4));
            const g = nebula.getContext("2d")!;
            g.globalCompositeOperation = "lighter";
            const rnd = mulberry32(7);
            const [ar, ag, ab] = hexToRgb(ca);
            const [br, bg, bb] = hexToRgb(cb);
            for (let i = 0; i < 18; i++) {
              const x = (0.1 + rnd() * 0.8) * nebula.width;
              const y = (0.1 + rnd() * 0.8) * nebula.height;
              const r = (0.15 + rnd() * 0.3) * Math.max(nebula.width, nebula.height);
              const m = rnd();
              const col = `rgba(${Math.round(ar + (br - ar) * m)},${Math.round(ag + (bg - ag) * m)},${Math.round(ab + (bb - ab) * m)},`;
              const gr = g.createRadialGradient(x, y, 0, x, y, r);
              gr.addColorStop(0, `${col}${0.18 + rnd() * 0.15})`);
              gr.addColorStop(0.55, `${col}${0.04 + rnd() * 0.04})`);
              gr.addColorStop(1, `${col}0)`);
              g.fillStyle = gr;
              g.fillRect(0, 0, nebula.width, nebula.height);
            }
          }
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.min(1, nebAmt * (0.7 + f.bass * 0.3));
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.004);
          ctx.scale(1.3, 1.3);
          ctx.drawImage(nebula!, -W / 2, -H / 2, W, H);
          ctx.restore();
        }

        // 星（3D → 2D 投影）。筋の長さ = 前の奥行き位置からの移動ぶん
        const traveled = t * speed;
        const boost = 1 + warp * (f.kick * 5 + f.bass * 1.5);
        const tail = (0.006 + streak * 0.05) * boost;
        const paths: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
        const dots: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
        for (let i = 0; i < n; i++) {
          // 星の横方向の位置（中心付近が空きすぎないよう半径で分布）
          const ang = R(i, 0) * Math.PI * 2;
          const rad = 0.04 + Math.sqrt(R(i, 1)) * 1.6;
          const x = Math.cos(ang) * rad;
          const y = Math.sin(ang) * rad;
          const z = Z_NEAR + mod(R(i, 2) * (Z_FAR - Z_NEAR) - traveled, Z_FAR - Z_NEAR);
          const sx = cx + (x / z) * focal * 0.25;
          const sy = cy + (y / z) * focal * 0.25;
          if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
          const z2 = Math.min(Z_FAR, z + tail);
          const tx = cx + (x / z2) * focal * 0.25;
          const ty = cy + (y / z2) * focal * 0.25;
          // 近いほど明るい。現れた直後（奥）は暗く
          const near = 1 - (z - Z_NEAR) / (Z_FAR - Z_NEAR);
          const appear = Math.min(1, (Z_FAR - z) / 0.15);
          const b = Math.min(1, near * near * 1.3 + 0.08) * appear * (0.7 + R(i, 3) * 0.3);
          const lv = Math.min(LEVELS - 1, Math.floor(b * LEVELS));
          if (Math.hypot(sx - tx, sy - ty) < 1.2) dots[lv].rect(sx, sy, 1.4 * s, 1.4 * s);
          else {
            paths[lv].moveTo(tx, ty);
            paths[lv].lineTo(sx, sy);
          }
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let lv = 0; lv < LEVELS; lv++) {
          const a = (lv + 1) / LEVELS;
          ctx.globalAlpha = Math.min(1, 0.15 + a * 0.85);
          ctx.strokeStyle = lv >= LEVELS - 2 ? "#ffffff" : "#cfe0ff";
          ctx.lineWidth = (0.7 + a * 2.6) * s;
          ctx.stroke(paths[lv]);
          ctx.fillStyle = "#dfe9ff";
          ctx.fill(dots[lv]);
        }
        // 進む先の淡い光（ワープで強く）
        const g = Math.min(W, H) * (0.12 + warp * f.kick * 0.25);
        ctx.globalAlpha = 0.15 + warp * f.kick * 0.5;
        ctx.drawImage(sprites.tintedGlow("#9fc4ff"), cx - g, cy - g, g * 2, g * 2);
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ 星空（以前の「宇宙空間」）

const MAX_SKY_STARS = 2000;

export const starrySky: VisualizerPlugin = {
  ...starrySkyMeta,
  create() {
    const R = table(MAX_SKY_STARS, 6, 101);
    let nebula: OffscreenCanvas | null = null;
    let nebKey = "";
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const n = Math.min(MAX_SKY_STARS, Math.round(num(p, "stars", 900)));
        const drift = num(p, "drift", 0.25);
        const s = H / 1080;
        const starSize = num(p, "starSize", 1);

        // 背景を宇宙の暗さに寄せる
        const darken = num(p, "darken", 0.55);
        if (darken > 0) {
          ctx.globalAlpha = darken;
          ctx.fillStyle = "#03040c";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }

        // 星雲（1/4 解像度で一度だけ作り、拡大して重ねる）
        const nebAmt = num(p, "nebula", 0.6);
        const ca = str(p, "hueA", "#7b3cff");
        const cb = str(p, "hueB", "#1fa8ff");
        if (nebAmt > 0) {
          const key = `${W}x${H}:${ca}:${cb}`;
          if (key !== nebKey) {
            nebKey = key;
            nebula = new OffscreenCanvas(Math.ceil(W / 4), Math.ceil(H / 4));
            const g = nebula.getContext("2d")!;
            g.globalCompositeOperation = "lighter";
            const rnd = mulberry32(7);
            const [ar, ag, ab] = hexToRgb(ca);
            const [br, bg, bb] = hexToRgb(cb);
            for (let i = 0; i < 22; i++) {
              const x = (0.15 + rnd() * 0.7) * nebula.width;
              const y = (0.15 + rnd() * 0.7) * nebula.height;
              const r = (0.12 + rnd() * 0.3) * Math.max(nebula.width, nebula.height);
              const m = rnd();
              const col = `rgba(${Math.round(ar + (br - ar) * m)},${Math.round(ag + (bg - ag) * m)},${Math.round(ab + (bb - ab) * m)},`;
              const gr = g.createRadialGradient(x, y, 0, x, y, r);
              gr.addColorStop(0, `${col}${0.22 + rnd() * 0.2})`);
              gr.addColorStop(0.5, `${col}${0.06 + rnd() * 0.06})`);
              gr.addColorStop(1, `${col}0)`);
              g.fillStyle = gr;
              g.fillRect(0, 0, nebula.width, nebula.height);
            }
          }
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = Math.min(1, nebAmt * (0.55 + f.bass * 0.45));
          ctx.translate(W / 2 + Math.sin(t * 0.03) * W * 0.03, H / 2 + Math.cos(t * 0.021) * H * 0.03);
          ctx.rotate(t * drift * 0.006);
          ctx.scale(1.25 + f.bass * 0.04, 1.25 + f.bass * 0.04);
          ctx.drawImage(nebula!, -W / 2, -H / 2, W, H);
          ctx.restore();
        }

        // 星（明るさ 4 段階ごとに 1 パスで描く）
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffffff";
        const twinkleBoost = 1 + f.high * 0.6;
        for (let level = 0; level < 4; level++) {
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const depth = 0.2 + R(i, 2) * 0.8;
            const tw = 0.6 + 0.4 * Math.sin(t * (1 + R(i, 3) * 4) + R(i, 4) * 6.283);
            const b = Math.min(1, depth * depth * tw * twinkleBoost);
            if (Math.min(3, Math.floor(b * 4)) !== level) continue;
            const x = mod(R(i, 0) - t * drift * 0.012 * depth, 1) * W;
            const y = R(i, 1) * H;
            const size = (0.8 + depth * 1.8) * s * starSize;
            ctx.rect(x, y, size, size);
          }
          ctx.globalAlpha = 0.2 + level * 0.25;
          ctx.fill();
        }
        // 明るい星だけ光のにじみを付ける
        for (let i = 0; i < n; i++) {
          if (R(i, 5) > 0.03) continue;
          const depth = 0.2 + R(i, 2) * 0.8;
          const tw = 0.5 + 0.5 * Math.sin(t * (1 + R(i, 3) * 3) + R(i, 4) * 6.283);
          const x = mod(R(i, 0) - t * drift * 0.012 * depth, 1) * W;
          const y = R(i, 1) * H;
          const g = (10 + 18 * depth) * s * starSize * (0.8 + tw * 0.4 + f.kick * 0.3);
          ctx.globalAlpha = 0.35 + tw * 0.5;
          ctx.drawImage(sprites.tintedGlow(R(i, 4) < 0.5 ? "#bcd4ff" : "#ffe7c2"), x - g, y - g, g * 2, g * 2);
        }

        // 流れ星（5 秒ごとの区間で、出るか・いつ・どこかが決まる）
        if (p.meteors !== false) {
          const win = Math.floor(t / 5);
          for (const k of [win - 1, win]) {
            if (hash01(k * 31 + 3) > 0.65) continue;
            const start = k * 5 + hash01(k * 31 + 5) * 4;
            const age = t - start;
            if (age < 0 || age > 0.9) continue;
            const x0 = (0.3 + hash01(k * 31 + 7) * 0.7) * W;
            const y0 = hash01(k * 31 + 11) * H * 0.4;
            const dir = Math.PI * (0.75 + hash01(k * 31 + 13) * 0.12);
            const dist = age * Math.max(W, H) * 0.9;
            const hx = x0 + Math.cos(dir) * dist;
            const hy = y0 + Math.sin(dir) * dist;
            const tail = 220 * s;
            const fade = Math.sin((age / 0.9) * Math.PI);
            const grad = ctx.createLinearGradient(hx, hy, hx - Math.cos(dir) * tail, hy - Math.sin(dir) * tail);
            grad.addColorStop(0, "rgba(255,255,255,0.95)");
            grad.addColorStop(1, "rgba(160,200,255,0)");
            ctx.globalAlpha = fade;
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.5 * s;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx - Math.cos(dir) * tail, hy - Math.sin(dir) * tail);
            ctx.stroke();
            const hg = 14 * s;
            ctx.drawImage(sprites.glow, hx - hg, hy - hg, hg * 2, hg * 2);
          }
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ きらきら

const MAX_SPARKLES = 400;
const BURST_LIFE = 0.7;

export const sparkle: VisualizerPlugin = {
  ...sparkleMeta,
  create() {
    const R = table(MAX_SPARKLES, 4, 202);
    let palette: string[] = [];
    let palKey = "";
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const n = Math.round(num(p, "count", 140));
        const size = num(p, "size", 1) * (H / 1080);
        const color = str(p, "color", "#fff3c4");
        const tint = num(p, "tint", 0.4);
        const area = num(p, "area", 1);
        const pk = `${color}:${tint}`;
        if (pk !== palKey) {
          palKey = pk;
          palette = [color, "#ffffff", color];
          for (let k = 0; k < 5; k++) palette.push(`hsl(${(k * 72 + 30) % 360} ${Math.round(tint * 90)}% 82%)`);
        }
        const top = H * (1 - area);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffffff";
        const draw = (x: number, y: number, b: number, col: string) => {
          if (b < 0.02) return;
          const g = size * (8 + 22 * b);
          ctx.globalAlpha = Math.min(1, b);
          ctx.drawImage(sprites.tintedGlow(col), x - g, y - g, g * 2, g * 2);
          if (b > 0.35) {
            // 十字の光芒
            const len = size * (10 + 34 * b);
            const th = Math.max(1, size * 1.4);
            ctx.globalAlpha = Math.min(1, b * 0.9);
            ctx.fillRect(x - len, y - th / 2, len * 2, th);
            ctx.fillRect(x - th / 2, y - len, th, len * 2);
          }
        };

        // 常にまたたく粒（1 周期ごとに場所が変わる）
        const boost = 1 + f.high * 0.8 + f.kick * 0.4;
        for (let i = 0; i < n; i++) {
          const rate = 0.25 + R(i, 0) * 0.8;
          const cyc = t * rate + R(i, 1);
          const idx = Math.floor(cyc);
          const ph = cyc - idx;
          const b = Math.pow(Math.sin(Math.PI * ph), 4) * boost * (0.5 + R(i, 2) * 0.5);
          const seed = i * 7919 + idx * 104729;
          const x = hash01(seed) * W;
          const y = top + hash01(seed + 1) * (H - top);
          draw(x, y, b, palette[Math.floor(R(i, 3) * palette.length)]);
        }

        // ビートではじける粒
        const burst = Math.round(num(p, "burst", 18) * frame.beatSens);
        if (burst > 0 && f.beatIndex >= 0 && f.sinceBeat < BURST_LIFE) {
          const age = f.sinceBeat / BURST_LIFE;
          const cx = hash01(f.beatIndex * 13 + 1) * W;
          const cy = top + hash01(f.beatIndex * 13 + 2) * (H - top);
          const count = Math.round(burst * (0.5 + f.onset * 0.5));
          for (let k = 0; k < count; k++) {
            const a = hash01(f.beatIndex * 977 + k * 3) * Math.PI * 2;
            const sp = (0.05 + hash01(f.beatIndex * 977 + k * 3 + 1) * 0.18) * Math.min(W, H);
            const x = cx + Math.cos(a) * sp * Math.sqrt(age);
            const y = cy + Math.sin(a) * sp * Math.sqrt(age) + age * age * 40 * size;
            const tw = 0.6 + 0.4 * Math.sin((t + k) * 30);
            draw(x, y, (1 - age) * (1 - age) * tw * 1.2, palette[k % palette.length]);
          }
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ 空気感

const MAX_DUST = 300;
const MAX_BOKEH = 40;

function makeBokehSprite(color: string): OffscreenCanvas {
  const c = new OffscreenCanvas(128, 128);
  const g = c.getContext("2d")!;
  const [r, gg, b] = hexToRgb(color);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${gg},${b},0.35)`);
  gr.addColorStop(0.82, `rgba(${r},${gg},${b},0.5)`);
  gr.addColorStop(0.92, `rgba(${r},${gg},${b},0.75)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export const atmosphere: VisualizerPlugin = {
  ...atmosphereMeta,
  create() {
    const D = table(MAX_DUST, 5, 303);
    const B = table(MAX_BOKEH, 5, 404);
    let bokehSprite: OffscreenCanvas | null = null;
    let bokehColor = "";
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const s = H / 1080;
        const color = str(p, "color", "#ffd9a0");
        const [cr, cg, cb] = hexToRgb(color);
        const ang = (num(p, "angle", 25) * Math.PI) / 180;
        const breathe = 0.75 + f.rms * 0.5;
        // 光源（画面上端の外）
        const sx = W * 0.5 - Math.tan(ang) * H * 0.6;
        const sy = -H * 0.25;

        ctx.save();
        // もや
        const haze = num(p, "haze", 0.35);
        if (haze > 0) {
          const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.hypot(W, H) * 1.1);
          gr.addColorStop(0, `rgba(${cr},${cg},${cb},${0.55 * haze * breathe})`);
          gr.addColorStop(0.6, `rgba(${cr},${cg},${cb},${0.14 * haze * breathe})`);
          gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, W, H);
        }

        // 光の筋（ゆっくり揺れる 7 本）
        const rays = num(p, "rays", 0.5);
        if (rays > 0) {
          ctx.globalCompositeOperation = "lighter";
          const len = Math.hypot(W, H) * 1.4;
          for (let i = 0; i < 7; i++) {
            const base = ang + (i - 3) * 0.075 + Math.sin(t * 0.15 + i * 1.7) * 0.02;
            const width = (0.012 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.23 + i * 2.1))) * (1 + f.bass * 0.3);
            const a0 = Math.PI / 2 - base - width;
            const a1 = Math.PI / 2 - base + width;
            const gr = ctx.createLinearGradient(sx, sy, sx + Math.cos(Math.PI / 2 - base) * len, sy + Math.sin(Math.PI / 2 - base) * len);
            const a = rays * 0.32 * breathe * (0.6 + 0.4 * Math.sin(t * 0.31 + i));
            gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
            gr.addColorStop(0.7, `rgba(${cr},${cg},${cb},${a * 0.35})`);
            gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(a0) * len, sy + Math.sin(a0) * len);
            ctx.lineTo(sx + Math.cos(a1) * len, sy + Math.sin(a1) * len);
            ctx.closePath();
            ctx.fill();
          }
        }

        // ボケ玉（大きくゆっくり）
        const nb = Math.round(num(p, "bokeh", 14));
        if (nb > 0) {
          if (bokehColor !== color) {
            bokehColor = color;
            bokehSprite = makeBokehSprite(color);
          }
          ctx.globalCompositeOperation = "lighter";
          for (let i = 0; i < nb; i++) {
            const x = mod(B(i, 0) + t * (0.004 + B(i, 3) * 0.006), 1.2) * W - W * 0.1;
            const y = (B(i, 1) + Math.sin(t * 0.2 + B(i, 4) * 6.28) * 0.03) * H;
            const r = (30 + B(i, 2) * 80) * s * (1 + f.bass * 0.12);
            ctx.globalAlpha = (0.14 + B(i, 3) * 0.2) * breathe;
            ctx.drawImage(bokehSprite!, x - r, y - r, r * 2, r * 2);
          }
        }

        // 塵（ゆっくり上へ漂う）
        const nd = Math.min(MAX_DUST, Math.round(num(p, "dust", 120)));
        if (nd > 0) {
          ctx.globalCompositeOperation = "lighter";
          const glow = sprites.tintedGlow(color);
          for (let i = 0; i < nd; i++) {
            const x = mod(D(i, 0) + Math.sin(t * (0.1 + D(i, 3) * 0.2) + D(i, 4) * 6.28) * 0.02 + t * 0.003, 1) * W;
            const y = mod(D(i, 1) - t * (0.004 + D(i, 2) * 0.01), 1) * H;
            const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + D(i, 3) * 2) + D(i, 4) * 6.28);
            const g = (5 + D(i, 2) * 9) * s;
            ctx.globalAlpha = (0.25 + tw * 0.6) * breathe;
            ctx.drawImage(glow, x - g, y - g, g * 2, g * 2);
          }
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ 雨

const MAX_DROPS = 1500;
/** 奥・中・手前の 3 層（割合・長さ・太さ・不透明度・速さ） */
const RAIN_LAYERS = [
  { share: 0.6, len: 26, width: 1.4, alpha: 0.4, speed: 1.3 },
  { share: 0.3, len: 46, width: 2.2, alpha: 0.6, speed: 1.9 },
  { share: 0.1, len: 80, width: 3.4, alpha: 0.75, speed: 2.6 },
];

export const rain: VisualizerPlugin = {
  ...rainMeta,
  create() {
    const R = table(MAX_DROPS, 3, 505);
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f } = frame;
        const s = H / 1080;
        const n = Math.min(MAX_DROPS, Math.round(num(p, "amount", 600)));
        const speed = num(p, "speed", 1);
        const wind = (num(p, "wind", 12) * Math.PI) / 180;
        const color = str(p, "color", "#bcd6ff");
        const gloom = num(p, "gloom", 0.2);
        const splash = num(p, "splash", 0.6);
        const tanW = Math.tan(wind);
        const intensity = 0.75 + f.bass * 0.5;

        ctx.save();
        if (gloom > 0) {
          ctx.globalAlpha = gloom;
          ctx.fillStyle = "#0a0e18";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        let offset = 0;
        RAIN_LAYERS.forEach((L, li) => {
          const count = Math.round(n * L.share);
          const ground = H * (0.86 + li * 0.06);
          const v = H * L.speed * speed; // px/秒
          const span = ground + H * 0.15; // 1 周の落下距離（画面上の外から地面まで）
          const len = L.len * s * intensity;
          ctx.beginPath();
          const splashes: [number, number, number][] = [];
          for (let k = 0; k < count; k++) {
            const i = offset + k;
            const vv = v * (0.85 + R(i, 2) * 0.3);
            const dist = mod(R(i, 1) * span + t * vv, span + vv * 0.3); // 地面の後 0.3 秒はしぶきの時間
            const y = dist - H * 0.15;
            const x = mod(R(i, 0) * (W + H) + y * tanW, W + H * Math.abs(tanW) + 1) - H * Math.max(0, tanW);
            if (y < ground) {
              ctx.moveTo(x, y);
              ctx.lineTo(x - tanW * len, y - len);
            } else if (li > 0 && splash > 0) {
              splashes.push([x - (y - ground) * tanW, ground, (y - ground) / vv]);
            }
          }
          ctx.globalAlpha = L.alpha * intensity;
          ctx.lineWidth = L.width * s;
          ctx.stroke();
          // しぶき（地面で広がる楕円）
          if (splashes.length) {
            ctx.beginPath();
            for (const [x, y, age] of splashes) {
              const a = age / 0.3;
              const rx = (4 + a * 26) * s * (li === 2 ? 1.6 : 1);
              ctx.moveTo(x + rx, y);
              ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
            }
            ctx.globalAlpha = splash * 0.35;
            ctx.lineWidth = 1.2 * s;
            ctx.stroke();
          }
          offset += count;
        });
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ 雪

const MAX_FLAKES = 1200;
const SNOW_LAYERS = [
  { share: 0.55, size: 3, speed: 0.5, alpha: 0.6, blur: false },
  { share: 0.33, size: 5.5, speed: 0.8, alpha: 0.85, blur: false },
  { share: 0.12, size: 14, speed: 1.25, alpha: 0.5, blur: true },
];

export const snow: VisualizerPlugin = {
  ...snowMeta,
  create() {
    const R = table(MAX_FLAKES, 5, 606);
    let flake: OffscreenCanvas | null = null;
    let flakeColor = "";
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const s = (H / 1080) * num(p, "size", 1);
        const n = Math.min(MAX_FLAKES, Math.round(num(p, "amount", 350)));
        const speed = num(p, "speed", 0.5);
        const wind = num(p, "wind", 0.15);
        const sway = num(p, "sway", 0.5);
        const color = str(p, "color", "#ffffff");
        if (color !== flakeColor) {
          // くっきりした雪片（中心が明るく、縁がやわらかい）
          flakeColor = color;
          flake = new OffscreenCanvas(32, 32);
          const g = flake.getContext("2d")!;
          const [r, gg, b] = hexToRgb(color);
          const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
          gr.addColorStop(0.45, `rgba(${r},${gg},${b},0.85)`);
          gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
          g.fillStyle = gr;
          g.fillRect(0, 0, 32, 32);
        }
        const soft = sprites.tintedGlow(color);
        ctx.save();
        let offset = 0;
        SNOW_LAYERS.forEach((L) => {
          const count = Math.round(n * L.share);
          const v = H * 0.12 * L.speed * speed * 2;
          ctx.globalAlpha = Math.min(1, L.alpha * (0.9 + f.kick * 0.2));
          for (let k = 0; k < count; k++) {
            const i = offset + k;
            const span = H * 1.1;
            const y = mod(R(i, 1) * span + t * v * (0.8 + R(i, 2) * 0.4), span) - H * 0.05;
            const swing = Math.sin(t * (0.5 + R(i, 3)) + R(i, 4) * 6.283) * sway * 40 * s * L.speed;
            const x = mod(R(i, 0) * W + t * wind * v * 0.8 + swing, W + 40 * s) - 20 * s;
            const size = L.size * s * (0.7 + R(i, 2) * 0.6);
            if (L.blur) ctx.drawImage(soft, x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2);
            else ctx.drawImage(flake!, x - size, y - size, size * 2, size * 2);
          }
          offset += count;
        });
        ctx.restore();
      },
    };
  },
};
