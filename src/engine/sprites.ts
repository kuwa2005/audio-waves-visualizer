import type { SpriteCache } from "../plugins/types";

/** 放射グラデーションの光。発光表現は shadowBlur の代わりにこれを加算合成する */
function makeGlow(size: number, color: string): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.22, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.globalAlpha = 1;
  g.fillRect(0, 0, size, size);
  // 中心を少し白く
  const core = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.18);
  core.addColorStop(0, "rgba(255,255,255,0.55)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  return c;
}

export function createSpriteCache(): SpriteCache {
  const tinted = new Map<string, OffscreenCanvas>();
  return {
    glow: makeGlow(128, "rgba(255,255,255,1)"),
    tintedGlow(color: string) {
      let s = tinted.get(color);
      if (!s) {
        if (tinted.size > 512) tinted.clear();
        s = makeGlow(128, color);
        tinted.set(color, s);
      }
      return s;
    },
  };
}
