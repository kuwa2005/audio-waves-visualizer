import { bloomMeta, flashMeta, FLASH_MIN_INTERVAL, glitchMeta, rgbShiftMeta, shakeMeta, zoomBlurMeta } from "./effectCatalog";
import { mulberry32, smoothNoise } from "./rng";
import { num, str, type EffectPlugin } from "./types";

/**
 * 画面全体の後処理。Canvas 2D の drawImage と合成モードだけで実現する（ctx.filter / getImageData は使わない）。
 * 作業用キャンバスは EffectContext.scratch / small で使い回す。
 */

/** ctx.canvas の内容を作業用キャンバスへ写す */
function snapshot(src: OffscreenCanvas, dst: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const g = dst.getContext("2d")!;
  g.globalCompositeOperation = "copy";
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.globalCompositeOperation = "source-over";
  return g;
}

export const bloom: EffectPlugin = {
  ...bloomMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const strength = num(p, "strength", 0.8) * (1 + num(p, "beat", 0.8) * fx.features.kick);
        if (strength <= 0.01) return;
        const radius = Math.round(num(p, "radius", 3));
        // 1/4 に縮小 → 自分自身と乗算して暗部を落とす（明るい所だけ残す）
        let cur = fx.small(0, 4);
        const g = snapshot(ctx.canvas, cur);
        g.globalCompositeOperation = "multiply";
        g.drawImage(cur, 0, 0);
        g.drawImage(cur, 0, 0);
        g.globalCompositeOperation = "source-over";
        // 縮小を重ねてぼかす（GPU の拡大縮小フィルタを利用）
        const chain = [cur];
        for (let i = 1; i <= radius; i++) {
          const next = fx.small(i, 4 << i);
          const ng = next.getContext("2d")!;
          ng.globalCompositeOperation = "copy";
          ng.imageSmoothingQuality = "high";
          ng.drawImage(cur, 0, 0, next.width, next.height);
          chain.push(next);
          cur = next;
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.imageSmoothingQuality = "high";
        // 各段を少しずつ足す（広く柔らかい光）
        for (let i = 1; i < chain.length; i++) {
          ctx.globalAlpha = Math.min(1, (strength * 0.7) / Math.sqrt(i));
          ctx.drawImage(chain[i], 0, 0, fx.width, fx.height);
        }
        ctx.restore();
      },
    };
  },
};

export const rgbShift: EffectPlugin = {
  ...rgbShiftMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const base = num(p, "base", 0.1);
        const d = num(p, "amount", 14) * (base + (1 - base) * fx.features.kick) * (fx.height / 1080);
        if (d < 0.5) return;
        const ang = (num(p, "angle", 0) * Math.PI) / 180;
        const dx = Math.cos(ang) * d;
        const dy = Math.sin(ang) * d;
        const { width: W, height: H } = fx;
        const copy = fx.scratch(0);
        snapshot(ctx.canvas, copy);
        // 赤だけ（+方向）と青だけ（−方向）の画像を作る
        const channel = (idx: number, ox: number, oy: number, color: string) => {
          const c = fx.scratch(idx);
          const g = c.getContext("2d")!;
          g.globalCompositeOperation = "copy";
          g.drawImage(copy, ox, oy);
          g.globalCompositeOperation = "multiply";
          g.fillStyle = color;
          g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = "source-over";
          return c;
        };
        const red = channel(1, dx, dy, "#ff0000");
        const blue = channel(2, -dx, -dy, "#0000ff");
        ctx.save();
        // 元画像を緑だけにして、赤・青を足し戻す
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(red, 0, 0);
        ctx.drawImage(blue, 0, 0);
        ctx.restore();
      },
    };
  },
};

