import { describe, expect, it } from "vitest";
import { PerfStats } from "./perfStats";

describe("PerfStats", () => {
  it("empty snapshot is zeroed", () => {
    expect(new PerfStats().snapshot()).toMatchObject({ fps: 0, samples: 0, dropped: 0 });
  });

  it("computes fps and percentiles", () => {
    const s = new PerfStats(100);
    for (let i = 1; i <= 100; i++) s.push(i / 10, 1000 / 60);
    const snap = s.snapshot();
    expect(snap.fps).toBeCloseTo(60, 5);
    expect(snap.renderP50).toBeCloseTo(5.1, 5);
    expect(snap.renderP95).toBeCloseTo(9.5, 5);
    expect(snap.renderMax).toBeCloseTo(10, 5);
    expect(snap.dropped).toBe(0);
  });

  it("counts long intervals as dropped frames", () => {
    const s = new PerfStats(10);
    s.push(1, 16.7);
    s.push(1, 40);
    s.push(1, 33.4);
    expect(s.snapshot().dropped).toBe(2);
  });

  it("ring buffer keeps only the latest samples", () => {
    const s = new PerfStats(4);
    for (const v of [100, 100, 1, 2, 3, 4]) s.push(v, 16);
    expect(s.snapshot().renderMax).toBe(4);
    expect(s.snapshot().samples).toBe(4);
  });
});
