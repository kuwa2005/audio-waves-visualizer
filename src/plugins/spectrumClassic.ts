import { graphicEqMeta, lineSpectrumMeta } from "./catalog";
import { num, str, type VisualizerPlugin } from "./types";

/** ISO 1/3 オクターブ中心周波数（31 バンド） */
export const ISO_31 = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
/** 16 バンド（2/3 オクターブ間隔） */
export const BANDS_16 = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000, 20000];

/**
 * 中心周波数 fc・幅 widthOct（オクターブ）の帯域の RMS を dB にし、0..1 に変換する。
 * -54dB → 0, -6dB → 1（高域ほど振幅が小さいので少し持ち上げる）
 */
export function bandLevel(spec: Float32Array, sampleRate: number, fc: number, widthOct: number): number {
  const binHz = sampleRate / ((spec.length - 1) * 2);
  const lo = fc / Math.pow(2, widthOct / 2);
  const hi = fc * Math.pow(2, widthOct / 2);
  let from = Math.max(1, Math.floor(lo / binHz));
  let to = Math.min(spec.length - 1, Math.ceil(hi / binHz));
  if (to < from) [from, to] = [to, from];
  if (from === to) to = Math.min(spec.length - 1, from + 1);
  let sum = 0;
  for (let k = from; k < to; k++) sum += spec[k] * spec[k];
  const rms = Math.sqrt(sum / Math.max(1, to - from));
  const tilt = 1 + Math.log2(Math.max(1, fc / 500)) * 0.35;
  const db = 20 * Math.log10(rms * tilt + 1e-9);
  return Math.min(1, Math.max(0, (db + 54) / 48));
}

