import type { AudioFeatures } from "../engine/features";
import type { ParamValues, Rect } from "../engine/scene";

/** パラメータ定義。インスペクターの UI はここから自動生成する */
export type ParamDef =
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: "color"; default: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "boolean"; default: boolean };

/** UI・Worker 共通のメタ情報（描画コードを含まない） */
export type PluginMeta = {
  id: string;
  name: string;
  description: string;
  params: ParamDef[];
  /** 変形前の描画範囲（出力ピクセル座標）。移動・拡大の基準点と、マウスの当たり判定に使う */
  bounds(params: ParamValues, W: number, H: number): Rect;
};

export type Ctx2D = OffscreenCanvasRenderingContext2D;

export type FrameContext = {
  width: number;
  height: number;
  /** 曲内の時刻（秒） */
  t: number;
  /** 前フレームからの経過秒（シーク直後は 0） */
  dt: number;
  features: AudioFeatures;
  /** 共有の描画素材（発光スプライトなど） */
  sprites: SpriteCache;
};

export type SpriteCache = {
  /** 白い放射状の光（128px）。加算合成で色付きの光として使う */
  glow: OffscreenCanvas;
  /** 指定色の光（色ごとにキャッシュ） */
  tintedGlow(color: string): OffscreenCanvas;
};

export interface VisualizerInstance {
  render(ctx: Ctx2D, frame: FrameContext, params: ParamValues): void;
  /** シーク時などに内部状態（平滑化・残像）を初期化する */
  reset?(): void;
}

export type VisualizerPlugin = PluginMeta & {
  create(): VisualizerInstance;
};

export function defaultParams(meta: PluginMeta): ParamValues {
  const out: ParamValues = {};
  for (const p of meta.params) out[p.key] = p.default;
  return out;
}

export function num(params: ParamValues, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" ? v : fallback;
}

export function str(params: ParamValues, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}
