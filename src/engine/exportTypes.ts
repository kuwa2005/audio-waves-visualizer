/** 書き出しの設定と進捗（メインスレッド ⇔ 描画 Worker） */

export type ExportSettings = {
  fps: 30 | 60;
  /** 映像ビットレート（bps） */
  videoBitrate: number;
  /** 書き出し範囲（秒） */
  start: number;
  end: number;
  /** 音声のフェードイン・アウト（秒、0 でなし） */
  audioFade: number;
};

/** 長さのプリセット（秒）。null は「曲の最後まで」 */
export const LENGTH_PRESETS: { seconds: number | null; label: string; hint: string }[] = [
  { seconds: 15, label: "15秒", hint: "TikTok・ショート" },
  { seconds: 30, label: "30秒", hint: "ショート全般" },
  { seconds: 60, label: "60秒", hint: "YouTube ショート・TikTok・ニコニコ" },
  { seconds: 90, label: "90秒", hint: "" },
  { seconds: 180, label: "3分", hint: "YouTube ショートの上限" },
  { seconds: null, label: "最後まで", hint: "" },
];

/** 音声に線形のフェードイン・アウトをかける（その場で書き換え） */
export function applyAudioFade(ch: Float32Array, sampleRate: number, seconds: number): void {
  const n = Math.min(Math.floor(seconds * sampleRate), Math.floor(ch.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    ch[i] *= g;
    ch[ch.length - 1 - i] *= g;
  }
}

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
