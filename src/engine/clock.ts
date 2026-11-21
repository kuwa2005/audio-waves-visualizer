/**
 * 再生位置の共有。メインスレッド（AudioContext で再生）から描画 Worker へ
 * 「ある絶対時刻に、曲の何秒地点だったか」を送り、Worker 側で現在位置を外挿する。
 * 絶対時刻は performance.timeOrigin + performance.now()（ウィンドウと Worker で共通の基準）。
 */
export type TransportState = {
  playing: boolean;
  /** anchorAbsMs の時点での曲内位置（秒） */
  mediaTime: number;
  /** 絶対時刻（ms） */
  anchorAbsMs: number;
  duration: number;
};

export function absNowMs(): number {
  return performance.timeOrigin + performance.now();
}

/** 現在の曲内位置（秒）。曲の長さを超えない */
export function transportTime(s: TransportState, nowAbsMs: number): number {
  const t = s.playing ? s.mediaTime + (nowAbsMs - s.anchorAbsMs) / 1000 : s.mediaTime;
  return s.duration > 0 ? Math.min(Math.max(t, 0), s.duration) : Math.max(t, 0);
}

export const STOPPED: TransportState = { playing: false, mediaTime: 0, anchorAbsMs: 0, duration: 0 };
