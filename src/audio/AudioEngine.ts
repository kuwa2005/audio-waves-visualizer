import { absNowMs, type TransportState } from "../engine/clock";

/**
 * 音声の読み込みと再生（メインスレッド）。
 * 再生位置は AudioContext の時計から求め、描画 Worker には TransportState として渡す。
 * スピーカーから実際に音が出るまでの遅延（outputLatency）を差し引いて、映像と音を合わせる。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  /** 再生開始時の ctx.currentTime と曲内位置 */
  private startCtxTime = 0;
  private startOffset = 0;
  private pausedAt = 0;
  private playing = false;
  onEnded: (() => void) | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** ファイルをデコードし、描画 Worker に渡すモノラル PCM を返す */
  async load(file: File): Promise<{ pcm: Float32Array; sampleRate: number; duration: number }> {
    this.stop();
    const ctx = this.ensureCtx();
    const data = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(data);
    this.buffer = buf;
    this.pausedAt = 0;
    const n = buf.length;
    const pcm = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < n; i++) pcm[i] += ch[i];
    }
    if (buf.numberOfChannels > 1) {
      const k = 1 / buf.numberOfChannels;
      for (let i = 0; i < n; i++) pcm[i] *= k;
    }
    return { pcm, sampleRate: buf.sampleRate, duration: buf.duration };
  }

  /** 曲内の現在位置（秒）。音が実際に聞こえている位置 */
  currentTime(): number {
    if (!this.ctx || !this.playing) return this.pausedAt;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    const t = this.startOffset + (this.ctx.currentTime - this.startCtxTime) - latency;
    return Math.min(Math.max(t, 0), this.duration);
  }

  transport(): TransportState {
    return { playing: this.playing, mediaTime: this.currentTime(), anchorAbsMs: absNowMs(), duration: this.duration };
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const offset = this.pausedAt >= this.duration - 0.05 ? 0 : this.pausedAt;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain!);
    src.onended = () => {
      if (this.source !== src) return;
      this.playing = false;
      this.pausedAt = this.duration;
      this.source = null;
      this.onEnded?.();
    };
    src.start(0, offset);
    this.source = src;
    this.startCtxTime = ctx.currentTime;
    this.startOffset = offset;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing || !this.ctx) return;
    // 再開時に巻き戻らないよう、遅延を差し引かない「音源の再生位置」で止める
    this.pausedAt = Math.min(this.startOffset + (this.ctx.currentTime - this.startCtxTime), this.duration);
    this.stop();
  }

  async seek(t: number): Promise<void> {
    const wasPlaying = this.playing;
    this.stop();
    this.pausedAt = Math.min(Math.max(t, 0), this.duration);
    if (wasPlaying) await this.play();
  }

  private stop(): void {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.stop();
      } catch {
        /* 既に停止済み */
      }
      s.disconnect();
    }
    this.playing = false;
  }
}
