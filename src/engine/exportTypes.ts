/** 書き出しの設定と進捗（メインスレッド ⇔ 描画 Worker） */

export type ExportSettings = {
  fps: 30 | 60;
  /** 映像ビットレート（bps） */
  videoBitrate: number;
  /** 書き出し範囲（秒） */
  start: number;
  end: number;
};

export type ExportProgress = {
  phase: "preparing" | "rendering" | "finalizing";
  frame: number;
  totalFrames: number;
  /** 書き出し速度（実時間の何倍か） */
  speed: number;
  elapsedSec: number;
};

export type ExportResult = {
  buffer: ArrayBuffer;
  mimeType: string;
  videoCodec: string;
  audioCodec: string;
  durationSec: number;
  elapsedSec: number;
};

/** 映像ビットレートのプリセット（1080p 基準） */
export const QUALITY_PRESETS = [
  { key: "standard", label: "標準", bitrate: 8_000_000 },
  { key: "high", label: "高画質", bitrate: 14_000_000 },
  { key: "max", label: "最高", bitrate: 24_000_000 },
] as const;

/** 総フレーム数 */
export function frameCount(s: ExportSettings): number {
  return Math.max(0, Math.round((s.end - s.start) * s.fps));
}

/** 書き出し範囲を曲の長さに収める */
export function clampRange(start: number, end: number, duration: number): { start: number; end: number } {
  const s = Math.min(Math.max(0, start), duration);
  const e = Math.min(Math.max(s, end), duration);
  return { start: s, end: e };
}
