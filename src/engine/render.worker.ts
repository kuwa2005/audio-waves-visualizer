/// <reference lib="webworker" />
/**
 * 描画 Worker。OffscreenCanvas + Canvas 2D でメインスレッドと独立して描画する。
 *
 * 1 フレームの流れ:
 *   時刻 t（再生位置から外挿）→ WASM で t のスペクトル → 事前解析から特徴量 → SceneRenderer で描画
 * 書き出しも同じ Worker・同じ SceneRenderer（別インスタンス）で行うので、プレビューと結果が一致する。
 */
import init, { Analyzer, Track } from "../wasm/pkg/awv_core";
import { absNowMs, STOPPED, transportTime, type TransportState } from "./clock";
import { ExportCancelled, runExport } from "./exporter";
import { computeFeatures, emptyFeatures, type AudioFeatures, type TrackData } from "./features";
import { PerfStats } from "./perfStats";
import type { FromWorker, ToWorker } from "./protocol";
import { SceneRenderer, type RenderEnv } from "./renderer";
import { setWasmMemory } from "./wasmEnv";
import { OUTPUT_SIZE, type Scene } from "./scene";
import { createSpriteCache } from "./sprites";
import type { SpriteCache } from "../plugins/types";

const ENGINE_VERSION = "0.3.0";
const IDLE_SAMPLE_RATE = 48000;
const IDLE_FFT = 2048;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let scene: Scene | null = null;
let transport: TransportState = STOPPED;
let running = true;
let exporting = false;
let cancelRequested = false;
let memory: WebAssembly.Memory | null = null;
let sprites: SpriteCache | null = null;
let preview: SceneRenderer | null = null;
const images = new Map<string, ImageBitmap>();
const perf = new PerfStats();
let features: AudioFeatures = emptyFeatures();

// 曲が読み込まれていないときのデモ用（合成信号）
let idleAnalyzer: Analyzer | null = null;
// 読み込んだ曲
let track: Track | null = null;
let trackData: TrackData | null = null;

let lastFrameTs = 0;
let lastPerfPost = 0;
let lastT = 0;

const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

const raf: (cb: (ts: number) => void) => void =
  typeof self.requestAnimationFrame === "function"
    ? (cb) => self.requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 1000 / 60);

/** WASM メモリが拡張されると古いビューは無効になるので、使う直前に作る */
function f32(ptr: number, len: number): Float32Array {
  return new Float32Array(memory!.buffer, ptr, len);
}

function refreshTrackViews(): void {
  if (!track || !memory) return;
  const frames = track.frames();
  trackData = {
    frames,
    frameRate: track.frame_rate(),
    centerOffset: track.center_offset(),
    bpm: track.bpm(),
    rms: f32(track.rms_ptr(), frames),
    onset: f32(track.onset_ptr(), frames),
    bands: f32(track.bands_ptr(), frames * 4),
    beats: f32(track.beats_ptr(), track.beat_count()),
  };
}

/** 現在フレームのスペクトル（WASM のバッファは履歴取得で上書きされるのでコピーして持つ） */
let specBuf = new Float32Array(1025);

/** 曲の時刻 t の特徴量（プレビュー・書き出し共通、決定的） */
function trackFeatures(t: number): AudioFeatures {
  track!.spectrum_at(t);
  if (trackData!.rms.buffer !== memory!.buffer) refreshTrackViews();
  const n = track!.bin_count();
  if (specBuf.length !== n) specBuf = new Float32Array(n);
  specBuf.set(f32(track!.magnitudes_ptr(), n));
  return computeFeatures(trackData!, t, specBuf, features);
}

/** 描画プラグインに渡す環境（任意時刻のスペクトル） */
const env: RenderEnv = {
  spectrumAt(t: number): Float32Array {
    if (!track) return features.spectrum;
    track.spectrum_at(t);
    return f32(track.magnitudes_ptr(), track.bin_count());
  },
};

function idleSignal(buf: Float32Array, t: number): void {
  const beat = (t * 2) % 1;
  const kick = Math.exp(-beat * 8);
  for (let i = 0; i < buf.length; i++) {
    const s = t + i / IDLE_SAMPLE_RATE;
    buf[i] =
      0.8 * kick * Math.sin(2 * Math.PI * 55 * s) +
      0.22 * Math.sin(2 * Math.PI * 440 * s) * (0.6 + 0.4 * Math.sin(t * 1.3)) +
      0.15 * Math.sin(2 * Math.PI * 1320 * s) * (0.5 + 0.5 * Math.sin(t * 0.7)) +
      0.06 * (1 - beat) * (Math.random() * 2 - 1);
  }
}

function idleFeatures(t: number): AudioFeatures {
  const a = idleAnalyzer!;
  idleSignal(f32(a.input_ptr(), IDLE_FFT), t);
  a.analyze();
  const beat = (t * 2) % 1;
  features.spectrum = f32(a.magnitudes_ptr(), a.bin_count());
  features.kick = Math.exp(-beat * 7);
  features.bass = Math.min(1, a.bass() * 3);
  features.sub = Math.min(1, a.sub() * 3);
  features.mid = Math.min(1, a.mid() * 6);
  features.high = Math.min(1, a.high() * 12);
  features.rms = features.bass;
  features.onset = features.kick;
  features.bpm = 120;
  features.beatIndex = Math.floor(t * 2);
  features.beatPhase = beat;
  features.sinceBeat = beat / 2;
  return features;
}

