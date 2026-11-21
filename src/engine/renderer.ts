import { BackgroundRenderer } from "./background";
import type { AudioFeatures } from "./features";
import { fadeFactor, OUTPUT_SIZE, pickBackgroundImage, resolveRange, type Scene } from "./scene";
import { EFFECT_REGISTRY } from "../plugins/effects";
import { REGISTRY } from "../plugins/registry";
import { TextRenderer } from "../text/textRenderer";
import type { EffectContext, EffectInstance, FrameContext, SpriteCache, VisualizerInstance } from "../plugins/types";

/** 描画に必要な外部機能（プレビューと書き出しで同じものを渡す） */
export type RenderEnv = {
  /** 任意の時刻のスペクトル */
  spectrumAt(t: number): Float32Array;
  /** 曲の長さ（秒） */
  duration(): number;
  /** サンプリングレート（Hz） */
  sampleRate(): number;
};

/**
 * シーン全体の 1 フレーム描画: 背景 → ビジュアライザー（後ろから順） → エフェクト（順に適用）。
 * プレビューと書き出しで同じクラスを使う（別インスタンス）。内部状態はインスタンスごとに独立。
 */
export class SceneRenderer {
  private readonly background = new BackgroundRenderer();
  private readonly instances = new Map<string, { pluginId: string; inst: VisualizerInstance }>();
  private readonly effects = new Map<string, { pluginId: string; inst: EffectInstance }>();
  private readonly scratchCanvases: OffscreenCanvas[] = [];
  private readonly smallCanvases = new Map<string, OffscreenCanvas>();
  private readonly text = new TextRenderer();

  constructor(private readonly sprites: SpriteCache) {}

  /** シーク時などに平滑化・残像をリセット */
  reset(): void {
    for (const { inst } of this.instances.values()) inst.reset?.();
    for (const { inst } of this.effects.values()) inst.reset?.();
  }

  invalidateBackground(): void {
    this.background.invalidate();
  }

  /** シーンから消えたレイヤーのインスタンスを破棄 */
  prune(scene: Scene): void {
    const ids = new Set([...scene.visualizers.map((v) => v.id), ...scene.effects.map((e) => e.id)]);
    for (const id of this.instances.keys()) if (!ids.has(id)) this.instances.delete(id);
    for (const id of this.effects.keys()) if (!ids.has(id)) this.effects.delete(id);
  }

  private instanceFor(layerId: string, pluginId: string): VisualizerInstance | null {
    const cur = this.instances.get(layerId);
    if (cur && cur.pluginId === pluginId) return cur.inst;
    const plugin = REGISTRY[pluginId];
    if (!plugin) return null;
    const inst = plugin.create();
    this.instances.set(layerId, { pluginId, inst });
    return inst;
  }

  private effectFor(layerId: string, pluginId: string): EffectInstance | null {
    const cur = this.effects.get(layerId);
    if (cur && cur.pluginId === pluginId) return cur.inst;
    const plugin = EFFECT_REGISTRY[pluginId];
    if (!plugin) return null;
    const inst = plugin.create();
    this.effects.set(layerId, { pluginId, inst });
    return inst;
  }

  private scratch(i: number, W: number, H: number): OffscreenCanvas {
    let c = this.scratchCanvases[i];
    if (!c || c.width !== W || c.height !== H) {
      c = new OffscreenCanvas(W, H);
      this.scratchCanvases[i] = c;
    }
    return c;
  }

  private small(i: number, div: number, W: number, H: number): OffscreenCanvas {
    const w = Math.max(1, Math.ceil(W / div));
    const h = Math.max(1, Math.ceil(H / div));
    const key = `${i}:${div}`;
    let c = this.smallCanvases.get(key);
    if (!c || c.width !== w || c.height !== h) {
      c = new OffscreenCanvas(w, h);
      this.smallCanvases.set(key, c);
    }
    return c;
  }

  render(
    ctx: OffscreenCanvasRenderingContext2D,
    scene: Scene,
    images: ReadonlyMap<string, ImageBitmap>,
    features: AudioFeatures,
    t: number,
    dt: number,
    env: RenderEnv,
  ): void {
    const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
    const imgId = pickBackgroundImage(scene.background, scene.aspect);
    const artwork = imgId ? images.get(imgId) : undefined;
    const bg = scene.background;
    const duration = env.duration();
    let fade = 1;
    if (duration > 0 && (bg.fadeIn > 0 || bg.fadeOut > 0)) {
      const r = resolveRange(scene.range, duration);
      fade = fadeFactor(t, r.start, r.end, bg.fadeIn, bg.fadeOut);
    }
    this.background.render(ctx, W, H, bg, artwork, imgId, features);

    const fc: FrameContext = {
      width: W,
      height: H,
      t,
      dt,
      features,
      sprites: this.sprites,
      spectrumAt: env.spectrumAt,
      duration: env.duration(),
      sampleRate: env.sampleRate(),
      artwork,
      artworkId: imgId,
    };
    for (const layer of scene.visualizers) {
      if (!layer.enabled || layer.opacity <= 0) continue;
      const inst = this.instanceFor(layer.id, layer.pluginId);
      if (!inst) continue;
      // 注: layer.opacity の反映はフェーズ4（レイヤー合成）で実装する
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      const tr = layer.transform;
      if (tr && (tr.x !== 0 || tr.y !== 0 || tr.scale !== 1)) {
        // 自身の描画範囲の中心を基準に拡大し、移動する（当たり判定の transformRect と同じ計算）
        const b = REGISTRY[layer.pluginId].bounds(layer.params, W, H);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        ctx.translate(cx + tr.x * W, cy + tr.y * H);
        ctx.scale(tr.scale, tr.scale);
        ctx.translate(-cx, -cy);
      }
      inst.render(ctx, fc, layer.params);
      ctx.restore();
    }

    if (scene.effects.length > 0) this.applyEffects(ctx, scene, fc, W, H);
    // 文字はエフェクトの後に描く（揺れ・ブラーで読みにくくならないように）
    this.text.render(ctx, scene, W, H, t, duration, features);

    // 画面全体のフェードイン・アウト（背景・スペアナ・エフェクト・文字のすべてに黒を重ねる）
    if (fade < 1) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1 - fade;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  private applyEffects(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, fc: FrameContext, W: number, H: number): void {
    const fx: EffectContext = {
      ...fc,
      scratch: (i) => this.scratch(i, W, H),
      small: (i, div) => this.small(i, div, W, H),
    };
    for (const layer of scene.effects) {
      if (!layer.enabled) continue;
      const inst = this.effectFor(layer.id, layer.pluginId);
      if (!inst) continue;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      inst.apply(ctx, fx, layer.params);
      ctx.restore();
    }
  }
}
