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
    expect(frameCount({ fps: 60, videoBitrate: 1, start: 1, end: 3.5, audioFade: 0 })).toBe(150);
    expect(frameCount({ fps: 30, videoBitrate: 1, start: 5, end: 5, audioFade: 0 })).toBe(0);
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

import { transformRect } from "./scene";
import { neonBarsMeta, pulseRingMeta } from "../plugins/catalog";
import { defaultParams } from "../plugins/types";

describe("layer transform", () => {
  it("identity keeps bounds", () => {
    const b = { x: 10, y: 20, w: 100, h: 50 };
    expect(transformRect(b, { x: 0, y: 0, scale: 1 }, 1920, 1080)).toEqual(b);
  });
  it("scales around own center and moves relative to output size", () => {
    const r = transformRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 0.1, y: -0.5, scale: 2 }, 1000, 200);
    expect(r).toEqual({ x: 50, y: -150, w: 200, h: 200 });
  });
  it("plugins report sensible bounds", () => {
    const bars = neonBarsMeta.bounds(defaultParams(neonBarsMeta), 1920, 1080);
    expect(bars.w).toBe(1920);
    expect(bars.y).toBeGreaterThan(0);
    const ring = pulseRingMeta.bounds(defaultParams(pulseRingMeta), 1920, 1080);
    expect(ring.x + ring.w / 2).toBe(960);
    expect(ring.w).toBe(ring.h);
  });
});

import { stylusPoint } from "../plugins/turntable";
import { turntableLayout, turntableMeta } from "../plugins/catalog";

describe("turntable geometry", () => {
  const L = turntableLayout(defaultParams(turntableMeta), 1920, 1080);
  it("stylus reaches both outer and inner grooves with fixed arm length", () => {
    for (const rr of [L.platterR * 0.9, L.platterR * 0.42]) {
      const p = stylusPoint(L.pivotX, L.pivotY, L.armLen, L.px, L.py, rr);
      expect(p).not.toBeNull();
      expect(Math.hypot(p![0] - L.px, p![1] - L.py)).toBeCloseTo(rr, 3);
      expect(Math.hypot(p![0] - L.pivotX, p![1] - L.pivotY)).toBeCloseTo(L.armLen, 3);
    }
  });
  it("unit fits inside the frame for every aspect", () => {
    for (const [W, H] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const l = turntableLayout(defaultParams(turntableMeta), W, H);
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(W);
      expect(l.y + l.h).toBeLessThanOrEqual(H);
    }
  });
});

import { bandLevel, ISO_31 } from "../plugins/spectrumClassic";

describe("graphic EQ band level", () => {
  it("puts a pure tone in its own 1/3-octave band", () => {
    const sr = 48000;
    const spec = new Float32Array(1025);
    const k = Math.round(1000 / (sr / 2048)); // 1kHz 付近の bin
    spec[k] = 0.5;
    const levels = ISO_31.map((fc) => bandLevel(spec, sr, fc, 1 / 3));
    const best = levels.indexOf(Math.max(...levels));
    expect(ISO_31[best]).toBe(1000);
    expect(levels[ISO_31.indexOf(100)]).toBe(0);
  });
  it("lowest bands still read a bin even when narrower than the bin width", () => {
    const spec = new Float32Array(1025).fill(0.1);
    expect(bandLevel(spec, 48000, 20, 1 / 3)).toBeGreaterThan(0);
  });
});

import { fadeFactor, resolveRange } from "./scene";
import { applyAudioFade } from "./exportTypes";

describe("program range and fades", () => {
  it("resolves start + length and clamps to the song", () => {
    expect(resolveRange({ start: 60, length: 30 }, 182.8)).toEqual({ start: 60, end: 90 });
    expect(resolveRange({ start: 170, length: 60 }, 182.8)).toEqual({ start: 170, end: 182.8 });
    expect(resolveRange({ start: 10, length: null }, 100)).toEqual({ start: 10, end: 100 });
    expect(resolveRange({ start: 500, length: 15 }, 100)).toEqual({ start: 100, end: 100 });
  });
  it("fades in and out at the range edges", () => {
    expect(fadeFactor(60, 60, 90, 2, 2)).toBe(0);
    expect(fadeFactor(61, 60, 90, 2, 2)).toBeCloseTo(0.5);
    expect(fadeFactor(75, 60, 90, 2, 2)).toBe(1);
    expect(fadeFactor(89.5, 60, 90, 2, 2)).toBeCloseTo(0.25);
    expect(fadeFactor(30, 60, 90, 2, 2)).toBe(1); // 範囲外はそのまま表示
    expect(fadeFactor(75, 60, 90, 0, 0)).toBe(1);
  });
  it("applies linear audio fade at both ends", () => {
    const ch = new Float32Array(100).fill(1);
    applyAudioFade(ch, 10, 1); // 10 サンプル
    expect(ch[0]).toBe(0);
    expect(ch[5]).toBeCloseTo(0.5);
    expect(ch[50]).toBe(1);
    expect(ch[99]).toBe(0);
  });
});

import { audioSpecificConfig, buildWav, parseAdts } from "../audio/aacFallback";

describe("AAC fallback helpers", () => {
  it("builds AudioSpecificConfig for AAC-LC 48kHz stereo", () => {
    expect(Array.from(audioSpecificConfig(2, 48000, 2))).toEqual([0x11, 0x90]);
    expect(Array.from(audioSpecificConfig(2, 44100, 2))).toEqual([0x12, 0x10]);
  });
  it("splits an ADTS stream into raw frames", () => {
    const frame = (payload: number[]) => {
      const len = 7 + payload.length;
      // AAC-LC(profile 1), 48kHz(idx 3), 2ch, protection absent
      return [0xff, 0xf1, (1 << 6) | (3 << 2) | 0, (2 << 6) | ((len >> 11) & 3), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc, ...payload];
    };
    const buf = Uint8Array.from([...frame([1, 2, 3]), ...frame([4, 5])]);
    const p = parseAdts(buf);
    expect(p.frames.map((f) => Array.from(f))).toEqual([[1, 2, 3], [4, 5]]);
    expect(p.sampleRate).toBe(48000);
    expect(p.channels).toBe(2);
    expect(p.objectType).toBe(2);
  });
  it("writes a 16-bit PCM WAV header", () => {
    const w = buildWav([Float32Array.from([0, 1]), Float32Array.from([-1, 0.5])], 48000);
    expect(w.length).toBe(44 + 2 * 2 * 2);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
});
