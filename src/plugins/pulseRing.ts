import { pulseRingMeta } from "./catalog";
import { num, str, type VisualizerPlugin } from "./types";

type Wave = { born: number; strength: number };

/**
 * パルスリング: 円形スペクトラム＋ビートの衝撃波。
 * トゲは 1 本の Path にまとめて 1 回で stroke する（描画命令の発行数を抑える）。
 */
export const pulseRing: VisualizerPlugin = {
  ...pulseRingMeta,
  create() {
    let levels = new Float32Array(0);
    let waves: Wave[] = [];
    let lastBeat = -1;

    return {
      reset() {
        levels.fill(0);
        waves = [];
        lastBeat = -1;
      },
      render(ctx, frame, params) {
        const { width: W, height: H, features: f, dt, t, sprites } = frame;
        const n = Math.round(num(params, "spikes", 128));
        const base = Math.min(W, H) * num(params, "radius", 0.2);
        const len = Math.min(W, H) * num(params, "length", 0.22);
        const color = str(params, "color", "#22d3ee");
        const accent = str(params, "accent", "#f472b6");
        const shock = num(params, "shockwave", 0.8);
        const rot = num(params, "rotate", 0.15);
        if (levels.length !== n) levels = new Float32Array(n);

        // 半周ぶんのスペクトルを左右対称に配置
        const spec = f.spectrum;
        const half = n / 2;
        const maxBin = Math.max(8, Math.floor(spec.length * 0.6));
        const fall = Math.exp(-dt * 10);
        for (let i = 0; i < half; i++) {
          const from = Math.max(1, Math.floor(Math.pow(maxBin, i / half)));
          const to = Math.max(from + 1, Math.floor(Math.pow(maxBin, (i + 1) / half)));
          let p = 0;
          for (let k = from; k < to; k++) if (spec[k] > p) p = spec[k];
          const v = Math.min(1, Math.pow(p * (1 + (i / half) * 2) * 3, 0.6));
          const a = v > levels[i] ? v : levels[i] * fall + v * (1 - fall);
          levels[i] = a;
          levels[n - 1 - i] = a;
        }

        // 新しい拍で衝撃波を発生
        if (f.beatIndex !== lastBeat) {
          if (f.beatIndex > lastBeat && f.sinceBeat < 0.1 && shock > 0) waves.push({ born: t - f.sinceBeat, strength: 0.5 + f.bass * 0.5 });
          lastBeat = f.beatIndex;
        }
        waves = waves.filter((w) => t - w.born < 1.2 && t >= w.born);

        const cx = W / 2;
        const cy = H / 2;
        const r0 = base * (1 + f.kick * 0.18 + f.bass * 0.08);
        const angle0 = t * rot * Math.PI;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // 中心の光（衝撃波に合わせて光る。「光の強さ」0〜100% を掛ける）
        const light = Math.min(100, Math.max(0, num(params, "light", 100))) / 100;
        ctx.globalAlpha = Math.min(1, (0.25 + f.kick * 0.6) * light);
        const core = r0 * 2.6;
        ctx.drawImage(sprites.tintedGlow(color), cx - core, cy - core, core * 2, core * 2);

        // 衝撃波リング
        ctx.strokeStyle = accent;
        for (const w of waves) {
          const age = (t - w.born) / 1.2;
          const r = r0 + age * Math.max(W, H) * 0.55;
          ctx.globalAlpha = (1 - age) * (1 - age) * shock * w.strength;
          ctx.lineWidth = 2 + (1 - age) * 14;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // トゲ（1 パスで描画）
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, ((Math.PI * 2 * r0) / n) * 0.45);
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = angle0 + (i / n) * Math.PI * 2 - Math.PI / 2;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const l = 4 + levels[i] * len;
          ctx.moveTo(cx + c * r0, cy + s * r0);
          ctx.lineTo(cx + c * (r0 + l), cy + s * (r0 + l));
        }
        ctx.stroke();

        // 内側の輪郭（ビートで光る分だけ「光の強さ」を掛ける）
        ctx.globalAlpha = 0.6 + f.kick * 0.4 * light;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r0 - 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    };
  },
};