export const zoomBlur: EffectPlugin = {
  ...zoomBlurMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const amt = num(p, "strength", 0.6) * fx.features.kick;
        if (amt < 0.02) return;
        const n = Math.round(num(p, "samples", 5));
        const { width: W, height: H } = fx;
        const copy = fx.scratch(0);
        snapshot(ctx.canvas, copy);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (let i = 1; i <= n; i++) {
          const s = 1 + amt * 0.22 * (i / n);
          ctx.globalAlpha = 0.55 / (i + 0.5);
          ctx.drawImage(copy, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
        }
        ctx.restore();
      },
    };
  },
};

export const glitch: EffectPlugin = {
  ...glitchMeta,
  create() {
    let until = -Infinity;
    let prev = 0;
    return {
      reset() {
        until = -Infinity;
        prev = 0;
      },
      apply(ctx, fx, p) {
        const { t, features: f, width: W, height: H } = fx;
        if (f.onset >= num(p, "threshold", 0.6) && f.onset > prev) until = t + 0.14;
        prev = f.onset;
        if (t > until) return;
        const intensity = num(p, "intensity", 0.6);
        const slices = Math.round(num(p, "slices", 9));
        // 1/30 秒ごとに崩れ方が変わる（時刻から決まる）
        const rnd = mulberry32(Math.floor(t * 30) * 9973 + 1);
        const copy = fx.scratch(0);
        snapshot(ctx.canvas, copy);
        ctx.save();
        for (let i = 0; i < slices; i++) {
          const y = rnd() * H;
          const h = (0.01 + rnd() * 0.08) * H;
          const dx = (rnd() - 0.5) * W * 0.18 * intensity;
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(copy, 0, y, W, h, dx, y, W, h);
          // 一部の帯だけ色を飛ばす
          if (rnd() < 0.35 * intensity) {
            ctx.globalCompositeOperation = "difference";
            ctx.fillStyle = rnd() < 0.5 ? "#ff00aa" : "#00ffcc";
            ctx.globalAlpha = 0.5;
            ctx.fillRect(0, y, W, h);
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      },
    };
  },
};

export const shake: EffectPlugin = {
  ...shakeMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const k = fx.features.kick;
        if (k < 0.02) return;
        const { width: W, height: H, t } = fx;
        const amt = num(p, "amount", 18) * (H / 1080) * k;
        const rot = ((num(p, "rotate", 0.6) * Math.PI) / 180) * k;
        const zoom = 1 + num(p, "zoom", 0.03) * k;
        const copy = fx.scratch(0);
        snapshot(ctx.canvas, copy);
        ctx.save();
        ctx.globalCompositeOperation = "copy";
        ctx.translate(W / 2 + smoothNoise(t * 18, 1) * amt, H / 2 + smoothNoise(t * 18, 2) * amt);
        ctx.rotate(smoothNoise(t * 12, 3) * rot);
        // 揺れで端が見えないよう、揺れ幅ぶん拡大する
        const s = zoom + (amt * 2.2) / Math.min(W, H);
        ctx.scale(s, s);
        ctx.drawImage(copy, -W / 2, -H / 2);
        ctx.restore();
      },
    };
  },
};

export const flash: EffectPlugin = {
  ...flashMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const f = fx.features;
        if (f.beatIndex < 0 || f.bpm <= 0) return;
        // 拍の間隔から、1 秒に 3 回未満になる最小の「何拍ごと」を求める
        const beatSec = 60 / f.bpm;
        const every = Math.max(Math.round(num(p, "every", 4)), Math.ceil(FLASH_MIN_INTERVAL / beatSec));
        if (f.beatIndex % every !== 0) return;
        const a = num(p, "strength", 0.35) * Math.exp(-f.sinceBeat * 9);
        if (a < 0.01) return;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = a;
        ctx.fillStyle = str(p, "color", "#ffffff");
        ctx.fillRect(0, 0, fx.width, fx.height);
        ctx.restore();
      },
    };
  },
};

export const EFFECT_REGISTRY: Record<string, EffectPlugin> = {
  [bloom.id]: bloom,
  [rgbShift.id]: rgbShift,
  [zoomBlur.id]: zoomBlur,
  [glitch.id]: glitch,
  [shake.id]: shake,
  [flash.id]: flash,
};
