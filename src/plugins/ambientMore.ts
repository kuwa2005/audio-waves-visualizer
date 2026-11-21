import { bubblesMeta, laserMeta, sakuraMeta } from "./catalog";
import { hash01, mulberry32 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

const mod = (a: number, m: number) => ((a % m) + m) % m;

function table(count: number, fields: number, seed: number): (i: number, k: number) => number {
  const rnd = mulberry32(seed);
  const t = new Float32Array(count * fields);
  for (let i = 0; i < t.length; i++) t[i] = rnd();
  return (i, k) => t[(i % count) * fields + k];
}

// ------------------------------------------------------------------ 桜吹雪

/** 花びら 1 枚の画像（先端に切れ込み、根元が濃い） */
function makePetal(color: string): OffscreenCanvas {
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d")!;
  g.translate(32, 34);
  g.beginPath();
  g.moveTo(0, 26);
  g.bezierCurveTo(-20, 14, -22, -14, -8, -26);
  g.lineTo(0, -18); // 切れ込み
  g.lineTo(8, -26);
  g.bezierCurveTo(22, -14, 20, 14, 0, 26);
  g.closePath();
  const gr = g.createLinearGradient(0, 26, 0, -26);
  gr.addColorStop(0, "#ff8fb1");
  gr.addColorStop(0.35, color);
  gr.addColorStop(1, "#fff4f7");
  g.fillStyle = gr;
  g.fill();
  g.globalAlpha = 0.35;
  g.strokeStyle = "#ffffff";
  g.lineWidth = 1.5;
  g.stroke();
  return c;
}

const MAX_PETALS = 500;

export const sakura: VisualizerPlugin = {
  ...sakuraMeta,
  create() {
    const R = table(MAX_PETALS, 7, 707);
    let petal: OffscreenCanvas | null = null;
    let petalColor = "";
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f } = frame;
        const n = Math.min(MAX_PETALS, Math.round(num(p, "amount", 140)));
        const size = num(p, "size", 1) * (H / 1080) * 34;
        const speed = num(p, "speed", 0.5);
        const wind = num(p, "wind", 0.35);
        const color = str(p, "color", "#ffc4d6");
        if (color !== petalColor) {
          petalColor = color;
          petal = makePetal(color);
        }
        ctx.save();
        for (let i = 0; i < n; i++) {
          const depth = 0.45 + R(i, 0) * 0.55; // 手前ほど大きく速い
          const v = H * 0.12 * speed * (0.6 + depth);
          const span = H * 1.15;
          const y = mod(R(i, 1) * span + t * v, span) - H * 0.08;
          const sway = Math.sin(t * (0.6 + R(i, 2) * 0.8) + R(i, 3) * 6.28) * 50 * depth * (H / 1080);
          const x = mod(R(i, 4) * W + t * wind * v * 0.9 + sway, W + 80) - 40;
          // 3D の回転を「横幅の伸縮＋傾き」で表す（くるくる回って見える）
          const spinA = t * (1.2 + R(i, 5) * 2.4) + R(i, 6) * 6.28;
          const s = size * depth;
          // setTransform は使わない（レイヤーの移動・拡大の変形を壊さないよう save/restore で囲む）
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(spinA * 0.35 + R(i, 3) * 6.28);
          ctx.scale(Math.max(0.15, Math.abs(Math.cos(spinA))) * (s / 32), (s / 32) * (0.9 + 0.1 * Math.sin(spinA)));
          ctx.globalAlpha = Math.min(1, 0.55 + depth * 0.45) * (0.9 + f.kick * 0.1);
          ctx.drawImage(petal!, -32, -32);
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ シャボン玉

function makeBubble(): OffscreenCanvas {
  const c = new OffscreenCanvas(128, 128);
  const g = c.getContext("2d")!;
  const cx = 64;
  // 虹色の膜（縁ほど濃い）
  const film = g.createConicGradient(0.8, cx, cx);
  ["#ff7ad9", "#ffe66b", "#7cffb2", "#6bd3ff", "#b48bff", "#ff7ad9"].forEach((col, i, a) => film.addColorStop(i / (a.length - 1), col));
  g.fillStyle = film;
  g.beginPath();
  g.arc(cx, cx, 60, 0, Math.PI * 2);
  g.fill();
  // 中央をくり抜いて縁だけ残す
  g.globalCompositeOperation = "destination-out";
  const hole = g.createRadialGradient(cx, cx, 0, cx, cx, 60);
  hole.addColorStop(0, "rgba(0,0,0,0.97)");
  hole.addColorStop(0.72, "rgba(0,0,0,0.85)");
  hole.addColorStop(0.95, "rgba(0,0,0,0.1)");
  hole.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = hole;
  g.fillRect(0, 0, 128, 128);
  // ハイライト
  g.globalCompositeOperation = "source-over";
  const hl = g.createRadialGradient(cx - 22, cx - 24, 0, cx - 22, cx - 24, 18);
  hl.addColorStop(0, "rgba(255,255,255,0.95)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cx, 59, 0, Math.PI * 2);
  g.stroke();
  return c;
}

const MAX_BUBBLES = 150;

export const bubbles: VisualizerPlugin = {
  ...bubblesMeta,
  create() {
    const R = table(MAX_BUBBLES, 6, 808);
    let sprite: OffscreenCanvas | null = null;
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f } = frame;
        if (!sprite) sprite = makeBubble();
        const n = Math.min(MAX_BUBBLES, Math.round(num(p, "amount", 40)));
        const base = num(p, "size", 1) * (H / 1080) * 60;
        const speed = num(p, "speed", 0.4);
        const shine = num(p, "shine", 0.7);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < n; i++) {
          const r = base * (0.4 + R(i, 0) * 0.9) * (1 + f.bass * 0.08);
          const v = H * 0.1 * speed * (0.6 + (1 - R(i, 0)) * 0.8); // 小さいほど速い
          const span = H + r * 4;
          const y = H + r * 2 - mod(R(i, 1) * span + t * v, span);
          const x = R(i, 2) * W + Math.sin(t * (0.5 + R(i, 3)) + R(i, 4) * 6.28) * 40 * (H / 1080);
          // 上に行くほど薄く（はじける前）
          const fadeTop = Math.min(1, Math.max(0, y / (H * 0.25)));
          const wob = 1 + 0.04 * Math.sin(t * 6 + i);
          ctx.globalAlpha = (0.35 + shine * 0.6) * fadeTop;
          ctx.drawImage(sprite, x - r * wob, y - r / wob, r * 2 * wob, (r * 2) / wob);
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ レーザーショー

const LASER_COLORS: Record<string, string[]> = {
  green: ["#39ff6a"],
  red: ["#ff2a3d"],
  blue: ["#2f7bff"],
  rainbow: ["#ff2a3d", "#ffb22a", "#39ff6a", "#2fe4ff", "#7b5bff", "#ff3df0"],
};

/** パターン（拍で切り替え）: 扇形・交差・スキャン */
export function laserAngle(pattern: number, i: number, count: number, t: number, speed: number, spread: number): number {
  const u = count === 1 ? 0 : i / (count - 1) - 0.5; // -0.5..0.5
  switch (pattern % 3) {
    case 0: // 扇形が開閉
      return u * spread * 2.2 * (0.6 + 0.4 * Math.sin(t * speed * 1.5));
    case 1: // 左右からの交差
      return (i % 2 === 0 ? 1 : -1) * spread * 0.9 * Math.sin(t * speed * 1.2 + u * 2);
    default: // 全体でスキャン
      return u * spread * 0.6 + Math.sin(t * speed * 2) * spread * 0.8;
  }
}

export const laser: VisualizerPlugin = {
  ...laserMeta,
  create() {
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f } = frame;
        const count = Math.round(num(p, "count", 10));
        const speed = num(p, "speed", 1);
        const spread = num(p, "spread", 0.7);
        const every = Math.max(1, Math.round(num(p, "every", 8)));
        const haze = num(p, "haze", 0.5);
        const cols = LASER_COLORS[str(p, "colors", "green")] ?? LASER_COLORS.green;
        const pattern = Math.max(0, Math.floor(Math.max(0, f.beatIndex) / every));
        const len = Math.hypot(W, H) * 1.2;
        const s = H / 1080;
        // 発射口: パターンごとに中央 1 か所 / 両端 2 か所
        const twin = pattern % 2 === 1;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < count; i++) {
          const ox = twin ? (i % 2 === 0 ? W * 0.12 : W * 0.88) : W / 2;
          const oy = H * 1.02;
          let a = laserAngle(pattern, i, count, t, speed, spread);
          if (twin) a += i % 2 === 0 ? 0.35 : -0.35;
          const dx = Math.sin(a);
          const dy = -Math.cos(a);
          const col = cols[(i + pattern) % cols.length];
          const inten = Math.min(1, 0.55 + f.kick * 0.45 + f.high * 0.2) * (0.85 + 0.15 * hash01(i + pattern * 31));
          const ex = ox + dx * len;
          const ey = oy + dy * len;
          // スモークで見える太い光
          if (haze > 0) {
            const gr = ctx.createLinearGradient(ox, oy, ex, ey);
            gr.addColorStop(0, col);
            gr.addColorStop(1, "rgba(0,0,0,0)");
            ctx.strokeStyle = gr;
            ctx.globalAlpha = haze * 0.22 * inten;
            ctx.lineWidth = 22 * s;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
          // 芯
          ctx.strokeStyle = col;
          ctx.globalAlpha = inten;
          ctx.lineWidth = 3 * s;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.strokeStyle = "#ffffff";
          ctx.globalAlpha = inten * 0.6;
          ctx.lineWidth = 1.2 * s;
          ctx.stroke();
        }
        // 発射口の光
        ctx.globalAlpha = 0.6 + f.kick * 0.4;
        const g = 90 * s;
        for (const ox of twin ? [W * 0.12, W * 0.88] : [W / 2]) ctx.drawImage(frame.sprites.tintedGlow(cols[0]), ox - g, H - g * 0.6, g * 2, g * 2);
        ctx.restore();
      },
    };
  },
};
