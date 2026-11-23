import type { AudioFeatures } from "../engine/features";
import { resolveRange, type Scene } from "../engine/scene";
import { num, str } from "../plugins/types";
import { activeCue } from "./subtitles";
import { measure, styleFrom, subtitleBounds, titleAnchor, titleBounds, titleLines, wrapText, wrapVertical, type TextStyle } from "./textCatalog";
import { blockTransform, GlyphCache, glyphState, layoutGlyphs, verticalChars, type AnimInput, type KineticAnim } from "./kinetic";

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

  get(blocks: Block[], gap: number, vertical = false): OffscreenCanvas {
    const key = JSON.stringify([blocks, gap, vertical]);
    let c = this.map.get(key);
    if (c) {
      // 最近使ったものを末尾へ（簡易 LRU）
      this.map.delete(key);
      this.map.set(key, c);
      return c;
    }
    c = vertical ? this.renderVertical(blocks, gap) : this.render(blocks, gap);
    this.map.set(key, c);
    if (this.map.size > 24) this.map.delete(this.map.keys().next().value!);
    return c;
  }

  /** 縦書き: 1 行目が右端の列、文字は上から下へ。2 つ目のブロック（サブタイトル）は左側の列に、少し下げて置く */
  private renderVertical(blocks: Block[], gap: number): OffscreenCanvas {
    const pad = Math.ceil(Math.max(...blocks.map((b) => b.style.outlinePx + b.style.sizePx * (0.25 + b.style.glow * 0.6))));
    type Col = { chars: string[]; style: TextStyle; color: string; colW: number; step: number; top: number };
    const cols: Col[] = [];
    blocks.forEach((b, bi) => {
      for (const line of b.lines) {
        const s = b.style;
        cols.push({ chars: verticalChars(line), style: s, color: b.colorOverride ?? s.color, colW: s.sizePx * 1.35, step: s.sizePx * 1.05 + s.spacingPx, top: bi === 0 ? 0 : blocks[0].style.sizePx * 1.2 });
      }
    });
    const w = Math.ceil(cols.reduce((a, c, i) => a + c.colW + (i > 0 && cols[i - 1].style !== c.style ? gap : 0), 0) + pad * 2);
    const h = Math.ceil(Math.max(1, ...cols.map((c) => c.top + c.chars.length * c.step)) + pad * 2);
    const cv = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    const g = cv.getContext("2d")!;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    let x = w - pad;
    cols.forEach((c, i) => {
      if (i > 0 && cols[i - 1].style !== c.style) x -= gap;
      const cx = x - c.colW / 2;
      const s = c.style;
      g.font = s.font;
      g.letterSpacing = "0px";
      const y0 = pad + c.top;
      if (s.box > 0 && c.chars.length) {
        g.globalAlpha = s.box;
        g.fillStyle = s.boxColor;
        g.beginPath();
        g.roundRect(cx - c.colW / 2, y0 - s.sizePx * 0.3, c.colW, c.chars.length * c.step + s.sizePx * 0.6, s.sizePx * 0.2);
        g.fill();
        g.globalAlpha = 1;
      }
      const each = (fn: (ch: string, y: number) => void) => c.chars.forEach((ch, k) => fn(ch, y0 + c.step * (k + 0.5)));
      if (s.glow > 0) {
        g.save();
        g.shadowColor = s.glowColor;
        g.shadowBlur = s.sizePx * 0.5 * s.glow;
        g.fillStyle = s.glowColor;
        for (let k = 0; k < 2; k++) each((ch, y) => g.fillText(ch, cx, y));
        g.restore();
      }
      if (s.outlinePx > 0) {
        g.strokeStyle = s.outlineColor;
        g.lineWidth = s.outlinePx * 2;
        each((ch, y) => g.strokeText(ch, cx, y));
      }
      g.fillStyle = c.color;
      each((ch, y) => g.fillText(ch, cx, y));
      x -= c.colW;
    });
    return cv;
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
  private glyphs = new GlyphCache();
  /** 描いている文字レイヤーの不透明度（すべての globalAlpha に掛ける） */
  private la = 1;

  render(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, W: number, H: number, t: number, duration: number, f: AudioFeatures): void {
    const range = duration > 0 ? resolveRange(scene.range, duration) : { start: 0, end: Infinity };
    this.la = scene.title.opacity ?? 1;
    if (scene.title.enabled && this.la > 0.001) this.drawTitle(ctx, scene, W, H, t, range, f);
    this.la = scene.subtitles.opacity ?? 1;
    if (scene.subtitles.enabled && scene.subtitles.cues.length && this.la > 0.001) this.drawSubtitle(ctx, scene, W, H, t, f);
    this.la = 1;
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
    ctx.globalAlpha = alpha * this.la;
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
    const vertical = str(p, "writing", "horizontal") === "vertical";
    const blocks: Block[] = [{ lines: titleLines(mainText, main, W, H, vertical), style: main }];
    if (subShown) blocks.push({ lines: vertical ? wrapVertical(subShown, 999) : [subShown], style: sub });
    const img = this.cache.get(blocks, main.sizePx * 0.15, vertical);

    // 位置は「描画範囲（全文）の中心」を基準にする（タイプライターでも位置がずれない）
    const b = titleBounds(p, W, H);
    const { cx } = titleAnchor(p, W, H);
    const tr = L.transform;
    const pulse = 1 + num(p, "pulse", 0.03) * f.kick;
    const k = tr.scale * scale * pulse;
    // 縦書きのタイプライターは、途中の画像を全文の右上にそろえる（文字が増えても位置が動かない）
    let ox = 0;
    let oy = 0;
    if (vertical && anim === "typewriter" && (mainText !== title || subShown !== subText)) {
      const fullBlocks: Block[] = [{ lines: titleLines(title, main, W, H, true), style: main }];
      if (subText) fullBlocks.push({ lines: wrapVertical(subText, 999), style: sub });
      const full = this.cache.get(fullBlocks, main.sizePx * 0.15, true);
      ox = ((full.width - img.width) / 2) * k;
      oy = (-(full.height - img.height) / 2) * k;
    }
    this.place(ctx, img, cx + tr.x * W + ox, b.y + b.h / 2 + tr.y * H + dy + oy, k, alpha);
  }

  private drawSubtitle(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, W: number, H: number, t: number, f: AudioFeatures): void {
    const L = scene.subtitles;
    const p = L.params;
    const offset = num(p, "offset", 0);
    const cue = activeCue(L.cues, t, offset);
    if (!cue) return;
    const cueIndex = L.cues.indexOf(cue);
    const tt = t - offset;
    const anim = str(p, "anim", "fade") as KineticAnim;
    const vertical = str(p, "writing", "horizontal") === "vertical";
    let st = styleFrom(p, H);
    // ネオン管は光彩が無いと光って見えないので最低限付ける
    if (anim === "neon" && st.glow < 0.7) st = { ...st, glow: 0.9 };
    const lines = vertical ? wrapVertical(cue.text, Math.max(1, Math.floor((H * 0.8) / (st.sizePx * 1.05)))) : wrapText(cue.text, st, W * num(p, "maxWidth", 0.86));
    const { glyphs, width: bw, height: bh } = layoutGlyphs(lines, st, vertical);
    if (glyphs.length === 0) return;

    const b = subtitleBounds(p, W, H);
    const tr = L.transform;
    const bt = blockTransform(anim, cueIndex, W, H);
    let cx = b.x + b.w / 2 + tr.x * W + bt.dx;
    let cy = b.y + b.h / 2 + tr.y * H + bt.dy;
    if (anim === "random") {
      // ランダム配置でも画面からはみ出さないよう、回転を含めた大きさで中心を収める
      const k = tr.scale * bt.scale;
      const c = Math.abs(Math.cos(bt.rot));
      const sn = Math.abs(Math.sin(bt.rot));
      const hw = ((bw * c + bh * sn) / 2) * k + st.sizePx * 0.3;
      const hh = ((bw * sn + bh * c) / 2) * k + st.sizePx * 0.3;
      cx = hw * 2 >= W ? W / 2 : Math.min(W - hw, Math.max(hw, cx));
      cy = hh * 2 >= H ? H / 2 : Math.min(H - hh, Math.max(hh, cy));
    }
    const input: AnimInput = {
      anim,
      lt: tt - cue.start,
      left: cue.end - tt,
      dur: cue.end - cue.start,
      cueIndex,
      count: glyphs.length,
      size: st.sizePx,
      W,
      H,
      kick: f.kick,
      t,
      highlight: str(p, "highlight", "#ffd23f"),
    };

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(cx, cy);
    ctx.rotate(bt.rot);
    ctx.scale(tr.scale * bt.scale, tr.scale * bt.scale);

    // 背景の帯（行・列ごと）
    if (st.box > 0) {
      const a = clamp01(Math.min(input.lt / 0.25, input.left / 0.2));
      const byLine = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
      for (const g of glyphs) {
        const half = vertical ? st.sizePx * 0.65 : g.w / 2;
        const r = byLine.get(g.line) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        r.x0 = Math.min(r.x0, g.x - half);
        r.x1 = Math.max(r.x1, g.x + half);
        r.y0 = Math.min(r.y0, g.y - st.sizePx * 0.62);
        r.y1 = Math.max(r.y1, g.y + st.sizePx * 0.62);
        byLine.set(g.line, r);
      }
      ctx.globalAlpha = st.box * a * this.la;
      ctx.fillStyle = st.boxColor;
      const pad = st.sizePx * 0.35;
      for (const r of byLine.values()) {
        ctx.beginPath();
        ctx.roundRect(r.x0 - pad, r.y0, r.x1 - r.x0 + pad * 2, r.y1 - r.y0, st.sizePx * 0.2);
        ctx.fill();
      }
    }

    for (const g of glyphs) {
      const gs = glyphState(g, input);
      if (gs.alpha <= 0.01 || gs.scale <= 0.001) continue;
      const ch = gs.ch ?? g.ch;
      if (ch.trim() === "") continue;
      const img = this.glyphs.get(ch, st, gs.color ?? st.color);
      ctx.save();
      ctx.translate(g.x + gs.dx, g.y + gs.dy);
      if (gs.rot) ctx.rotate(gs.rot);
      if (gs.scale !== 1) ctx.scale(gs.scale, gs.scale);
      // 色ずれ（グリッチ）: 赤と青をずらして重ねる
      if (gs.split) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = gs.alpha * 0.7 * this.la;
        ctx.drawImage(this.glyphs.get(ch, st, "#ff2050"), -img.width / 2 - gs.split, -img.height / 2);
        ctx.drawImage(this.glyphs.get(ch, st, "#20e0ff"), -img.width / 2 + gs.split, -img.height / 2);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = gs.alpha * this.la;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
