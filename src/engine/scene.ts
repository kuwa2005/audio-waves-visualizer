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
};

export type VisualizerLayer = {
  id: string;
  kind: "visualizer";
  pluginId: string;
  enabled: boolean;
  opacity: number;
  params: ParamValues;
};

export type Layer = BackgroundLayer | VisualizerLayer;

export type Scene = {
  aspect: Aspect;
  background: BackgroundLayer;
  /** 配列の後ろほど手前に描く */
  visualizers: VisualizerLayer[];
};

export function defaultScene(): Scene {
  return {
    aspect: "16:9",
    background: { id: "background", kind: "background", images: {}, dim: 0.35, zoomPunch: 0.4 },
    visualizers: [],
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
