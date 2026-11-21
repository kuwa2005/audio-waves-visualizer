/**
 * シーン（描画内容の設定）。メインスレッドの状態ストアが持ち、変更のたびに描画 Worker へ送る。
 * 構造化クローンできる値だけで構成する（関数・クラスを入れない）。
 */

export type Aspect = "16:9" | "9:16" | "1:1";

export const OUTPUT_SIZE: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export type BackgroundLayer = {
  id: "background";
  kind: "background";
  /** 比率ごとに別の画像を使える（無ければ他の比率の画像で代用） */
  images: Partial<Record<Aspect, string>>;
  /** 暗さ 0..1 */
  dim: number;
  /** ビートで画像が一瞬ズームする強さ 0..1 */
  zoomPunch: number;
  /** 画面全体が範囲の始まりで黒から現れる時間・終わりで黒へ消える時間（秒） */
  fadeIn: number;
  fadeOut: number;
};

/** 書き出し（とプレビューのフェード）の範囲。length が null なら曲の最後まで */
export type ProgramRange = { start: number; length: number | null };

/** 範囲を曲の長さに収めて [start, end] にする */
export function resolveRange(r: ProgramRange, duration: number): { start: number; end: number } {
  const start = Math.min(Math.max(0, r.start), Math.max(0, duration));
  const end = r.length === null ? duration : Math.min(duration, start + Math.max(0, r.length));
  return { start, end: Math.max(start, end) };
}

/**
 * フェードの係数 0..1。範囲の外は 1（書き出されるのは範囲内だけなので、
 * プレビューで範囲外を再生したときに画面が真っ黒にならないようにする）
 */
export function fadeFactor(t: number, start: number, end: number, fadeIn: number, fadeOut: number): number {
  if (end <= start) return 1;
  if (t < start || t > end) return 1;
  const a = fadeIn > 0 ? Math.min(1, (t - start) / fadeIn) : 1;
  const b = fadeOut > 0 ? Math.min(1, (end - t) / fadeOut) : 1;
  return Math.max(0, Math.min(a, b));
}

/** レイヤーの配置。x, y は出力サイズに対する移動量（-1..1）、scale は自身の中心を基準にした倍率 */
export type LayerTransform = { x: number; y: number; scale: number };

export const IDENTITY_TRANSFORM: LayerTransform = { x: 0, y: 0, scale: 1 };
export const SCALE_MIN = 0.2;
export const SCALE_MAX = 4;

export type VisualizerLayer = {
  id: string;
  kind: "visualizer";
  pluginId: string;
  enabled: boolean;
  opacity: number;
  transform: LayerTransform;
  params: ParamValues;
};

/** タイトル（文字は params.title / params.subtitle） */
export type TitleLayer = {
  id: "title";
  kind: "title";
  enabled: boolean;
  transform: LayerTransform;
  params: ParamValues;
};

/** 字幕 */
export type SubtitleLayer = {
  id: "subtitles";
  kind: "subtitles";
  enabled: boolean;
  transform: LayerTransform;
  params: ParamValues;
  cues: { start: number; end: number; text: string }[];
  fileName: string | null;
};

export type TextLayerId = "title" | "subtitles";

/** 画面全体にかけるエフェクト（配列の順に適用） */
export type EffectLayer = {
  id: string;
  kind: "effect";
  pluginId: string;
  enabled: boolean;
  params: ParamValues;
};

/** 矩形（出力ピクセル座標） */
export type Rect = { x: number; y: number; w: number; h: number };

/** 変形前の矩形 b に transform を適用した矩形（描画時と当たり判定で同じ計算を使う） */
export function transformRect(b: Rect, tr: LayerTransform, W: number, H: number): Rect {
  const cx = b.x + b.w / 2 + tr.x * W;
  const cy = b.y + b.h / 2 + tr.y * H;
  const w = b.w * tr.scale;
  const h = b.h * tr.scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export type Layer = BackgroundLayer | VisualizerLayer | EffectLayer | TitleLayer | SubtitleLayer;

export type Scene = {
  aspect: Aspect;
  background: BackgroundLayer;
  /** 配列の後ろほど手前に描く */
  visualizers: VisualizerLayer[];
  /** ビジュアライザーを描いた後にかける後処理 */
  effects: EffectLayer[];
  /** 書き出し範囲 */
  range: ProgramRange;
  /** 文字（いちばん手前に描く） */
  title: TitleLayer;
  subtitles: SubtitleLayer;
};

export function defaultScene(): Scene {
  return {
    aspect: "16:9",
    background: { id: "background", kind: "background", images: {}, dim: 0.35, zoomPunch: 0.4, fadeIn: 0, fadeOut: 0 },
    visualizers: [],
    effects: [],
    range: { start: 0, length: null },
    title: { id: "title", kind: "title", enabled: false, transform: { x: 0, y: 0, scale: 1 }, params: {} },
    subtitles: { id: "subtitles", kind: "subtitles", enabled: true, transform: { x: 0, y: 0, scale: 1 }, params: {}, cues: [], fileName: null },
  };
}

/** 比率に合う背景画像 ID を選ぶ（同じ比率 → 16:9 → 1:1 → 9:16 の順で代用） */
export function pickBackgroundImage(bg: BackgroundLayer, aspect: Aspect): string | undefined {
  return bg.images[aspect] ?? bg.images["16:9"] ?? bg.images["1:1"] ?? bg.images["9:16"];
}

/** 画像の縦横比から最も近い比率を判定する */
export function guessAspect(width: number, height: number): Aspect {
  const r = width / height;
  const candidates: [Aspect, number][] = [
    ["16:9", 16 / 9],
    ["1:1", 1],
    ["9:16", 9 / 16],
  ];
  let best: Aspect = "16:9";
  let bestD = Infinity;
  for (const [a, v] of candidates) {
    const d = Math.abs(Math.log(r / v));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
