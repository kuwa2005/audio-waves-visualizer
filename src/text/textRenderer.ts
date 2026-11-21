import type { AudioFeatures } from "../engine/features";
import { resolveRange, type Scene } from "../engine/scene";
import { num, str } from "../plugins/types";
import { activeCue } from "./subtitles";
import { measure, styleFrom, subtitleBounds, titleAnchor, titleBounds, wrapText, type TextStyle } from "./textCatalog";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

type Block = { lines: string[]; style: TextStyle; colorOverride?: string };

/**
 * 文字を画像（OffscreenCanvas）にしてキャッシュする。光彩（shadowBlur）や縁取りは作るときに 1 回だけ描くので、
 * 毎フレームは drawImage 1 回で済む。
 */
class TextImageCache {
  private map = new Map<string, OffscreenCanvas>();

  get(blocks: Block[], gap: number): OffscreenCanvas {
    const key = JSON.stringify([blocks, gap]);
    let c = this.map.get(key);
    if (c) {
      // 最近使ったものを末尾へ（簡易 LRU）
      this.map.delete(key);
      this.map.set(key, c);
      return c;
    }
    c = this.render(blocks, gap);
    this.map.set(key, c);
    if (this.map.size > 24) this.map.delete(this.map.keys().next().value!);
    return c;
  }

  private render(blocks: Block[], gap: number): OffscreenCanvas {
    const pad = Math.ceil(Math.max(...blocks.map((b) => b.style.outlinePx + b.style.sizePx * (0.25 + b.style.glow * 0.6))));
    const rows: { text: string; style: TextStyle; color: string; w: number; lh: number }[] = [];
    blocks.forEach((b, bi) => {
      for (const line of b.lines) rows.push({ text: line, style: b.style, color: b.colorOverride ?? b.style.color, w: measure(line, b.style), lh: b.style.sizePx * (bi === 0 ? 1.25 : 1.4) });
    });
    const w = Math.ceil(Math.max(1, ...rows.map((r) => r.w)) + pad * 2);
    const h = Math.ceil(rows.reduce((a, r) => a + r.lh, 0) + gap + pad * 2);
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext("2d")!;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    let y = pad;
    rows.forEach((r, i) => {
      if (i > 0 && rows[i - 1].style !== r.style) y += gap;
      const cy = y + r.lh / 2;
      const s = r.style;
      g.font = s.font;
      g.letterSpacing = `${s.spacingPx}px`;
      if (s.box > 0 && r.text) {
        g.globalAlpha = s.box;
        g.fillStyle = s.boxColor;
        g.beginPath();
        g.roundRect(w / 2 - r.w / 2 - s.sizePx * 0.4, cy - r.lh / 2, r.w + s.sizePx * 0.8, r.lh, s.sizePx * 0.2);
        g.fill();
        g.globalAlpha = 1;
      }
      if (s.glow > 0) {
        g.save();
        g.shadowColor = s.glowColor;
        g.shadowBlur = s.sizePx * 0.5 * s.glow;
        g.fillStyle = s.glowColor;
        for (let k = 0; k < 2; k++) g.fillText(r.text, w / 2, cy);
        g.restore();
      }
      if (s.outlinePx > 0) {
        g.strokeStyle = s.outlineColor;
        g.lineWidth = s.outlinePx * 2;
        g.strokeText(r.text, w / 2, cy);
      }
      g.fillStyle = r.color;
      g.fillText(r.text, w / 2, cy);
      y += r.lh;
    });
    return c;
  }
}

/** タイトルと字幕の描画（エフェクトの後、いちばん手前） */
export class TextRenderer {
  private cache = new TextImageCache();

  render(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, W: number, H: number, t: number, duration: number, f: AudioFeatures): void {
    const range = duration > 0 ? resolveRange(scene.range, duration) : { start: 0, end: Infinity };
    if (scene.title.enabled) this.drawTitle(ctx, scene, W, H, t, range, f);
    if (scene.subtitles.enabled && scene.subtitles.cues.length) this.drawSubtitle(ctx, scene, W, H, t);
  }

