/**
 * フレーム時間の統計（リングバッファ）。描画 Worker 内で使い、HUD 表示と自動品質調整の材料にする。
 * 確保は生成時のみで、毎フレームのアロケーションはしない。
 */
export type PerfSnapshot = {
  /** 直近の実効 FPS（フレーム間隔から算出） */
  fps: number;
  /** 描画処理にかかった時間（ms）の中央値 / p95 / 最大 */
  renderP50: number;
  renderP95: number;
  renderMax: number;
  /** 期待間隔の 1.5 倍を超えたフレーム間隔の数（コマ落ちとみなす） */
  dropped: number;
  samples: number;
};

export class PerfStats {
  private readonly render: Float64Array;
  private readonly interval: Float64Array;
  private readonly sortBuf: Float64Array;
  private count = 0;
  private head = 0;
  private dropped = 0;

  constructor(
    capacity = 240,
    private readonly expectedIntervalMs = 1000 / 60,
  ) {
    this.render = new Float64Array(capacity);
    this.interval = new Float64Array(capacity);
    this.sortBuf = new Float64Array(capacity);
  }

  push(renderMs: number, intervalMs: number): void {
    this.render[this.head] = renderMs;
    this.interval[this.head] = intervalMs;
    this.head = (this.head + 1) % this.render.length;
    if (this.count < this.render.length) this.count++;
    if (intervalMs > this.expectedIntervalMs * 1.5) this.dropped++;
  }

  snapshot(): PerfSnapshot {
    const n = this.count;
    if (n === 0) return { fps: 0, renderP50: 0, renderP95: 0, renderMax: 0, dropped: this.dropped, samples: 0 };
    let intervalSum = 0;
    for (let i = 0; i < n; i++) intervalSum += this.interval[i];
    const sorted = this.sortBuf.subarray(0, n);
    sorted.set(this.render.subarray(0, n));
    sorted.sort();
    const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * (n - 1) + 0.5))];
    return {
      fps: intervalSum > 0 ? (1000 * n) / intervalSum : 0,
      renderP50: at(0.5),
      renderP95: at(0.95),
      renderMax: sorted[n - 1],
      dropped: this.dropped,
      samples: n,
    };
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.dropped = 0;
  }
}
