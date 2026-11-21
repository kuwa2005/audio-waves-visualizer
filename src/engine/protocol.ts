import type { PerfSnapshot } from "./perfStats";

/** メインスレッド → 描画 Worker */
export type ToWorker =
  | { type: "init"; canvas: OffscreenCanvas; width: number; height: number }
  | { type: "resize"; width: number; height: number }
  | { type: "setRunning"; running: boolean };

/** 描画 Worker → メインスレッド */
export type FromWorker =
  | { type: "ready"; wasm: boolean }
  | { type: "perf"; perf: PerfSnapshot }
  | { type: "error"; message: string };
