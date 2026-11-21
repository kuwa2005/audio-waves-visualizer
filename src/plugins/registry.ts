import { neonBars } from "./neonBars";
import { pulseRing } from "./pulseRing";
import type { VisualizerPlugin } from "./types";

/** 描画 Worker 側のプラグイン登録（catalog.ts のメタ情報と対応させる） */
export const REGISTRY: Record<string, VisualizerPlugin> = {
  [neonBars.id]: neonBars,
  [pulseRing.id]: pulseRing,
};
