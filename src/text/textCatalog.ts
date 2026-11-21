import type { ParamValues, Rect } from "../engine/scene";
import { num, str, type ParamDef } from "../plugins/types";

/** フォントの選択肢（端末に入っている和文フォントを優先順に指定） */
export const FONT_FAMILIES: Record<string, string> = {
  sans: '"Noto Sans JP","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo",sans-serif',
  serif: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","MS PMincho",serif',
  rounded: '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Kosugi Maru","Arial Rounded MT Bold",sans-serif',
  mono: '"JetBrains Mono","Noto Sans Mono CJK JP","MS Gothic",monospace',
};

const fontOptions = [
  { value: "sans", label: "ゴシック" },
  { value: "serif", label: "明朝" },
  { value: "rounded", label: "丸ゴシック" },
  { value: "mono", label: "等幅" },
];

const styleParams = (size: number): ParamDef[] => [
  { key: "font", label: "フォント", type: "select", default: "sans", options: fontOptions },
  { key: "weight", label: "太さ", type: "select", default: "bold", options: [{ value: "bold", label: "太字" }, { value: "normal", label: "標準" }] },
  { key: "size", label: "文字の大きさ", type: "number", min: 0.02, max: 0.2, step: 0.005, default: size },
  { key: "color", label: "文字色", type: "color", default: "#ffffff" },
  { key: "outlineColor", label: "縁取りの色", type: "color", default: "#000000" },
  { key: "outline", label: "縁取りの太さ", type: "number", min: 0, max: 0.3, step: 0.01, default: 0.1 },
  { key: "glow", label: "光彩", type: "number", min: 0, max: 1, step: 0.05, default: 0 },
  { key: "glowColor", label: "光彩の色", type: "color", default: "#7cf7ff" },
  { key: "box", label: "背景の帯", type: "number", min: 0, max: 1, step: 0.05, default: 0 },
  { key: "boxColor", label: "帯の色", type: "color", default: "#000000" },
];

export const TITLE_PARAMS: ParamDef[] = [
  { key: "title", label: "タイトル", type: "text", default: "タイトル", multiline: true, placeholder: "曲名など" },
  { key: "subtitle", label: "サブタイトル", type: "text", default: "", placeholder: "アーティスト名など（空欄で非表示）" },
  ...styleParams(0.09),
  { key: "subRatio", label: "サブタイトルの大きさ", type: "number", min: 0.2, max: 1, step: 0.05, default: 0.45 },
  { key: "spacing", label: "文字間隔", type: "number", min: 0, max: 0.5, step: 0.01, default: 0.04 },
  {
    key: "anchor",
    label: "基本の位置",
    type: "select",
    default: "center",
    options: [
      { value: "top", label: "上" },
      { value: "center", label: "中央" },
      { value: "bottom", label: "下" },
    ],
  },
  {
    key: "anim",
    label: "登場の動き",
    type: "select",
    default: "fade",
    options: [
      { value: "none", label: "なし" },
      { value: "fade", label: "フェード" },
      { value: "slide", label: "下から" },
      { value: "zoom", label: "ズーム" },
      { value: "typewriter", label: "タイプライター" },
    ],
  },
  { key: "appear", label: "登場するまで（秒）", type: "number", min: 0, max: 20, step: 0.1, default: 0.5 },
  { key: "animDur", label: "動きの長さ（秒）", type: "number", min: 0.1, max: 4, step: 0.1, default: 1.2 },
  { key: "fadeOutEnd", label: "最後にフェードアウト", type: "boolean", default: true },
  { key: "pulse", label: "ビートで脈打つ", type: "number", min: 0, max: 0.2, step: 0.01, default: 0.03 },
];

export const SUBTITLE_PARAMS: ParamDef[] = [
  ...styleParams(0.05),
  { key: "y", label: "位置（縦）", type: "number", min: 0.05, max: 0.98, step: 0.01, default: 0.88 },
  { key: "maxWidth", label: "最大の幅", type: "number", min: 0.3, max: 1, step: 0.01, default: 0.86 },
  {
    key: "anim",
    label: "表示の動き",
    type: "select",
    default: "fade",
    options: [
      { value: "none", label: "なし" },
      { value: "fade", label: "フェード" },
      { value: "pop", label: "ポップ" },
      { value: "slide", label: "下から" },
      { value: "karaoke", label: "カラオケ（色が塗られる）" },
      { value: "typewriter", label: "タイプライター" },
    ],
  },
  { key: "highlight", label: "カラオケの色", type: "color", default: "#ffd23f" },
  { key: "offset", label: "タイミング調整（秒）", type: "number", min: -10, max: 10, step: 0.05, default: 0 },
];

