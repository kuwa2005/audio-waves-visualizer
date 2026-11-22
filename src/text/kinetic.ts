/**
 * 1 文字ずつ動かす字幕（キネティック・タイポグラフィ）。
 *
 * - 文字ごとに位置・回転・大きさ・不透明度を計算して描く（MV のような凝った字幕）
 * - 文字の画像（縁取り・光彩込み）は「文字＋スタイル」ごとにキャッシュし、毎フレームは文字数ぶん drawImage するだけ
 * - 乱れ方は字幕の番号・文字の番号・時刻から決める（プレビューと書き出しで同じ動き）
 */
import { mulberry32, smoothNoise } from "../plugins/rng";
import { measure, type TextStyle } from "./textCatalog";

export type KineticAnim =
  | "none"
  | "fade"
  | "pop"
  | "slide"
  | "karaoke"
  | "typewriter"
  | "charPop"
  | "charDrop"
  | "charSpin"
  | "wave"
  | "bounceBeat"
  | "scramble"
  | "glitch"
  | "neon"
  | "scatter"
  | "impact"
  | "random";

/** 1 文字の配置（基準位置は文字の中心、ブロック中心からの相対座標） */
export type Glyph = { ch: string; x: number; y: number; w: number; line: number; index: number };

/** 縦書きで字形を差し替える文字 */
const VERTICAL_FORMS: Record<string, string> = {
  "、": "︑",
  "。": "︒",
  "，": "︐",
  "「": "﹁",
  "」": "﹂",
  "『": "﹃",
  "』": "﹄",
  "（": "︵",
  "）": "︶",
  "(": "︵",
  ")": "︶",
  "ー": "丨",
  "―": "丨",
  "～": "≀",
  "〜": "≀",
  "…": "︙",
  "‥": "︰",
  "！": "︕",
  "？": "︖",
};

/** 行（横書き）または列（縦書き）に並べる。ブロックの中心を (0,0) とする */
export function layoutGlyphs(lines: string[], style: TextStyle, vertical: boolean): { glyphs: Glyph[]; width: number; height: number } {
  const glyphs: Glyph[] = [];
  const size = style.sizePx;
  let index = 0;
  if (!vertical) {
    const lineH = size * 1.3;
    const total = lines.length * lineH;
    let maxW = 0;
    lines.forEach((line, li) => {
      const chars = [...line];
      const widths = chars.map((c) => measure(c, style));
      const lw = widths.reduce((a, b) => a + b, 0);
      maxW = Math.max(maxW, lw);
      let x = -lw / 2;
      const y = -total / 2 + lineH * (li + 0.5);
      chars.forEach((ch, ci) => {
        glyphs.push({ ch, x: x + widths[ci] / 2, y, w: widths[ci], line: li, index: index++ });
        x += widths[ci];
      });
    });
    return { glyphs, width: maxW, height: total };
  }
  // 縦書き: 1 行目が右端の列。文字は上から下へ
  const colW = size * 1.35;
  const step = size * 1.05;
  const totalW = lines.length * colW;
  let maxH = 0;
  lines.forEach((line, li) => {
    const chars = [...line].map((c) => VERTICAL_FORMS[c] ?? c);
    const h = chars.length * step;
    maxH = Math.max(maxH, h);
    const x = totalW / 2 - colW * (li + 0.5);
    chars.forEach((ch, ci) => {
      glyphs.push({ ch, x, y: -h / 2 + step * (ci + 0.5), w: size, line: li, index: index++ });
    });
  });
  return { glyphs, width: totalW, height: maxH };
}

/** 1 文字の見え方 */
export type GlyphState = {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
  alpha: number;
  /** 表示する文字の差し替え（デコード等） */
  ch?: string;
  /** 色の差し替え（カラオケ等） */
  color?: string;
  /** 色ずれ（グリッチ）: 赤と青をずらして重ねる量 px */
  split?: number;
};

