import { BackgroundRenderer } from "./background";
import type { AudioFeatures } from "./features";
import { OUTPUT_SIZE, pickBackgroundImage, type Scene } from "./scene";
import { REGISTRY } from "../plugins/registry";
import type { FrameContext, SpriteCache, VisualizerInstance } from "../plugins/types";

/**
 * シーン全体の 1 フレーム描画。プレビューと書き出しで同じクラスを使う（別インスタンス）。
 * 内部状態（平滑化・残像）はインスタンスごとに独立しているので、書き出し中もプレビューの状態を汚さない。
 */
export class SceneRenderer {
  private readonly background = new BackgroundRenderer();
  private readonly instances = new Map<string, { pluginId: string; inst: VisualizerInstance }>();

  constructor(private readonly sprites: SpriteCache) {}

  /** シーク時などに平滑化・残像をリセット */
  reset(): void {
    for (const { inst } of this.instances.values()) inst.reset?.();
  }

  invalidateBackground(): void {
    this.background.invalidate();
  }

  /** シーンから消えたレイヤーのインスタンスを破棄 */
  prune(scene: Scene): void {
    const ids = new Set(scene.visualizers.map((v) => v.id));
    for (const id of this.instances.keys()) if (!ids.has(id)) this.instances.delete(id);
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

  render(
    ctx: OffscreenCanvasRenderingContext2D,
    scene: Scene,
    images: ReadonlyMap<string, ImageBitmap>,
    features: AudioFeatures,
    t: number,
    dt: number,
  ): void {
    const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
    const imgId = pickBackgroundImage(scene.background, scene.aspect);
    this.background.render(ctx, W, H, scene.background, imgId ? images.get(imgId) : undefined, imgId, features);

    const fc: FrameContext = { width: W, height: H, t, dt, features, sprites: this.sprites };
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
  }
}
