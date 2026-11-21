import type { PerfSnapshot } from "./perfStats";
import type { TransportState } from "./clock";
import type { Scene } from "./scene";
import type { ExportProgress, ExportResult, ExportSettings } from "./exportTypes";
import type { PreEncodedAac } from "../audio/aacFallback";

/** メインスレッド → 描画 Worker */
export type ToWorker =
  | { type: "init"; canvas: OffscreenCanvas; scene: Scene }
  | { type: "scene"; scene: Scene }
  | { type: "transport"; transport: TransportState }
  /** モノラル PCM（buffer は転送される） */
  | { type: "loadTrack"; pcm: Float32Array; sampleRate: number }
  | { type: "image"; id: string; bitmap: ImageBitmap }
  | { type: "setRunning"; running: boolean }
  /** 書き出し開始。channels は元の音声（ステレオ等、転送される） */
  | { type: "export"; settings: ExportSettings; channels: Float32Array[]; sampleRate: number; aac?: PreEncodedAac }
  | { type: "cancelExport" };

export type TrackInfo = {
  duration: number;
  bpm: number;
  beats: Float32Array;
  analyzeMs: number;
};

/** 描画 Worker → メインスレッド */
export type FromWorker =
  | { type: "ready"; wasm: boolean; version: string }
  | { type: "trackInfo"; info: TrackInfo }
  | { type: "perf"; perf: PerfSnapshot }
  | { type: "error"; message: string }
  | { type: "exportProgress"; progress: ExportProgress }
  | { type: "exportDone"; result: ExportResult }
  | { type: "exportError"; message: string; cancelled: boolean };