export type AnimInput = {
  anim: KineticAnim;
  /** 字幕の表示開始からの経過秒・表示終了までの残り秒・表示時間 */
  lt: number;
  left: number;
  dur: number;
  /** 字幕の番号（乱れ方の種） */
  cueIndex: number;
  count: number;
  size: number;
  W: number;
  H: number;
  kick: number;
  /** 絶対時刻（波・ちらつき用） */
  t: number;
  highlight: string;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => Math.pow(clamp01(x), 2);
export const easeOutBack = (x: number) => {
  const c = 1.70158;
  const k = clamp01(x) - 1;
  return 1 + (c + 1) * k * k * k + c * k * k;
};
export const easeOutBounce = (x: number) => {
  let v = clamp01(x);
  const n = 7.5625;
  const d = 2.75;
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
  if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
  return n * (v -= 2.625 / d) * v + 0.984375;
};

const SCRAMBLE_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ01#$%&*+=?@ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 文字 g の見え方を決める（純粋関数） */
export function glyphState(g: Glyph, a: AnimInput): GlyphState {
  const { lt, left, dur, count, size } = a;
  const i = g.index;
  const n = Math.max(1, count);
  const rnd = mulberry32(a.cueIndex * 7919 + i * 104729 + 13);
  const r1 = rnd();
  const r2 = rnd();
  const r3 = rnd();
  const inP = clamp01(lt / 0.25);
  const outP = clamp01(left / 0.2);
  const base: GlyphState = { dx: 0, dy: 0, rot: 0, scale: 1, alpha: Math.min(inP, outP) };
  // 文字ごとの開始の遅れ（全体で表示時間の 4 割以内に収める）
  const stagger = Math.min(0.06, (dur * 0.4) / n);
  const li = lt - i * stagger; // この文字にとっての経過秒
  const lo = left - (n - 1 - i) * stagger * 0.5; // この文字にとっての残り秒（後ろの文字から先に消える）

  switch (a.anim) {
    case "none":
      return { ...base, alpha: 1 };
    case "fade":
      return base;
    case "pop":
      return { ...base, scale: 0.8 + 0.2 * easeOutBack(inP) };
    case "slide":
      return { ...base, dy: (1 - easeOut(inP)) * size * 0.7 };
    case "typewriter": {
      const shown = Math.ceil(n * clamp01(lt / Math.max(0.05, Math.min(dur * 0.6, n * 0.08))));
      return { ...base, alpha: i < shown ? outP : 0 };
    }
    case "karaoke": {
      const prog = clamp01(lt / Math.max(0.1, dur)) * n;
      return { ...base, color: i < Math.floor(prog) ? a.highlight : undefined };
    }
    case "charPop": {
      const s = easeOutBack(li / 0.3) * (lo > 0.25 ? 1 : easeOut(lo / 0.25));
      return { dx: 0, dy: 0, rot: 0, scale: Math.max(0, s), alpha: clamp01(li / 0.1) * clamp01(lo / 0.1) };
    }
    case "charDrop": {
      // 上から落ちて弾む。消えるときは回りながら下へ落ちる
      const fall = lo < 0.35 ? easeIn(1 - lo / 0.35) : 0;
      return {
        dx: fall * (r1 - 0.5) * size * 2,
        dy: -(1 - easeOutBounce(li / 0.6)) * a.H * 0.35 + fall * a.H * 0.5,
        rot: fall * (r2 - 0.5) * 3,
        scale: 1,
        alpha: clamp01(li / 0.05) * (1 - fall),
      };
    }
    case "charSpin": {
      const p = easeOut(li / 0.45);
      const q = lo < 0.3 ? 1 - easeIn(1 - lo / 0.3) : 1;
      return { dx: 0, dy: 0, rot: (1 - p) * -Math.PI * 2 + (1 - q) * Math.PI * 2, scale: p * q, alpha: clamp01(li / 0.1) * q };
    }
    case "wave":
      return { ...base, dy: Math.sin(a.t * 6 + i * 0.55) * size * 0.22, rot: Math.sin(a.t * 6 + i * 0.55 + 1) * 0.08 };
    case "bounceBeat": {
      const phase = i % 2 === 0 ? 1 : 0.6;
      return { ...base, dy: -a.kick * size * 0.55 * phase, scale: 1 + a.kick * 0.25 * phase };
    }
    case "scramble": {
      // 左から順に確定。確定前は 1/20 秒ごとに別の文字
      const reveal = i * Math.min(0.05, (dur * 0.5) / n) + 0.15;
      const hide = (n - 1 - i) * Math.min(0.03, (dur * 0.3) / n);
      const settled = lt >= reveal && left > hide;
      const frame = Math.floor(a.t * 20);
      const rc = SCRAMBLE_CHARS[Math.floor(mulberry32(frame * 31 + i * 7 + a.cueIndex)() * SCRAMBLE_CHARS.length)];
      return { ...base, alpha: Math.min(clamp01(lt / 0.08), clamp01(left / 0.05)), ch: settled || g.ch.trim() === "" ? undefined : rc };
    }
    case "glitch": {
      // 出だしと、ときどき起こる乱れ（1/24 秒ごとに変わる）
      const frame = Math.floor(a.t * 24);
      const fr = mulberry32(frame * 977 + a.cueIndex * 13 + i);
      const burst = lt < 0.35 || left < 0.25 || mulberry32(Math.floor(a.t * 6) + a.cueIndex)() < 0.12;
      if (!burst) return { ...base, split: 1.5 };
      const on = fr() > 0.15;
      return { dx: (fr() - 0.5) * size * 0.8, dy: (fr() - 0.5) * size * 0.15, rot: 0, scale: 1, alpha: on ? base.alpha : 0, split: 3 + fr() * size * 0.15 };
    }
    case "neon": {
      // 点灯するまでちかちかする（文字ごとに違う）。点灯後はわずかに揺らぐ
      const lit = lt > 0.15 + r1 * 0.5;
      const flick = mulberry32(Math.floor(a.t * 15) * 53 + i + a.cueIndex)() > 0.5;
      const alpha = lit ? 0.9 + 0.1 * Math.sin(a.t * 40 + i) : flick ? 0.8 : 0.08;
      return { ...base, alpha: alpha * outP };
    }
    case "scatter": {
      // 画面のあちこちから集まり、最後は弾け飛ぶ
      const p = easeOut(li / 0.7);
      const sx = (r1 - 0.5) * a.W * 1.1;
      const sy = (r2 - 0.5) * a.H * 1.1;
      const boom = lo < 0.35 ? easeIn(1 - lo / 0.35) : 0;
      const ang = r3 * Math.PI * 2;
      return {
        dx: (1 - p) * sx + boom * Math.cos(ang) * a.W * 0.6,
        dy: (1 - p) * sy + boom * Math.sin(ang) * a.H * 0.6,
        rot: (1 - p) * (r3 - 0.5) * 6 + boom * (r1 - 0.5) * 8,
        scale: (0.4 + 0.6 * p) * (1 + boom),
        alpha: clamp01(li / 0.15) * (1 - boom),
      };
    }
    case "impact": {
      // 巨大な文字が叩きつけられ、しばらく揺れる。最後は奥へ吹き飛ぶ
      const hit = clamp01(lt / 0.14);
      const shake = lt < 0.5 ? (1 - lt / 0.5) * size * 0.35 : 0;
      const away = left < 0.25 ? easeIn(1 - left / 0.25) : 0;
      return {
        dx: smoothNoise(a.t * 30, 1 + a.cueIndex) * shake,
        dy: smoothNoise(a.t * 30, 7 + a.cueIndex) * shake,
        rot: smoothNoise(a.t * 20, 3 + a.cueIndex) * shake * 0.004,
        scale: (3 - 2 * easeIn(hit)) * (1 - away * 0.7),
        alpha: hit * (1 - away),
      };
    }
    case "random": {
      // 位置・角度・大きさは字幕ごとに blockTransform で変える。文字は一文字ずつポップ
      const s = easeOutBack(li / 0.25);
      return { dx: 0, dy: 0, rot: 0, scale: Math.max(0, s), alpha: clamp01(li / 0.08) * outP };
    }
  }
}

/** 字幕全体の位置・回転・大きさ（ランダム配置で使う。その他は動かさない） */
export function blockTransform(anim: KineticAnim, cueIndex: number, W: number, H: number): { dx: number; dy: number; rot: number; scale: number } {
  if (anim !== "random") return { dx: 0, dy: 0, rot: 0, scale: 1 };
  const r = mulberry32(cueIndex * 2654435761 + 5);
  return {
    dx: (r() - 0.5) * W * 0.55,
    dy: -(r() * H * 0.6), // 字幕の基準位置（下の方）から上へずらす
    rot: (r() - 0.5) * 0.6,
    scale: 0.8 + r() * 0.9,
  };
}

/** 文字画像のキャッシュ（縁取り・光彩込み） */
export class GlyphCache {
  private map = new Map<string, OffscreenCanvas>();

  get(ch: string, style: TextStyle, color: string): OffscreenCanvas {
    const key = `${ch}\u0000${style.font}\u0000${color}\u0000${style.outlineColor}\u0000${style.outlinePx}\u0000${style.glow}\u0000${style.glowColor}`;
    let c = this.map.get(key);
    if (c) return c;
    const pad = Math.ceil(style.outlinePx + style.sizePx * (0.2 + style.glow * 0.6));
    const w = Math.ceil(Math.max(style.sizePx, measure(ch, style)) + pad * 2);
    const h = Math.ceil(style.sizePx * 1.3 + pad * 2);
    c = new OffscreenCanvas(w, h);
    const g = c.getContext("2d")!;
    g.font = style.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    const cx = w / 2;
    const cy = h / 2;
    if (style.glow > 0) {
      g.save();
      g.shadowColor = style.glowColor;
      g.shadowBlur = style.sizePx * 0.5 * style.glow;
      g.fillStyle = style.glowColor;
      g.fillText(ch, cx, cy);
      g.fillText(ch, cx, cy);
      g.restore();
    }
    if (style.outlinePx > 0) {
      g.strokeStyle = style.outlineColor;
      g.lineWidth = style.outlinePx * 2;
      g.strokeText(ch, cx, cy);
    }
    g.fillStyle = color;
    g.fillText(ch, cx, cy);
    this.map.set(key, c);
    if (this.map.size > 600) this.map.delete(this.map.keys().next().value!);
    return c;
  }
}
