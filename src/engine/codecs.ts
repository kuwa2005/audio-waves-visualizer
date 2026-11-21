/**
 * 書き出しに使うコーデックの選択（Worker・メインスレッドの両方から使う）。
 * 再生互換性の高い順（H.264 / AAC）に試し、使えなければ代替に切り替える。
 */
export type VideoChoice = { config: VideoEncoderConfig; mux: "avc" | "vp9" | "av1"; label: string };
export type AudioChoice = { config: AudioEncoderConfig; mux: "aac" | "opus"; label: string };

/** H.264 のレベル: 1080p60 や 1080x1920 を収めるため 4.2、それを超える場合は 5.1 */
function avcCodec(width: number, height: number, fps: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = mbs <= 8192 && mbs * fps <= 522_240 ? "2a" : "33";
  return `avc1.6400${level}`;
}

export async function pickVideo(width: number, height: number, fps: number, bitrate: number): Promise<VideoChoice> {
  const base = { width, height, bitrate, framerate: fps, latencyMode: "quality" as const };
  const candidates: VideoChoice[] = [
    { config: { ...base, codec: avcCodec(width, height, fps), avc: { format: "avc" } }, mux: "avc", label: "H.264" },
    { config: { ...base, codec: "vp09.00.41.08" }, mux: "vp9", label: "VP9" },
    { config: { ...base, codec: "av01.0.09M.08" }, mux: "av1", label: "AV1" },
  ];
  for (const c of candidates) {
    try {
      if ((await VideoEncoder.isConfigSupported(c.config)).supported) return c;
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error("このブラウザでは動画のエンコード（H.264 / VP9 / AV1）が使えません");
}

export async function pickAudio(sampleRate: number, channels: number): Promise<AudioChoice> {
  const ch = Math.min(2, channels);
  const candidates: AudioChoice[] = [];
  // AAC は Windows / macOS のエンコーダーが対応する 44.1k / 48k・192kbps で試す（256kbps は拒否される環境がある）
  for (const rate of [sampleRate, 48000, 44100].filter((r, i, a) => (r === 44100 || r === 48000) && a.indexOf(r) === i)) {
    candidates.push({ config: { codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: ch, bitrate: 192_000 }, mux: "aac", label: "AAC" });
  }
  candidates.push({ config: { codec: "opus", sampleRate: 48000, numberOfChannels: ch, bitrate: 192_000 }, mux: "opus", label: "Opus" });
  for (const c of candidates) {
    try {
      if ((await AudioEncoder.isConfigSupported(c.config)).supported) return c;
    } catch {
      /* 次の候補へ */
    }
  }
  throw new Error("このブラウザでは音声のエンコード（AAC / Opus）が使えません");
}

