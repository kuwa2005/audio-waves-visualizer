import { oscilloscopeMeta, radialBarsMeta, spectrogramMeta } from "./catalog";
import { mixColor } from "./color";
import { num, str, type VisualizerPlugin } from "./types";

/** 対数周波数で n 本に分けた各区間の最大値（0..1、高域を持ち上げ） */
function logBands(spec: Float32Array, n: number, out: Float32Array, maxFrac = 0.7): void {
  const maxBin = Math.max(8, Math.floor(spec.length * maxFrac));
  for (let b = 0; b < n; b++) {
    const from = Math.max(1, Math.floor(Math.pow(maxBin, b / n)));
    const to = Math.max(from + 1, Math.floor(Math.pow(maxBin, (b + 1) / n)));
    let m = 0;
    for (let k = from; k < to; k++) if (spec[k] > m) m = spec[k];
    out[b] = Math.min(1, Math.pow(m * (1 + (b / n) * 1.8) * 3, 0.6));
  }
}

// ------------------------------------------------------------------ サークルバー

const HUE_BUCKETS = 24;

export const radialBars: VisualizerPlugin = {
  ...radialBarsMeta,
  create() {
    let lv = new Float32Array(0);
    let raw = new Float32Array(0);
    return {
      reset() {
        lv.fill(0);
      },
      render(ctx, frame, p) {
        const { width: W, height: H, features: f, dt, t } = frame;
        const n = Math.round(num(p, "bars", 120));
        const half = Math.ceil(n / 2);
        if (lv.length !== half) {
          lv = new Float32Array(half);
          raw = new Float32Array(half);
        }
        logBands(f.spectrum, half, raw);
        const fall = Math.exp(-dt * 9);
        for (let i = 0; i < half; i++) lv[i] = raw[i] > lv[i] ? raw[i] : lv[i] * fall + raw[i] * (1 - fall);

        const m = Math.min(W, H);
        const r0 = m * num(p, "radius", 0.2) * (1 + f.kick * 0.06);
        const len = m * num(p, "length", 0.2);
        const colorA = str(p, "colorA", "#22d3ee");
        const colorB = str(p, "colorB", "#c45bff");
        const cx = W / 2;
        const cy = H / 2;

        // 中央の画像（丸く切り抜いて回す）
        if (p.art !== false && frame.artwork) {
          const art = frame.artwork;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r0 * 0.92, 0, Math.PI * 2);
          ctx.clip();
          ctx.translate(cx, cy);
          ctx.rotate(t * num(p, "spin", 0.15));
          const sc = Math.max((r0 * 2) / art.width, (r0 * 2) / art.height) * (1 + f.bass * 0.05);
          ctx.drawImage(art, (-art.width * sc) / 2, (-art.height * sc) / 2, art.width * sc, art.height * sc);
          ctx.restore();
        }

        // バー（色相ごとに 1 パスでまとめる）。左右対称に並べる
        const paths = Array.from({ length: HUE_BUCKETS }, () => new Path2D());
        for (let i = 0; i < n; i++) {
          const k = i < half ? i : n - 1 - i;
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const l = 3 + lv[k] * len;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((k / half) * HUE_BUCKETS));
          paths[bucket].moveTo(cx + c * (r0 + 4), cy + s * (r0 + 4));
          paths[bucket].lineTo(cx + c * (r0 + 4 + l), cy + s * (r0 + 4 + l));
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        const lw = Math.max(2, ((Math.PI * 2 * r0) / n) * 0.55);
        for (let b = 0; b < HUE_BUCKETS; b++) {
          const col = mixColor(colorA, colorB, b / (HUE_BUCKETS - 1));
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = lw * 2.6;
          ctx.stroke(paths[b]);
          ctx.globalAlpha = 1;
          ctx.lineWidth = lw;
          ctx.stroke(paths[b]);
        }
        // 縁のリング
        ctx.globalAlpha = 0.7 + f.kick * 0.3;
        ctx.strokeStyle = colorA;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ オシロスコープ

/** 立ち上がりのゼロ交差に合わせて波形の表示位置を固定する（トリガー）。見つからなければ 0 */
export function triggerIndex(buf: Float32Array, searchLen: number): number {
  for (let i = 1; i < searchLen; i++) if (buf[i - 1] < 0 && buf[i] >= 0) return i;
  return 0;
}

export const oscilloscope: VisualizerPlugin = {
  ...oscilloscopeMeta,
  create() {
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, sampleRate } = frame;
        const cy = H * num(p, "y", 0.5);
        const amp = H * num(p, "height", 0.22);
        const winMs = num(p, "window", 30);
        const color = str(p, "color", "#5dff8f");
        const th = num(p, "thickness", 2.5) * (H / 1080);
        const ghosts = Math.round(num(p, "ghosts", 3));
        const show = Math.max(32, Math.round((winMs / 1000) * sampleRate));
        const COLS = Math.min(show, Math.round(W / 2));

        ctx.save();
        // 目盛り（計測器のグリッド）
        if (p.grid !== false) {
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i <= 10; i++) {
            const x = (W * i) / 10;
            ctx.moveTo(x, cy - amp * 1.1);
            ctx.lineTo(x, cy + amp * 1.1);
          }
          for (let j = -2; j <= 2; j++) {
            const y = cy + (amp * j) / 2;
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.lineJoin = "round";
        // 残像（過去の波形を薄く）→ 現在
        for (let g = ghosts; g >= 0; g--) {
          const buf = frame.waveformAt(t - g * 0.018, show * 2);
          const start = triggerIndex(buf, Math.min(buf.length - show, show));
          const path = new Path2D();
          for (let c = 0; c < COLS; c++) {
            const v = buf[start + Math.floor((c / COLS) * show)] ?? 0;
            const x = (c / (COLS - 1)) * W;
            const y = cy - Math.max(-1.2, Math.min(1.2, v * 1.6)) * amp;
            if (c === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
          }
          const fade = g === 0 ? 1 : 0.35 / g;
          ctx.globalAlpha = 0.25 * fade;
          ctx.lineWidth = th * 4;
          ctx.stroke(path);
          ctx.globalAlpha = fade;
          ctx.lineWidth = th;
          ctx.stroke(path);
        }
        ctx.restore();
      },
    };
  },
};

// ------------------------------------------------------------------ スペクトログラム

const COLS = 120;
const ROWS = 72;

/** 0..1 → RGB のカラーマップ（制御点を線形補間） */
const MAPS: Record<string, [number, number, number][]> = {
  inferno: [
    [0, 0, 4],
    [40, 11, 84],
    [101, 21, 110],
    [159, 42, 99],
    [212, 72, 66],
    [245, 125, 21],
    [250, 193, 39],
    [252, 255, 164],
  ],
  ocean: [
    [0, 0, 8],
    [8, 29, 88],
    [30, 90, 170],
    [60, 160, 220],
    [160, 220, 245],
    [255, 255, 255],
  ],
  neon: [
    [5, 0, 20],
    [80, 0, 140],
    [200, 30, 180],
    [255, 80, 160],
    [80, 230, 255],
    [220, 255, 255],
  ],
};

export function buildLut(name: string): Uint8Array {
  const stops = MAPS[name] ?? MAPS.inferno;
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(x));
    const f = x - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f);
  }
  return lut;
}