function frame(ts: number): void {
  if (!running) return;
  raf(frame);
  if (!ctx || !scene || !preview || !memory || exporting) return;
  const interval = lastFrameTs ? ts - lastFrameTs : 1000 / 60;
  lastFrameTs = ts;
  const t0 = performance.now();

  const t = track ? transportTime(transport, absNowMs()) : ts / 1000;
  let dt = t - lastT;
  if (dt < 0 || dt > 0.25) {
    // シーク・巻き戻し: 平滑化や残像をリセット
    preview.reset();
    dt = 0;
  }
  lastT = t;
  const f = track ? trackFeatures(t) : idleAnalyzer ? idleFeatures(t) : features;
  preview.render(ctx, scene, images, f, t, dt, env);

  perf.push(performance.now() - t0, interval);
  if (ts - lastPerfPost > 500) {
    lastPerfPost = ts;
    post({ type: "perf", perf: perf.snapshot() });
  }
}

function applyCanvasSize(): void {
  if (!ctx || !scene) return;
  const { width, height } = OUTPUT_SIZE[scene.aspect];
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    preview?.invalidateBackground();
  }
}

function loadTrack(pcm: Float32Array, sampleRate: number): void {
  if (!memory) throw new Error("WASM が初期化されていません");
  const t0 = performance.now();
  track?.free();
  track = null;
  trackData = null;
  const tr = new Track(sampleRate, pcm.length);
  f32(tr.pcm_ptr(), pcm.length).set(pcm);
  tr.analyze();
  track = tr;
  refreshTrackViews();
  preview?.reset();
  features = emptyFeatures(tr.bin_count());
  const beats = new Float32Array(trackData!.beats); // コピーして送る
  post(
    { type: "trackInfo", info: { duration: tr.duration(), bpm: tr.bpm(), beats, analyzeMs: performance.now() - t0 } },
    [beats.buffer],
  );
}

async function startExport(msg: Extract<ToWorker, { type: "export" }>): Promise<void> {
  if (exporting) throw new Error("書き出し中です");
  if (!track || !scene || !sprites) throw new Error("音声が読み込まれていません");
  exporting = true;
  cancelRequested = false;
  try {
    const result = await runExport({
      scene,
      images,
      sprites,
      settings: msg.settings,
      features: trackFeatures,
      env,
      audio: { channels: msg.channels, sampleRate: msg.sampleRate },
      onProgress: (progress) => post({ type: "exportProgress", progress }),
      isCancelled: () => cancelRequested,
    });
    post({ type: "exportDone", result }, [result.buffer]);
  } catch (e) {
    post({ type: "exportError", message: e instanceof Error ? e.message : String(e), cancelled: e instanceof ExportCancelled });
  } finally {
    exporting = false;
    lastFrameTs = 0;
    preview?.reset();
  }
}

// init 完了（WASM 読み込み）まで他のメッセージを待たせるための合図
let resolveReady: () => void = () => {};
const initialized = new Promise<void>((r) => (resolveReady = r));

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type !== "init" && msg.type !== "cancelExport") await initialized;
    switch (msg.type) {
      case "init": {
        scene = msg.scene;
        ctx = msg.canvas.getContext("2d", { alpha: false, desynchronized: true }) as OffscreenCanvasRenderingContext2D;
        sprites = createSpriteCache();
        preview = new SceneRenderer(sprites);
        applyCanvasSize();
        let wasm = false;
        try {
          const out = await init();
          memory = out.memory;
          setWasmMemory(out.memory);
          idleAnalyzer = new Analyzer(IDLE_FFT, IDLE_SAMPLE_RATE);
          features = emptyFeatures(idleAnalyzer.bin_count());
          wasm = true;
        } catch (err) {
          post({ type: "error", message: `WASM の読み込みに失敗: ${String(err)}` });
        }
        post({ type: "ready", wasm, version: ENGINE_VERSION });
        resolveReady();
        raf(frame);
        break;
      }
      case "scene":
        // 書き出し中のシーン変更は、書き出し開始時のシーンには影響しない（runExport は開始時の参照を使う）
        scene = msg.scene;
        applyCanvasSize();
        preview?.prune(scene);
        break;
      case "transport":
        transport = msg.transport;
        break;
      case "loadTrack":
        if (exporting) throw new Error("書き出し中は音声を差し替えられません");
        loadTrack(msg.pcm, msg.sampleRate);
        break;
      case "image":
        if (!exporting) images.get(msg.id)?.close(); // 書き出し中は使用中かもしれないので閉じない
        images.set(msg.id, msg.bitmap);
        preview?.invalidateBackground();
        break;
      case "setRunning":
        if (msg.running && !running) {
          running = true;
          lastFrameTs = 0;
          perf.reset();
          raf(frame);
        } else {
          running = msg.running;
        }
        break;
      case "export":
        await startExport(msg);
        break;
      case "cancelExport":
        cancelRequested = true;
        break;
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
