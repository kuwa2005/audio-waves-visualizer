/// <reference lib="webworker" />
/**
 * 描画 Worker。OffscreenCanvas + Canvas 2D でメインスレッドと独立して描画する。
 *
 * 1 フレームの流れ:
 *   時刻 t（再生位置から外挿）→ WASM で t のスペクトル → 事前解析から特徴量 → 背景 → 各ビジュアライザー
 * 描画内容は (シーン, 特徴量, t) だけで決まるので、書き出し（フェーズ3）でも同じ処理を使う。
 */
import init, { Analyzer, Track } from "../wasm/pkg/awv_core";
import { BackgroundRenderer } from "./background";
import { absNowMs, STOPPED, transportTime, type TransportState } from "./clock";
import { computeFeatures, emptyFeatures, type AudioFeatures, type TrackData } from "./features";
import { PerfStats } from "./perfStats";
import type { FromWorker, ToWorker } from "./protocol";
import { OUTPUT_SIZE, pickBackgroundImage, type Scene } from "./scene";
import { createSpriteCache } from "./sprites";
import { REGISTRY } from "../plugins/registry";
import type { FrameContext, SpriteCache, VisualizerInstance } from "../plugins/types";

const ENGINE_VERSION = "0.2.0";
const IDLE_SAMPLE_RATE = 48000;
const IDLE_FFT = 2048;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let scene: Scene | null = null;
let transport: TransportState = STOPPED;
let running = true;
let memory: WebAssembly.Memory | null = null;
let sprites: SpriteCache | null = null;
const background = new BackgroundRenderer();
const images = new Map<string, ImageBitmap>();
const instances = new Map<string, { pluginId: string; inst: VisualizerInstance }>();
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

function updateFeatures(t: number): void {
  if (!memory) return;
  if (track && trackData) {
    track.spectrum_at(t);
    if (trackData.rms.buffer !== memory.buffer) refreshTrackViews();
    const spec = f32(track.magnitudes_ptr(), track.bin_count());
    computeFeatures(trackData, t, spec, features);
  } else if (idleAnalyzer) {
    idleSignal(f32(idleAnalyzer.input_ptr(), IDLE_FFT), t);
    idleAnalyzer.analyze();
    const spec = f32(idleAnalyzer.magnitudes_ptr(), idleAnalyzer.bin_count());
    const beat = (t * 2) % 1;
    features.spectrum = spec;
    features.kick = Math.exp(-beat * 7);
    features.bass = Math.min(1, idleAnalyzer.bass() * 3);
    features.sub = Math.min(1, idleAnalyzer.sub() * 3);
    features.mid = Math.min(1, idleAnalyzer.mid() * 6);
    features.high = Math.min(1, idleAnalyzer.high() * 12);
    features.rms = features.bass;
    features.onset = features.kick;
    features.bpm = 120;
    features.beatIndex = Math.floor(t * 2);
    features.beatPhase = beat;
    features.sinceBeat = beat / 2;
  }
}

function instanceFor(layerId: string, pluginId: string): VisualizerInstance | null {
  const cur = instances.get(layerId);
  if (cur && cur.pluginId === pluginId) return cur.inst;
  const plugin = REGISTRY[pluginId];
  if (!plugin) return null;
  const inst = plugin.create();
  instances.set(layerId, { pluginId, inst });
  return inst;
}

function frame(ts: number): void {
  if (!running) return;
  raf(frame);
  if (!ctx || !scene || !sprites) return;
  const interval = lastFrameTs ? ts - lastFrameTs : 1000 / 60;
  lastFrameTs = ts;
  const t0 = performance.now();

  const hasTrack = !!track;
  const t = hasTrack ? transportTime(transport, absNowMs()) : ts / 1000;
  let dt = t - lastT;
  if (dt < 0 || dt > 0.25) {
    // シーク・巻き戻し: 平滑化や残像をリセット
    for (const { inst } of instances.values()) inst.reset?.();
    dt = 0;
  }
  lastT = t;
  updateFeatures(t);

  const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
  const imgId = pickBackgroundImage(scene.background, scene.aspect);
  background.render(ctx, W, H, scene.background, imgId ? images.get(imgId) : undefined, imgId, features);

  const fc: FrameContext = { width: W, height: H, t, dt, features, sprites };
  for (const layer of scene.visualizers) {
    if (!layer.enabled || layer.opacity <= 0) continue;
    const inst = instanceFor(layer.id, layer.pluginId);
    if (!inst) continue;
    // 注: layer.opacity の反映はフェーズ4（レイヤー合成）で実装する
    ctx.save();
    ctx.globalAlpha = 1;
    inst.render(ctx, fc, layer.params);
    ctx.restore();
  }

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
    background.invalidate();
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
  for (const { inst } of instances.values()) inst.reset?.();
  features = emptyFeatures(tr.bin_count());
  const beats = new Float32Array(trackData!.beats); // コピーして送る
  post(
    { type: "trackInfo", info: { duration: tr.duration(), bpm: tr.bpm(), beats, analyzeMs: performance.now() - t0 } },
    [beats.buffer],
  );
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init": {
        scene = msg.scene;
        ctx = msg.canvas.getContext("2d", { alpha: false, desynchronized: true }) as OffscreenCanvasRenderingContext2D;
        applyCanvasSize();
        sprites = createSpriteCache();
        let wasm = false;
        try {
          const out = await init();
          memory = out.memory;
          idleAnalyzer = new Analyzer(IDLE_FFT, IDLE_SAMPLE_RATE);
          features = emptyFeatures(idleAnalyzer.bin_count());
          wasm = true;
        } catch (err) {
          post({ type: "error", message: `WASM の読み込みに失敗: ${String(err)}` });
        }
        post({ type: "ready", wasm, version: ENGINE_VERSION });
        raf(frame);
        break;
      }
      case "scene": {
        scene = msg.scene;
        applyCanvasSize();
        const ids = new Set(scene.visualizers.map((v) => v.id));
        for (const id of instances.keys()) if (!ids.has(id)) instances.delete(id);
        break;
      }
      case "transport":
        transport = msg.transport;
        break;
      case "loadTrack":
        loadTrack(msg.pcm, msg.sampleRate);
        break;
      case "image":
        images.get(msg.id)?.close();
        images.set(msg.id, msg.bitmap);
        background.invalidate();
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
    }
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
