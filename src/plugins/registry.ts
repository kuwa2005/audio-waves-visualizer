import { galaxy } from "./galaxy";
import { lightning } from "./lightning";
import { lineScape } from "./lineScape";
import { neonBars } from "./neonBars";
import { pulseRing } from "./pulseRing";
import { warpTunnel } from "./warpTunnel";
import type { VisualizerPlugin } from "./types";

/** 描画 Worker 側のプラグイン登録（catalog.ts のメタ情報と対応させる） */
export const REGISTRY: Record<string, VisualizerPlugin> = Object.fromEntries(
  [neonBars, pulseRing, warpTunnel, galaxy, lightning, lineScape].map((p) => [p.id, p]),
);
