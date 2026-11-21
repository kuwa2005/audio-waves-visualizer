import { describe, expect, it } from "vitest";
import { transportTime } from "./clock";
import { computeFeatures, emptyFeatures, lastIndexAtOrBefore, type TrackData } from "./features";
import { guessAspect, pickBackgroundImage, defaultScene } from "./scene";

describe("transportTime", () => {
  it("extrapolates while playing and clamps to duration", () => {
    const s = { playing: true, mediaTime: 10, anchorAbsMs: 1000, duration: 12 };
    expect(transportTime(s, 2500)).toBeCloseTo(11.5);
    expect(transportTime(s, 9000)).toBe(12);
  });
  it("is fixed while paused", () => {
    expect(transportTime({ playing: false, mediaTime: 3, anchorAbsMs: 0, duration: 10 }, 99999)).toBe(3);
  });
});

describe("lastIndexAtOrBefore", () => {
  const a = [0.5, 1, 1.5, 2];
  it.each([
    [0.1, -1],
    [0.5, 0],
    [1.2, 1],
    [5, 3],
  ])("t=%f → %i", (t, idx) => expect(lastIndexAtOrBefore(a, t)).toBe(idx));
});

describe("computeFeatures", () => {
  const frames = 10;
  const track: TrackData = {
    frames,
    frameRate: 10,
    centerOffset: 0,
    bpm: 120,
    rms: Float32Array.from({ length: frames }, (_, i) => i / 10),
    onset: new Float32Array(frames),
    bands: Float32Array.from({ length: frames * 4 }, (_, i) => (i % 4 === 1 ? Math.floor(i / 4) / 10 : 0)),
    beats: Float32Array.from([0.25, 0.75]), // float32 で誤差が出ない値
  };
  const spec = new Float32Array(8);

  it("interpolates frame values", () => {
    const f = computeFeatures(track, 0.25, spec, emptyFeatures(8));
    expect(f.rms).toBeCloseTo(0.25);
    expect(f.bass).toBeCloseTo(0.25);
  });
  it("tracks beats and kick envelope", () => {
    const before = computeFeatures(track, 0.1, spec, emptyFeatures(8));
    expect(before.beatIndex).toBe(-1);
    expect(before.kick).toBe(0);
    const onBeat = computeFeatures(track, 0.25, spec, emptyFeatures(8));
    expect(onBeat.beatIndex).toBe(0);
    expect(onBeat.kick).toBeCloseTo(1);
    const mid = computeFeatures(track, 0.5, spec, emptyFeatures(8));
    expect(mid.beatPhase).toBeCloseTo(0.5);
    // 最後の拍の後は BPM から次の拍を推定
    const after = computeFeatures(track, 1.0, spec, emptyFeatures(8));
    expect(after.beatIndex).toBe(1);
    expect(after.beatPhase).toBeCloseTo(0.5);
  });
  it("clamps outside the track", () => {
    expect(computeFeatures(track, -5, spec, emptyFeatures(8)).rms).toBe(0);
    expect(computeFeatures(track, 99, spec, emptyFeatures(8)).rms).toBeCloseTo(0.9);
  });
});

describe("scene helpers", () => {
  it("guesses aspect from image size", () => {
    expect(guessAspect(1672, 941)).toBe("16:9");
    expect(guessAspect(941, 1672)).toBe("9:16");
    expect(guessAspect(1254, 1254)).toBe("1:1");
  });
  it("falls back to another aspect's image", () => {
    const bg = { ...defaultScene().background, images: { "1:1": "sq" } };
    expect(pickBackgroundImage(bg, "9:16")).toBe("sq");
    expect(pickBackgroundImage({ ...bg, images: { "9:16": "v", "1:1": "sq" } }, "9:16")).toBe("v");
  });
});

import { clampRange, frameCount } from "./exportTypes";
import { resampleLinear } from "./exporter";
import { parseTime } from "../ui/ExportPanel";

describe("export helpers", () => {
  it("counts frames", () => {
    expect(frameCount({ fps: 60, videoBitrate: 1, start: 1, end: 3.5 })).toBe(150);
    expect(frameCount({ fps: 30, videoBitrate: 1, start: 5, end: 5 })).toBe(0);
  });
  it("clamps range to duration", () => {
    expect(clampRange(-1, 500, 182.8)).toEqual({ start: 0, end: 182.8 });
    expect(clampRange(10, 5, 100)).toEqual({ start: 10, end: 10 });
  });
  it("resamples linearly", () => {
    const src = Float32Array.from([0, 1, 2, 3]);
    expect(resampleLinear(src, 48000, 48000)).toBe(src);
    expect(Array.from(resampleLinear(src, 1, 2))).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3]);
  });
  it.each([
    ["1:23", 83],
    ["83", 83],
    ["0:05.5", 5.5],
    ["abc", null],
    ["1:75", null],
  ])("parseTime(%s) = %s", (text, v) => expect(parseTime(text)).toBe(v));
});
