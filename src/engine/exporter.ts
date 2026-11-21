/// <reference lib="webworker" />
/**
 * MP4 書き出し（描画 Worker 内で実行）。
 * プレビューと同じ SceneRenderer で 1 フレームずつ描き、WebCodecs でエンコードして mp4-muxer で格納する。
 * 実時間に縛られないので、端末が速ければ実時間より速く、遅くてもコマ落ちなく書き出せる。
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { pickAudio, pickVideo } from "./codecs";
import type { AudioFeatures } from "./features";
import { frameCount, type ExportProgress, type ExportResult, type ExportSettings } from "./exportTypes";
import { SceneRenderer, type RenderEnv } from "./renderer";
import { OUTPUT_SIZE, type Scene } from "./scene";
import type { SpriteCache } from "../plugins/types";

export type ExportJob = {
  scene: Scene;
  images: ReadonlyMap<string, ImageBitmap>;
  sprites: SpriteCache;
  settings: ExportSettings;
  /** 時刻 t の特徴量を out に書き込む */
  features(t: number): AudioFeatures;
  env: RenderEnv;
  audio: { channels: Float32Array[]; sampleRate: number };
  onProgress(p: ExportProgress): void;
  isCancelled(): boolean;
};

export class ExportCancelled extends Error {
  constructor() {
    super("書き出しを中止しました");
  }
}

/** 線形補間による簡易リサンプリング（Opus の 48kHz 要件のため） */
export function resampleLinear(src: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return src;
  const n = Math.round((src.length * to) / from);
  const out = new Float32Array(n);
  const ratio = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    const f = p - j;
    const a = src[Math.min(j, src.length - 1)];
    const b = src[Math.min(j + 1, src.length - 1)];
    out[i] = a + (b - a) * f;
  }
  return out;
}

const yieldToEvents = () => new Promise<void>((r) => setTimeout(r, 0));

export async function runExport(job: ExportJob): Promise<ExportResult> {
  const t0 = performance.now();
  const { scene, settings } = job;
  const { width, height } = OUTPUT_SIZE[scene.aspect];
  const fps = settings.fps;
  const total = frameCount(settings);
  if (total <= 0) throw new Error("書き出し範囲が空です");
  job.onProgress({ phase: "preparing", frame: 0, totalFrames: total, speed: 0, elapsedSec: 0 });

  const video = await pickVideo(width, height, fps, settings.videoBitrate);
  const audio = await pickAudio(job.audio.sampleRate, job.audio.channels.length);
  const audioRate = audio.config.sampleRate;
  const audioCh = audio.config.numberOfChannels;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: video.mux, width, height, frameRate: fps },
    audio: { codec: audio.mux, numberOfChannels: audioCh, sampleRate: audioRate },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encodeError: unknown = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encodeError = e),
  });
  venc.configure(video.config);
  const aenc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => (encodeError = e),
  });
  aenc.configure(audio.config);

  const close = () => {
    if (venc.state !== "closed") venc.close();
    if (aenc.state !== "closed") aenc.close();
  };

  try {
    // ---- 音声（範囲を切り出し、必要ならリサンプリングして 1024 サンプルずつ） ----
    const srcRate = job.audio.sampleRate;
    const from = Math.floor(settings.start * srcRate);
    const to = Math.min(Math.floor(settings.end * srcRate), job.audio.channels[0].length);
    const chans: Float32Array[] = [];
    for (let c = 0; c < audioCh; c++) {
      const src = job.audio.channels[Math.min(c, job.audio.channels.length - 1)].subarray(from, to);
      chans.push(resampleLinear(src, srcRate, audioRate));
    }
    const aLen = chans[0].length;
    const CHUNK = 1024;
    for (let i = 0; i < aLen; i += CHUNK) {
      const n = Math.min(CHUNK, aLen - i);
      const planar = new Float32Array(n * audioCh);
      for (let c = 0; c < audioCh; c++) planar.set(chans[c].subarray(i, i + n), c * n);
      const ad = new AudioData({
        format: "f32-planar",
        sampleRate: audioRate,
        numberOfFrames: n,
        numberOfChannels: audioCh,
        timestamp: Math.round((i / audioRate) * 1e6),
        data: planar,
      });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 32) await yieldToEvents();
    }

    // ---- 映像 ----
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
    const renderer = new SceneRenderer(job.sprites);
    const frameUs = 1e6 / fps;
    const keyEvery = fps * 2;
    let lastReport = 0;
    for (let i = 0; i < total; i++) {
      if (job.isCancelled()) throw new ExportCancelled();
      if (encodeError) throw encodeError;
      const t = settings.start + i / fps;
      renderer.render(ctx, scene, job.images, job.features(t), t, i === 0 ? 0 : 1 / fps, job.env);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      venc.encode(vf, { keyFrame: i % keyEvery === 0 });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      const now = performance.now();
      if (now - lastReport > 250 || i === total - 1) {
        lastReport = now;
        const elapsed = (now - t0) / 1000;
        job.onProgress({ phase: "rendering", frame: i + 1, totalFrames: total, speed: (i + 1) / fps / Math.max(elapsed, 1e-3), elapsedSec: elapsed });
        await yieldToEvents(); // 中止メッセージを受け取れるようにする
      }
    }

    job.onProgress({ phase: "finalizing", frame: total, totalFrames: total, speed: 0, elapsedSec: (performance.now() - t0) / 1000 });
    await venc.flush();
    await aenc.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    return {
      buffer: target.buffer,
      mimeType: "video/mp4",
      videoCodec: video.label,
      audioCodec: audio.label,
      durationSec: total / fps,
      elapsedSec: (performance.now() - t0) / 1000,
    };
  } finally {
    close();
  }
}
