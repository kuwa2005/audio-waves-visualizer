/// <reference lib="webworker" />
/**
 * 描画 Worker（フェーズ1: 土台）。
 * - OffscreenCanvas + Canvas 2D でメインスレッドと独立して描画
 * - WASM の FFT 解析器を毎フレーム実行（現時点では合成テスト信号を入力）
 * - フレーム時間を計測して HUD 用に送信
 *
 * 描画は shadowBlur / ctx.filter を使わず、事前に作った発光スプライトの加算合成で光らせる。
 */
import init, { Analyzer } from "../wasm/pkg/awv_core";
import type { FromWorker, ToWorker } from "./protocol";
import { PerfStats } from "./perfStats";

/** エンジンのバージョン（HUD・不具合報告で使う） */
const ENGINE_VERSION = "0.1.1";
const FFT_SIZE = 2048;
const SAMPLE_RATE = 48000;
const BAR_COUNT = 96;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let running = true;
let analyzer: Analyzer | null = null;
let wasmMemory: WebAssembly.Memory | null = null;
let glowSprite: OffscreenCanvas | null = null;
const perf = new PerfStats();
const smoothed = new Float32Array(BAR_COUNT);
let lastFrameTs = 0;
let lastPerfPost = 0;
let synthPhase = 0;

const post = (msg: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

const raf: (cb: (ts: number) => void) => void =
  typeof self.requestAnimationFrame === "function"
    ? (cb) => self.requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 1000 / 60);

/** 発光用のスプライト（放射グラデーション）を一度だけ作る */
function makeGlowSprite(size: number): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** テスト信号: キック（低音のパルス）+ 和音 + ハイハット風ノイズ。音声入力はフェーズ2で接続する。 */
function fillTestSignal(buf: Float32Array, t: number): void {
  const beat = (t * 2) % 1; // 120 BPM
  const kick = Math.exp(-beat * 8);
  for (let i = 0; i < buf.length; i++) {
    const s = synthPhase + i / SAMPLE_RATE;
    buf[i] =
      0.8 * kick * Math.sin(2 * Math.PI * 55 * s) +
      0.25 * Math.sin(2 * Math.PI * 440 * s) +
      0.18 * Math.sin(2 * Math.PI * 660 * s) +
      0.1 * (1 - beat) * (Math.random() * 2 - 1);
  }
  synthPhase += 1 / 60;
}

function frame(ts: number): void {
  if (!running) return;
  raf(frame);
  if (!ctx) return;
  const interval = lastFrameTs ? ts - lastFrameTs : 1000 / 60;
  lastFrameTs = ts;
  const t0 = performance.now();

  let bass = 0;
  if (analyzer && wasmMemory) {
    const input = new Float32Array(wasmMemory.buffer, analyzer.input_ptr(), FFT_SIZE);
    fillTestSignal(input, ts / 1000);
    analyzer.analyze();
    const mags = new Float32Array(wasmMemory.buffer, analyzer.magnitudes_ptr(), analyzer.bin_count());
    bass = Math.min(1, analyzer.bass() * 3);
    // 対数スケールでバーに割り当て
    const maxBin = Math.floor(mags.length * 0.7);
    for (let b = 0; b < BAR_COUNT; b++) {
      const from = Math.max(1, Math.floor(Math.pow(maxBin, b / BAR_COUNT)));
      const to = Math.max(from + 1, Math.floor(Math.pow(maxBin, (b + 1) / BAR_COUNT)));
      let peak = 0;
      for (let k = from; k < to; k++) if (mags[k] > peak) peak = mags[k];
      const v = Math.min(1, Math.sqrt(peak) * 1.4);
      smoothed[b] = v > smoothed[b] ? v : smoothed[b] * 0.88 + v * 0.12;
    }
  }

  // 背景
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, width, height);

  // バー（加算合成で発光）
  const baseY = height * 0.78;
  const gap = width / BAR_COUNT;
  const barW = gap * 0.55;
  ctx.globalCompositeOperation = "lighter";
  for (let b = 0; b < BAR_COUNT; b++) {
    const h = smoothed[b] * height * 0.6;
    const x = b * gap + (gap - barW) / 2;
    const hue = 260 - (b / BAR_COUNT) * 80; // 紫 → シアン
    ctx.fillStyle = `hsl(${hue} 90% 60%)`;
    ctx.fillRect(x, baseY - h, barW, h);
    if (glowSprite && h > 4) {
      ctx.globalAlpha = 0.35 * smoothed[b];
      ctx.drawImage(glowSprite, x - gap * 1.5, baseY - h - gap * 2, gap * 4, h + gap * 4);
      ctx.globalAlpha = 1;
    }
  }
  // 低音に合わせたフロアの光
  if (glowSprite) {
    ctx.globalAlpha = 0.25 + bass * 0.5;
    ctx.drawImage(glowSprite, -width * 0.2, baseY - height * 0.15, width * 1.4, height * 0.3);
    ctx.globalAlpha = 1;
  }

  perf.push(performance.now() - t0, interval);
  if (ts - lastPerfPost > 500) {
    lastPerfPost = ts;
    post({ type: "perf", perf: perf.snapshot() });
  }
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init": {
        width = msg.width;
        height = msg.height;
        msg.canvas.width = width;
        msg.canvas.height = height;
        ctx = msg.canvas.getContext("2d", { alpha: false, desynchronized: true }) as OffscreenCanvasRenderingContext2D;
        glowSprite = makeGlowSprite(128);
        let wasm = false;
        try {
          const out = await init();
          wasmMemory = out.memory;
          analyzer = new Analyzer(FFT_SIZE, SAMPLE_RATE);
          wasm = true;
        } catch (err) {
          post({ type: "error", message: `WASM の読み込みに失敗: ${String(err)}` });
        }
        post({ type: "ready", wasm, version: ENGINE_VERSION });
        raf(frame);
        break;
      }
      case "resize":
        width = msg.width;
        height = msg.height;
        if (ctx) {
          ctx.canvas.width = width;
          ctx.canvas.height = height;
        }
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