function hex(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * ライン: 対数周波数の滑らかな曲線（中点を通る二次曲線でつなぐ）。
 * 発光は太い半透明の線＋細い線の重ね描き（shadowBlur は使わない）。
 */
export const lineSpectrum: VisualizerPlugin = {
  ...lineSpectrumMeta,
  create() {
    let lv = new Float32Array(0);
    return {
      reset() {
        lv.fill(0);
      },
      render(ctx, frame, p) {
        const { width: W, height: H, features: f, dt } = frame;
        const n = Math.round(num(p, "points", 128));
        if (lv.length !== n) lv = new Float32Array(n);
        const spec = f.spectrum;
        const maxBin = Math.max(8, Math.floor(spec.length * 0.72));
        const fall = Math.exp(-dt * 8);
        for (let i = 0; i < n; i++) {
          const from = Math.max(1, Math.floor(Math.pow(maxBin, i / n)));
          const to = Math.max(from + 1, Math.floor(Math.pow(maxBin, (i + 1) / n)));
          let m = 0;
          for (let k = from; k < to; k++) if (spec[k] > m) m = spec[k];
          const v = Math.min(1, Math.pow(m * (1 + (i / n) * 1.8) * 3, 0.6));
          lv[i] = v > lv[i] ? v : lv[i] * fall + v * (1 - fall);
        }
        const base = H * num(p, "y", 0.7);
        const amp = H * num(p, "height", 0.35) * (1 + f.kick * 0.1);
        const mirror = p.mirror === true;
        const a = str(p, "colorA", "#ff4fd8");
        const b = str(p, "colorB", "#3ef2ff");
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, a);
        grad.addColorStop(1, b);

        const trace = (dir: 1 | -1) => {
          ctx.beginPath();
          ctx.moveTo(0, base - dir * lv[0] * amp);
          for (let i = 1; i < n; i++) {
            const x0 = ((i - 1) / (n - 1)) * W;
            const x1 = (i / (n - 1)) * W;
            const y0 = base - dir * lv[i - 1] * amp;
            const y1 = base - dir * lv[i] * amp;
            ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
          }
          ctx.lineTo(W, base - dir * lv[n - 1] * amp);
        };

        ctx.save();
        const fill = num(p, "fill", 0.35);
        const glow = num(p, "glow", 0.7);
        const th = num(p, "thickness", 4) * (H / 1080) * (1 + f.kick * 0.5);
        for (const dir of mirror ? ([1, -1] as const) : ([1] as const)) {
          if (fill > 0) {
            trace(dir);
            ctx.lineTo(W, base);
            ctx.lineTo(0, base);
            ctx.closePath();
            const fg = ctx.createLinearGradient(0, base - dir * amp, 0, base);
            const [r, g, bb] = hex(a);
            const [r2, g2, b2] = hex(b);
            fg.addColorStop(0, `rgba(${(r + r2) >> 1},${(g + g2) >> 1},${(bb + b2) >> 1},${fill})`);
            fg.addColorStop(1, `rgba(${(r + r2) >> 1},${(g + g2) >> 1},${(bb + b2) >> 1},0)`);
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = fg;
            ctx.fill();
          }
          ctx.globalCompositeOperation = "lighter";
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.strokeStyle = grad;
          if (glow > 0) {
            trace(dir);
            ctx.globalAlpha = glow * 0.18;
            ctx.lineWidth = th * 6;
            ctx.stroke();
            ctx.globalAlpha = glow * 0.35;
            ctx.lineWidth = th * 2.6;
            ctx.stroke();
          }
          trace(dir);
          ctx.globalAlpha = 1;
          ctx.lineWidth = th;
          ctx.stroke();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = Math.max(1, th * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  },
};

const LABELS: Record<number, string> = { 20: "20", 31.5: "31", 63: "63", 125: "125", 250: "250", 500: "500", 1000: "1k", 2000: "2k", 4000: "4k", 8000: "8k", 16000: "16k" };

/**
 * グライコ: LED の段で表示するグラフィックイコライザー。
 * 点灯中の段は色ゾーンごとに 1 パスにまとめて描く（バンド×段の矩形を 3〜5 回の fill で済ませる）。
 */
export const graphicEq: VisualizerPlugin = {
  ...graphicEqMeta,
  create() {
    let level = new Float32Array(0);
    let peak = new Float32Array(0);
    let peakHold = new Float32Array(0);
    return {
      reset() {
        level.fill(0);
        peak.fill(0);
        peakHold.fill(0);
      },
      render(ctx, frame, p) {
        const { width: W, height: H, features: f, dt, sampleRate } = frame;
        const centers = str(p, "bands", "31") === "16" ? BANDS_16 : ISO_31;
        const widthOct = centers === ISO_31 ? 1 / 3 : 2 / 3;
        const nb = centers.length;
        if (level.length !== nb) {
          level = new Float32Array(nb);
          peak = new Float32Array(nb);
          peakHold = new Float32Array(nb);
        }
        const segs = Math.round(num(p, "segments", 24));
        const fall = Math.exp(-dt * 10);
        for (let i = 0; i < nb; i++) {
          const v = bandLevel(f.spectrum, sampleRate, centers[i], widthOct);
          level[i] = v > level[i] ? v : level[i] * fall + v * (1 - fall);
          if (level[i] >= peak[i]) {
            peak[i] = level[i];
            peakHold[i] = 0.6; // 0.6 秒保持してから落ちる
          } else if (peakHold[i] > 0) {
            peakHold[i] -= dt;
          } else {
            peak[i] = Math.max(level[i], peak[i] - dt * 0.5);
          }
        }

        const w = W * num(p, "width", 0.7);
        const h = H * num(p, "height", 0.38);
        const bottom = H * num(p, "y", 0.9);
        const x0 = (W - w) / 2;
        const top = bottom - h;
        const colW = w / nb;
        const segH = h / segs;
        const gapX = Math.max(1, colW * 0.18);
        const gapY = Math.max(1, segH * 0.28);
        const pad = H * 0.03;
        const labels = p.labels !== false;

        ctx.save();
        // パネル（ガラス風の暗い背景と縁）
        const panel = num(p, "panel", 0.55);
        if (panel > 0) {
          ctx.globalAlpha = panel;
          ctx.fillStyle = "#06080d";
          ctx.beginPath();
          ctx.roundRect(x0 - pad, top - pad, w + pad * 2, h + pad * 2 + (labels ? H * 0.03 : 0), pad * 0.6);
          ctx.fill();
          ctx.globalAlpha = panel * 0.6;
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = Math.max(1, H / 900);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        const zoneOf = (s: number) => (s >= segs * 0.85 ? 2 : s >= segs * 0.6 ? 1 : 0);
        const colors = [str(p, "low", "#2dff9a"), str(p, "mid", "#ffd23f"), str(p, "high", "#ff3b5c")];
        const lit: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
        const dim = new Path2D();
        const peaks: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
        for (let i = 0; i < nb; i++) {
          const x = x0 + i * colW + gapX / 2;
          const on = Math.round(level[i] * segs);
          const pk = Math.min(segs - 1, Math.round(peak[i] * segs));
          for (let s = 0; s < segs; s++) {
            const y = bottom - (s + 1) * segH + gapY / 2;
            const r: [number, number, number, number] = [x, y, colW - gapX, segH - gapY];
            if (s < on) lit[zoneOf(s)].rect(...r);
            else if (s === pk && pk > 0) peaks[zoneOf(s)].rect(...r);
            else dim.rect(...r);
          }
        }
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = "#ffffff";
        ctx.fill(dim);
        ctx.globalCompositeOperation = "lighter";
        for (let z = 0; z < 3; z++) {
          ctx.fillStyle = colors[z];
          // 発光（太らせた同じ形を薄く重ねる代わりに、少し明るさを上げて 2 回塗る）
          ctx.globalAlpha = 0.95;
          ctx.fill(lit[z]);
          ctx.globalAlpha = 1;
          ctx.fill(peaks[z]);
        }
        // 全体のにじみ（ビートで強まる）
        ctx.globalAlpha = 0.18 + f.kick * 0.25;
        ctx.drawImage(frame.sprites.tintedGlow(colors[0]), x0 - w * 0.05, bottom - h * 0.5, w * 1.1, h * 0.9);

        if (labels) {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#cfd6e6";
          ctx.font = `${Math.round(H * 0.017)}px "JetBrains Mono", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          centers.forEach((fc, i) => {
            const label = LABELS[fc];
            if (label) ctx.fillText(label, x0 + (i + 0.5) * colW, bottom + H * 0.008);
          });
        }
        ctx.restore();
      },
    };
  },
};
