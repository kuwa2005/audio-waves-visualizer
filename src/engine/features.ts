/**
 * 音声特徴量。ビジュアライザーは生の FFT ではなく、主にこれで動かす。
 * 曲の事前解析結果（フレーム列）と時刻 t から決まる（決定的）。
 */

export type AudioFeatures = {
  /** 帯域の強さ 0..1（曲内で正規化済み） */
  sub: number;
  bass: number;
  mid: number;
  high: number;
  /** 全体の音量 0..1 */
  rms: number;
  /** 音の立ち上がりの強さ 0..1 */
  onset: number;
  bpm: number;
  /** 何拍目か（0 始まり、最初の拍の前は -1） */
  beatIndex: number;
  /** 拍の中での位置 0..1 */
  beatPhase: number;
  /** 直前の拍からの経過秒 */
  sinceBeat: number;
  /** 拍の瞬間に 1 になり減衰する値（キックの「ドン」に合わせた演出用） */
  kick: number;
  /** 周波数スペクトル（振幅 0..1、低域→高域）。長さは binCount */
  spectrum: Float32Array;
};

/** 曲の事前解析結果への参照（WASM メモリ上のビュー） */
export type TrackData = {
  frames: number;
  frameRate: number;
  centerOffset: number;
  bpm: number;
  rms: Float32Array;
  onset: Float32Array;
  /** [sub, bass, mid, high] × frames */
  bands: Float32Array;
  beats: Float32Array;
};

/** 拍の後の減衰の速さ（1/秒） */
export const KICK_DECAY = 7;

/** 昇順配列から t 以下の最後の要素の位置を二分探索（無ければ -1） */
export function lastIndexAtOrBefore(sorted: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function lerpAt(arr: Float32Array, stride: number, offset: number, pos: number, frames: number): number {
  if (frames === 0) return 0;
  const p = Math.min(Math.max(pos, 0), frames - 1);
  const i = Math.floor(p);
  const j = Math.min(i + 1, frames - 1);
  const f = p - i;
  return arr[i * stride + offset] * (1 - f) + arr[j * stride + offset] * f;
}

/** 時刻 t の特徴量を out に書き込む（毎フレームのオブジェクト生成を避けるため out を再利用） */
export function computeFeatures(track: TrackData, t: number, spectrum: Float32Array, out: AudioFeatures): AudioFeatures {
  const pos = (t - track.centerOffset) * track.frameRate;
  out.sub = lerpAt(track.bands, 4, 0, pos, track.frames);
  out.bass = lerpAt(track.bands, 4, 1, pos, track.frames);
  out.mid = lerpAt(track.bands, 4, 2, pos, track.frames);
  out.high = lerpAt(track.bands, 4, 3, pos, track.frames);
  out.rms = lerpAt(track.rms, 1, 0, pos, track.frames);
  out.onset = lerpAt(track.onset, 1, 0, pos, track.frames);
  out.bpm = track.bpm;
  const bi = lastIndexAtOrBefore(track.beats, t);
  out.beatIndex = bi;
  if (bi >= 0) {
    const prev = track.beats[bi];
    const next = bi + 1 < track.beats.length ? track.beats[bi + 1] : prev + (track.bpm > 0 ? 60 / track.bpm : 0.5);
    out.sinceBeat = t - prev;
    out.beatPhase = Math.min(1, Math.max(0, (t - prev) / Math.max(1e-3, next - prev)));
  } else {
    out.sinceBeat = Infinity;
    out.beatPhase = 0;
  }
  out.kick = Number.isFinite(out.sinceBeat) ? Math.exp(-out.sinceBeat * KICK_DECAY) : 0;
  out.spectrum = spectrum;
  return out;
}

export function emptyFeatures(binCount = 1025): AudioFeatures {
  return {
    sub: 0,
    bass: 0,
    mid: 0,
    high: 0,
    rms: 0,
    onset: 0,
    bpm: 0,
    beatIndex: -1,
    beatPhase: 0,
    sinceBeat: Infinity,
    kick: 0,
    spectrum: new Float32Array(binCount),
  };
}