  private place(
    ctx: OffscreenCanvasRenderingContext2D,
    img: OffscreenCanvas,
    cx: number,
    cy: number,
    scale: number,
    alpha: number,
    clipRatio = 1,
  ): void {
    if (alpha <= 0.001) return;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "source-over";
    if (clipRatio < 1) {
      ctx.beginPath();
      ctx.rect(cx - w / 2, cy - h / 2, w * clipRatio, h);
      ctx.clip();
    }
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  private drawTitle(
    ctx: OffscreenCanvasRenderingContext2D,
    scene: Scene,
    W: number,
    H: number,
    t: number,
    range: { start: number; end: number },
    f: AudioFeatures,
  ): void {
    const L = scene.title;
    const p = L.params;
    const main = styleFrom(p, H);
    const sub = styleFrom(p, H, num(p, "subRatio", 0.45));
    const title = str(p, "title", "");
    const subText = str(p, "subtitle", "");
    if (!title && !subText) return;

    const anim = str(p, "anim", "fade");
    const t0 = range.start + num(p, "appear", 0.5);
    const prog = anim === "none" ? 1 : clamp01((t - t0) / Math.max(0.05, num(p, "animDur", 1.2)));
    if (anim !== "none" && t < t0) return;
    let alpha = anim === "typewriter" ? 1 : easeOut(prog);
    let scale = 1;
    let dy = 0;
    if (anim === "slide") dy = (1 - easeOut(prog)) * main.sizePx * 1.2;
    if (anim === "zoom") scale = 0.6 + 0.4 * easeOutBack(prog);
    if (p.fadeOutEnd !== false && Number.isFinite(range.end)) alpha *= clamp01((range.end - t) / 1);

    let mainText = title;
    let subShown = subText;
    if (anim === "typewriter") {
      const total = [...title].length + [...subText].length;
      const shown = Math.floor(total * prog);
      mainText = [...title].slice(0, shown).join("");
      subShown = [...subText].slice(0, Math.max(0, shown - [...title].length)).join("");
    }
    const blocks: Block[] = [{ lines: wrapText(mainText, main, W * 0.9), style: main }];
    if (subShown) blocks.push({ lines: [subShown], style: sub });
    const img = this.cache.get(blocks, main.sizePx * 0.15);

    // 位置は「描画範囲（全文）の中心」を基準にする（タイプライターでも位置がずれない）
    const b = titleBounds(p, W, H);
    const { cx } = titleAnchor(p, W, H);
    const tr = L.transform;
    const pulse = 1 + num(p, "pulse", 0.03) * f.kick;
    this.place(ctx, img, cx + tr.x * W, b.y + b.h / 2 + tr.y * H + dy, tr.scale * scale * pulse, alpha);
  }

  private drawSubtitle(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, W: number, H: number, t: number): void {
    const L = scene.subtitles;
    const p = L.params;
    const cue = activeCue(L.cues, t, num(p, "offset", 0));
    if (!cue) return;
    const tt = t - num(p, "offset", 0);
    const st = styleFrom(p, H);
    const maxW = W * num(p, "maxWidth", 0.86);
    const anim = str(p, "anim", "fade");
    const inP = clamp01((tt - cue.start) / 0.25);
    const outP = clamp01((cue.end - tt) / 0.2);
    let alpha = anim === "none" ? 1 : Math.min(inP, outP);
    let scale = 1;
    let dy = 0;
    if (anim === "pop") scale = 0.8 + 0.2 * easeOutBack(inP);
    if (anim === "slide") dy = (1 - easeOut(inP)) * st.sizePx * 0.7;

    let text = cue.text;
    if (anim === "typewriter") {
      const chars = [...cue.text];
      const dur = Math.min((cue.end - cue.start) * 0.6, chars.length * 0.08);
      text = chars.slice(0, Math.ceil(chars.length * clamp01((tt - cue.start) / Math.max(0.05, dur)))).join("");
      alpha = outP;
    }
    const lines = wrapText(text, st, maxW);
    const b = subtitleBounds(p, W, H);
    const tr = L.transform;
    const cx = W / 2 + tr.x * W;
    const cy = b.y + b.h / 2 + tr.y * H + dy;
    const s = tr.scale * scale;

    if (anim === "karaoke") {
      // 元の色で全体を描き、進み具合のぶんだけ色付き版を左から重ねる
      const base = this.cache.get([{ lines, style: st }], 0);
      const hi = this.cache.get([{ lines, style: st, colorOverride: str(p, "highlight", "#ffd23f") }], 0);
      const prog = clamp01((tt - cue.start) / Math.max(0.1, cue.end - cue.start));
      this.place(ctx, base, cx, cy, s, alpha);
      this.place(ctx, hi, cx, cy, s, alpha, prog);
      return;
    }
    this.place(ctx, this.cache.get([{ lines, style: st }], 0), cx, cy, s, alpha);
  }
}
