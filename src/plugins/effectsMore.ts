import { kaleidoscopeMeta, vhsMeta, vignetteMeta } from "./effectCatalog";
import { mulberry32 } from "./rng";
import { num, str, type EffectPlugin } from "./types";

function snapshot(src: OffscreenCanvas, dst: OffscreenCanvas): void {
  const g = dst.getContext("2d")!;
  g.globalCompositeOperation = "copy";
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(src, 0, 0, dst.width, dst.height);
  g.globalCompositeOperation = "source-over";
}

// ------------------------------------------------------------------ ビネット

export const vignette: EffectPlugin = {
  ...vignetteMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const { width: W, height: H, features: f } = fx;
        const strength = Math.min(1, num(p, "strength", 0.6) * (1 + num(p, "pulse", 0.4) * (f.bass * 0.5 + f.kick * 0.4)));
        if (strength <= 0.01) return;
        const inner = Math.hypot(W, H) * 0.5 * num(p, "size", 0.55);
        const outer = Math.hypot(W, H) * 0.55;
        const v = parseInt(str(p, "color", "#000000").slice(1), 16);
        const rgb = `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
        const gr = ctx.createRadialGradient(W / 2, H / 2, inner * (1 - f.kick * 0.1), W / 2, H / 2, outer);
        gr.addColorStop(0, `rgba(${rgb},0)`);
        gr.addColorStop(1, `rgba(${rgb},${strength})`);
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      },
    };
  },
};

// ------------------------------------------------------------------ VHS

export const vhs: EffectPlugin = {
  ...vhsMeta,
  create() {
    let lines: CanvasPattern | null = null;
    let noise: OffscreenCanvas | null = null;
    return {
      apply(ctx, fx, p) {
        const { width: W, height: H, t } = fx;
        const s = H / 1080;
        // 色のにじみ（赤を右・青を左へ少しずらす）
        const bleed = num(p, "bleed", 0.5);
        if (bleed > 0) {
          const copy = fx.scratch(0);
          snapshot(ctx.canvas, copy);
          const d = 4 * s * bleed;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.35 * bleed;
          const tint = (dx: number, color: string) => {
            const c = fx.scratch(1);
            const g = c.getContext("2d")!;
            g.globalCompositeOperation = "copy";
            g.drawImage(copy, dx, 0);
            g.globalCompositeOperation = "multiply";
            g.fillStyle = color;
            g.fillRect(0, 0, W, H);
            ctx.drawImage(c, 0, 0);
          };
          tint(d, "#ff0000");
          tint(-d, "#0000ff");
          ctx.restore();
        }
        // トラッキングの乱れ（ゆっくり下へ流れる横帯がずれる）
        const tracking = num(p, "tracking", 0.4);
        if (tracking > 0) {
          const copy = fx.scratch(0);
          snapshot(ctx.canvas, copy);
          const bandY = ((t * 0.17) % 1.3) * H - H * 0.15;
          const bandH = H * 0.06;
          const rnd = mulberry32(Math.floor(t * 24));
          for (let k = 0; k < 6; k++) {
            const y = bandY + (k / 6) * bandH;
            const dx = (rnd() - 0.5) * 40 * s * tracking;
            ctx.drawImage(copy, 0, y, W, bandH / 6, dx, y, W, bandH / 6);
          }
          ctx.save();
          ctx.globalAlpha = 0.12 * tracking;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, bandY + bandH * 0.4, W, 2 * s);
          ctx.restore();
        }
        // ノイズ（事前に作った砂嵐を毎フレーム違う位置で重ねる）
        const nAmt = num(p, "noise", 0.25);
        if (nAmt > 0) {
          if (!noise) {
            noise = new OffscreenCanvas(256, 256);
            const g = noise.getContext("2d")!;
            const img = g.createImageData(256, 256);
            const rnd = mulberry32(99);
            for (let i = 0; i < img.data.length; i += 4) {
              const v = Math.floor(rnd() * 255);
              img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
              img.data[i + 3] = 255;
            }
            g.putImageData(img, 0, 0);
          }
          const rnd = mulberry32(Math.floor(t * 30) + 7);
          ctx.save();
          ctx.globalCompositeOperation = "overlay";
          ctx.globalAlpha = 0.25 * nAmt;
          ctx.translate(-rnd() * 256, -rnd() * 256);
          ctx.fillStyle = ctx.createPattern(noise, "repeat")!;
          ctx.fillRect(0, 0, W + 256, H + 256);
          ctx.restore();
        }
        // 走査線
        const sl = num(p, "scanlines", 0.35);
        if (sl > 0) {
          if (!lines) {
            const c = new OffscreenCanvas(1, 4);
            const g = c.getContext("2d")!;
            g.fillStyle = "rgba(0,0,0,0.9)";
            g.fillRect(0, 2, 1, 2);
            lines = ctx.createPattern(c, "repeat");
          }
          ctx.save();
          ctx.globalAlpha = sl * 0.5;
          ctx.fillStyle = lines!;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
        // 画面表示（ビデオデッキ風）
        if (p.osd !== false) {
          ctx.save();
          ctx.font = `bold ${Math.round(42 * s)}px "JetBrains Mono", monospace`;
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = 0.85;
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowOffsetX = 3 * s;
          ctx.shadowOffsetY = 3 * s;
          ctx.fillText("▶ PLAY", 60 * s, 90 * s);
          const sec = Math.floor(t);
          const tc = `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
          ctx.textAlign = "right";
          ctx.fillText(tc, W - 60 * s, H - 70 * s);
          ctx.restore();
        }
      },
    };
  },
};

// ------------------------------------------------------------------ 万華鏡

export const kaleidoscope: EffectPlugin = {
  ...kaleidoscopeMeta,
  create() {
    return {
      apply(ctx, fx, p) {
        const { width: W, height: H, t, features: f } = fx;
        const n = Math.max(3, Math.round(num(p, "segments", 8)));
        const mix = num(p, "mix", 1);
        if (mix <= 0) return;
        const copy = fx.scratch(0);
        snapshot(ctx.canvas, copy);
        const wedge = (Math.PI * 2) / n;
        // 画面の隅まで届く半径。元の映像の中心付近（短辺の半分以内）だけを使うよう拡大して、外側の黒を写さない
        const R = Math.hypot(W, H) / 2 + 2;
        const fit = R / (Math.min(W, H) / 2);
        const zoom = fit * num(p, "zoom", 1) * (1 + f.kick * 0.05);
        const rot = t * num(p, "spin", 0.1) + f.kick * 0.05;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        if (mix < 1) {
          // 元の映像の上に半透明で重ねる
          ctx.globalAlpha = mix;
        } else {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, W, H);
        }
        for (let i = 0; i < n; i++) {
          ctx.save();
          ctx.translate(W / 2, H / 2);
          ctx.rotate(i * wedge + rot);
          if (i % 2 === 1) ctx.scale(1, -1); // 隣どうしは鏡写し
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R, -wedge / 2 - 0.004, wedge / 2 + 0.004);
          ctx.closePath();
          ctx.clip();
          ctx.rotate(-rot * 0.5);
          ctx.scale(zoom, zoom);
          ctx.drawImage(copy, -W / 2, -H / 2);
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },
};