export const spectrogram: VisualizerPlugin = {
  ...spectrogramMeta,
  create() {
    const img = new ImageData(COLS, ROWS);
    const canvas = new OffscreenCanvas(COLS, ROWS);
    const g = canvas.getContext("2d")!;
    let lut = buildLut("inferno");
    let lutName = "inferno";
    const col = new Float32Array(ROWS);
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t } = frame;
        const pal = str(p, "palette", "inferno");
        if (pal !== lutName) {
          lutName = pal;
          lut = buildLut(pal);
        }
        const hist = num(p, "history", 5);
        // 右端 = 現在。列ごとに過去の時刻のスペクトルを求める（状態なし）
        for (let c = 0; c < COLS; c++) {
          const tt = t - ((COLS - 1 - c) / (COLS - 1)) * hist;
          logBands(frame.spectrumAt(tt), ROWS, col, 0.8);
          for (let r = 0; r < ROWS; r++) {
            const v = Math.min(255, Math.floor(col[r] * 255));
            const o = ((ROWS - 1 - r) * COLS + c) * 4; // 下が低音
            img.data[o] = lut[v * 3];
            img.data[o + 1] = lut[v * 3 + 1];
            img.data[o + 2] = lut[v * 3 + 2];
            img.data[o + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        const top = H * num(p, "top", 0.6);
        const bottom = H * num(p, "bottom", 1);
        ctx.save();
        ctx.globalAlpha = num(p, "opacity", 0.85);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, top, W, Math.max(1, bottom - top));
        ctx.restore();
      },
    };
  },
};
