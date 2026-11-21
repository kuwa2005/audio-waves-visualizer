/**
 * AAC 音声の予備エンコード（ブラウザの AudioEncoder が AAC を作れない環境向け）。
 * ffmpeg.wasm（ネイティブ AAC エンコーダ、LGPL）で ADTS を作り、フレームに分けて MP4 に入れる。
 * コア（約 32MB）は必要になったときだけ読み込む。
 */

/** 書き出し Worker に渡すエンコード済み AAC */
export type PreEncodedAac = {
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig（MP4 の esds に入れる 2 バイト） */
  asc: Uint8Array;
  /** 全フレームを連結したデータと、各フレームの長さ */
  data: Uint8Array;
  sizes: Uint32Array;
};

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** AAC-LC の AudioSpecificConfig（2 バイト） */
export function audioSpecificConfig(objectType: number, sampleRate: number, channels: number): Uint8Array {
  const idx = ADTS_RATES.indexOf(sampleRate);
  if (idx < 0) throw new Error(`AAC が対応していないサンプリングレートです: ${sampleRate}`);
  return Uint8Array.from([(objectType << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3)]);
}

/** ADTS ストリームを生の AAC フレームに分ける */
export function parseAdts(buf: Uint8Array): { frames: Uint8Array[]; sampleRate: number; channels: number; objectType: number } {
  const frames: Uint8Array[] = [];
  let pos = 0;
  let sampleRate = 0;
  let channels = 0;
  let objectType = 2;
  while (pos + 7 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xf0) !== 0xf0) {
      pos++; // 同期ワードを探す
      continue;
    }
    const protectionAbsent = buf[pos + 1] & 1;
    const profile = (buf[pos + 2] >> 6) & 3;
    const rateIdx = (buf[pos + 2] >> 2) & 0xf;
    const ch = ((buf[pos + 2] & 1) << 2) | ((buf[pos + 3] >> 6) & 3);
    const frameLen = ((buf[pos + 3] & 3) << 11) | (buf[pos + 4] << 3) | ((buf[pos + 5] >> 5) & 7);
    const header = protectionAbsent ? 7 : 9;
    if (frameLen < header || pos + frameLen > buf.length) break;
    frames.push(buf.subarray(pos + header, pos + frameLen));
    sampleRate = ADTS_RATES[rateIdx] ?? sampleRate;
    channels = ch;
    objectType = profile + 1;
    pos += frameLen;
  }
  return { frames, sampleRate, channels, objectType };
}

/** 16bit PCM の WAV を作る（チャンネルはインターリーブ） */
export function buildWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const ch = channels.length;
  const n = channels[0].length;
  const dataBytes = n * ch * 2;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

type FFmpegLike = {
  load(cfg: { coreURL: string; wasmURL: string }): Promise<unknown>;
  writeFile(name: string, data: Uint8Array): Promise<unknown>;
  readFile(name: string): Promise<Uint8Array | string>;
  exec(args: string[]): Promise<number>;
  deleteFile(name: string): Promise<unknown>;
};

let ffmpegPromise: Promise<FFmpegLike> | null = null;

async function getFFmpeg(): Promise<FFmpegLike> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ff = new FFmpeg();
      const base = `${location.origin}${import.meta.env.BASE_URL}ffmpeg/`;
      await ff.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });
      return ff as unknown as FFmpegLike;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

/** 範囲を切り出してフェード済みの音声（channels）を AAC にする */
export async function encodeAacWithFfmpeg(channels: Float32Array[], sampleRate: number): Promise<PreEncodedAac> {
  const ff = await getFFmpeg();
  const ch = Math.min(2, channels.length);
  // AAC が扱えるレートに合わせる（ffmpeg 側で変換）
  const outRate = ADTS_RATES.includes(sampleRate) && sampleRate <= 48000 ? sampleRate : 48000;
  await ff.writeFile("in.wav", buildWav(channels.slice(0, ch), sampleRate));
  const code = await ff.exec(["-y", "-i", "in.wav", "-c:a", "aac", "-b:a", "192k", "-ar", String(outRate), "-f", "adts", "out.aac"]);
  if (code !== 0) throw new Error(`ffmpeg の AAC 変換に失敗しました（終了コード ${code}）`);
  const raw = await ff.readFile("out.aac");
  await ff.deleteFile("in.wav").catch(() => {});
  await ff.deleteFile("out.aac").catch(() => {});
  if (typeof raw === "string") throw new Error("ffmpeg の出力が不正です");
  const parsed = parseAdts(raw);
  if (parsed.frames.length === 0) throw new Error("AAC フレームを取り出せませんでした");
  const sizes = Uint32Array.from(parsed.frames.map((f) => f.length));
  const data = new Uint8Array(sizes.reduce((a, b) => a + b, 0));
  let o = 0;
  for (const f of parsed.frames) {
    data.set(f, o);
    o += f.length;
  }
  return {
    sampleRate: parsed.sampleRate,
    channels: parsed.channels,
    asc: audioSpecificConfig(parsed.objectType, parsed.sampleRate, parsed.channels),
    data,
    sizes,
  };
}
