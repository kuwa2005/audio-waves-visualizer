import { atmosphere, rain, snow, space, sparkle, starrySky } from "./ambient";
import { drops } from "./drops";
import { galaxy } from "./galaxy";
import { lightning } from "./lightning";
import { lineScape } from "./lineScape";
import { mirrorBall } from "./mirrorBall";
import { oscilloscope, radialBars, spectrogram } from "./spectrumMore";
import { bubbles, laser, sakura } from "./ambientMore";
import { neonBars } from "./neonBars";
import { pulseRing } from "./pulseRing";
import { graphicEq, lineSpectrum } from "./spectrumClassic";
import { turntable } from "./turntable";
import { warpTunnel } from "./warpTunnel";
import type { VisualizerPlugin } from "./types";

/** 描画 Worker 側のプラグイン登録（catalog.ts のメタ情報と対応させる） */
export const REGISTRY: Record<string, VisualizerPlugin> = Object.fromEntries(
  [neonBars, lineSpectrum, graphicEq, pulseRing, warpTunnel, galaxy, lightning, lineScape, turntable, radialBars, oscilloscope, spectrogram, space, starrySky, sparkle, drops, mirrorBall, atmosphere, rain, snow, sakura, bubbles, laser].map((p) => [p.id, p]),
);