/** テキストの見た目（描画とキャッシュのキーに使う） */
export type TextStyle = {
  font: string;
  sizePx: number;
  color: string;
  outlineColor: string;
  outlinePx: number;
  glow: number;
  glowColor: string;
  box: number;
  boxColor: string;
  spacingPx: number;
};

export function styleFrom(p: ParamValues, H: number, scale = 1): TextStyle {
  const sizePx = Math.max(6, num(p, "size", 0.05) * H * scale);
  const family = FONT_FAMILIES[str(p, "font", "sans")] ?? FONT_FAMILIES.sans;
  return {
    font: `${str(p, "weight", "bold") === "bold" ? "700" : "400"} ${sizePx}px ${family}`,
    sizePx,
    color: str(p, "color", "#ffffff"),
    outlineColor: str(p, "outlineColor", "#000000"),
    outlinePx: num(p, "outline", 0.1) * sizePx,
    glow: num(p, "glow", 0),
    glowColor: str(p, "glowColor", "#7cf7ff"),
    box: num(p, "box", 0),
    boxColor: str(p, "boxColor", "#000000"),
    spacingPx: num(p, "spacing", 0) * sizePx,
  };
}

let measureCtx: OffscreenCanvasRenderingContext2D | null = null;
function measurer(): OffscreenCanvasRenderingContext2D {
  if (!measureCtx) measureCtx = new OffscreenCanvas(1, 1).getContext("2d")!;
  return measureCtx;
}

export function measure(text: string, style: TextStyle): number {
  const g = measurer();
  g.font = style.font;
  g.letterSpacing = `${style.spacingPx}px`;
  return g.measureText(text).width;
}

/** 改行と最大幅で行に分ける（日本語は文字単位、英単語はなるべく単語単位で折り返す） */
export function wrapText(text: string, style: TextStyle, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    const tokens = para.match(/[A-Za-z0-9'’\-.,!?]+\s*|\s+|./gu) ?? [];
    for (const tok of tokens) {
      const next = line + tok;
      if (line && measure(next.trimEnd(), style) > maxWidth) {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** タイトルの基準位置（中心） */
export function titleAnchor(p: ParamValues, W: number, H: number): { cx: number; cy: number } {
  const a = str(p, "anchor", "center");
  return { cx: W / 2, cy: H * (a === "top" ? 0.18 : a === "bottom" ? 0.8 : 0.5) };
}

/** タイトルの描画範囲（変形前）。当たり判定と拡大の基準に使う */
export function titleBounds(p: ParamValues, W: number, H: number): Rect {
  const main = styleFrom(p, H);
  const sub = styleFrom(p, H, num(p, "subRatio", 0.45));
  const lines = wrapText(str(p, "title", ""), main, W * 0.9);
  const subText = str(p, "subtitle", "");
  const w = Math.max(...lines.map((l) => measure(l, main)), subText ? measure(subText, sub) : 0, main.sizePx);
  const h = lines.length * main.sizePx * 1.25 + (subText ? sub.sizePx * 1.6 : 0);
  const { cx, cy } = titleAnchor(p, W, H);
  const pad = main.outlinePx + main.sizePx * 0.2;
  return { x: cx - w / 2 - pad, y: cy - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 };
}

/** 字幕の表示枠（2 行ぶん）。当たり判定と拡大の基準に使う */
export function subtitleBounds(p: ParamValues, W: number, H: number): Rect {
  const st = styleFrom(p, H);
  const w = W * num(p, "maxWidth", 0.86);
  const h = st.sizePx * 1.3 * 2 + st.sizePx * 0.4;
  const cy = H * num(p, "y", 0.88);
  return { x: (W - w) / 2, y: cy - h / 2, w, h };
}
