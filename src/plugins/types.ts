import type { AudioFeatures } from "../engine/features";
import type { ParamValues, Rect } from "../engine/scene";

/** パラメータ定義。インスペクターの UI はここから自動生成する */
export type ParamDef =
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: "color"; default: string }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | { key: string; label: string; type: "text"; default: string; multiline?: boolean; placeholder?: string };

/** UI・Worker 共通のメタ情報（描画コードを含まない） */
export type PluginMeta = {
  id: string;
  name: string;
  description: string;
  /** UI での分類（未指定はスペクトラム） */
  category?: "spectrum" | "ambient";
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
  /** 任意の時刻のスペクトル（履歴表示用）。返り値は次の呼び出しで上書きされるので、必要ならコピーする */
  spectrumAt(t: number): Float32Array;
  /** 曲の長さ（秒）。曲が無ければ 0 */
  duration: number;
  /** サンプリングレート（Hz）。スペクトルの bin k の周波数 = k × sampleRate / ((spectrum.length − 1) × 2) */
  sampleRate: number;
  /** 現在の背景画像（レコードのラベル等に使える）と、そのキャッシュ用 ID */
  artwork?: ImageBitmap;
  artworkId?: string;
};

/** エフェクト（画面全体への後処理）に渡す作業用キャンバス */
export type EffectContext = FrameContext & {
  /** 出力と同サイズの作業用キャンバス（index ごとに使い回し） */
  scratch(index: number): OffscreenCanvas;
  /** 縮小サイズの作業用キャンバス（ブラー用。divisor 分の 1） */
  small(index: number, divisor: number): OffscreenCanvas;
};

export interface EffectInstance {
  /** ctx.canvas（ここまでの描画結果）を加工する */
  apply(ctx: Ctx2D, frame: EffectContext, params: ParamValues): void;
  reset?(): void;
}

export type EffectMeta = Omit<PluginMeta, "bounds">;

export type EffectPlugin = EffectMeta & {
  create(): EffectInstance;
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

export function defaultParams(meta: { params: ParamDef[] }): ParamValues {
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
