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

import { liveDrops } from "../plugins/drops";

describe("描画（しずく）の発生", () => {
  it("is deterministic and keeps the expected count", () => {
    const a = liveDrops(10, 4, 1.5, 0, -1, Infinity, 0);
    const b = liveDrops(10, 4, 1.5, 0, -1, Infinity, 0);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(a.length).toBeLessThanOrEqual(8);
    for (const d of a) expect(10 - d.birth).toBeGreaterThanOrEqual(0);
  });
  it("adds bursts on beats only when audio reaction is on", () => {
    const off = liveDrops(5, 0, 1, 0, 10, 0.1, 120);
    const on = liveDrops(5, 0, 1, 1, 10, 0.1, 120);
    expect(off.length).toBe(0);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((d) => 5 - d.birth < 1)).toBe(true);
  });
});

import { dot, hitRoom, lightDirections, makeRoom, reflect, rotateNormal, tileNormals, type Vec3 } from "../plugins/mirrorBall";

describe("ミラーボールの反射", () => {
  it("reflects by the mirror law", () => {
    // 真上から来た光（-y 向き）を上向きの鏡で反射すると真上へ
    expect(reflect([0, -1, 0], [0, 1, 0])).toEqual([0, 1, 0]);
    // 45 度の鏡で直角に曲がる
    const n: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
    const r = reflect([-1, 0, 0], n);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(1);
  });

  it("hits the right room surface", () => {
    const room = makeRoom(1);
    expect(hitRoom([0, -1, 0], room)!.n).toEqual([0, 1, 0]); // 床
    expect(hitRoom([0, 0, -1], room)!.n).toEqual([0, 0, 1]); // 奥の壁
    expect(hitRoom([0, 0, 1], room)).toBeNull(); // 手前（カメラの後ろ）
  });

  it("spots from different tiles and lights move in different directions", () => {
    const room = makeRoom(1);
    const lights = lightDirections(3, 0, -0.4);
    const tiles = tileNormals(16);
    const angles: number[] = [];
    for (const tile of tiles) {
      lights.forEach((l) => {
        const at = (theta: number) => {
          const n = rotateNormal(tile.n, theta, 0);
          if (dot(n, l) <= 0.05) return null;
          const hit = hitRoom(reflect([-l[0], -l[1], -l[2]], n), room);
          if (!hit) return null;
          const d = room.cam - hit.p[2];
          return [hit.p[0] / d, -hit.p[1] / d];
        };
        const a = at(0);
        const b = at(0.01);
        if (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) angles.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
      });
    }
    expect(angles.length).toBeGreaterThan(100);
    // 動く向きが一方向に揃っていないこと（角度を 8 方位に分けて 4 方位以上に散らばる）
    const bins = new Set(angles.map((a) => Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8));
    expect(bins.size).toBeGreaterThanOrEqual(4);
  });
});

import { buildLut, triggerIndex } from "../plugins/spectrumMore";
import { laserAngle } from "../plugins/ambientMore";
import { CATALOG } from "../plugins/catalog";
import { EFFECT_CATALOG } from "../plugins/effectCatalog";

describe("追加プラグインの補助関数", () => {
  it("oscilloscope triggers on a rising zero crossing", () => {
    const buf = Float32Array.from([0.5, 0.2, -0.3, -0.1, 0.4, 0.8]);
    expect(triggerIndex(buf, 6)).toBe(4);
    expect(triggerIndex(Float32Array.from([1, 1, 1]), 3)).toBe(0);
  });
  it("color map spans dark to bright", () => {
    const lut = buildLut("inferno");
    expect(lut[0] + lut[1] + lut[2]).toBeLessThan(20);
    expect(lut[255 * 3] + lut[255 * 3 + 1] + lut[255 * 3 + 2]).toBeGreaterThan(600);
  });
  it("laser patterns stay within the spread", () => {
    for (let pat = 0; pat < 3; pat++)
      for (let i = 0; i < 10; i++) expect(Math.abs(laserAngle(pat, i, 10, 3.3, 1, 0.7))).toBeLessThanOrEqual(0.7 * 1.2 + 1e-9);
  });
  it("catalog ids are unique", () => {
    const ids = [...CATALOG.map((m) => m.id), ...EFFECT_CATALOG.map((m) => m.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { flash } from "../plugins/effects";

describe("ビートへの感度", () => {
  it("is the first parameter of every ambient layer and every effect, and not on spectrum layers", () => {
    for (const m of CATALOG) {
      const has = m.params[0]?.key === "beatSens";
      expect(has, m.id).toBe(m.category === "ambient");
    }
    for (const m of EFFECT_CATALOG) expect(m.params[0]?.key, m.id).toBe("beatSens");
    const def = EFFECT_CATALOG[0].params[0];
    expect(def).toMatchObject({ min: 0, max: 2, default: 1 });
  });

  it("flash brightness follows the sensitivity (0 = no flash)", () => {
    const alphaFor = (beatSens: number) => {
      let alpha = 0;
      const ctx = {
        save() {},
        restore() {},
        fillRect() {
          alpha = (this as unknown as { globalAlpha: number }).globalAlpha;
        },
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        fillStyle: "",
      };
      const features = { ...emptyFeatures(8), beatIndex: 4, sinceBeat: 0.02, bpm: 120 };
      flash.create().apply(ctx as never, { width: 10, height: 10, features, beatSens } as never, { strength: 0.35, every: 4, color: "#fff" });
      return alpha;
    };
    expect(alphaFor(0)).toBe(0);
    expect(alphaFor(2)).toBeGreaterThan(alphaFor(1));
  });
});

import { mediaKind } from "../app/controller";

describe("素材の振り分け（拡張子）", () => {
  it.each([
    ["song.WAV", "", "audio"],
    ["a.mp3", "", "audio"],
    ["a.m4a", "", "audio"],
    ["bg.JPG", "", "image"],
    ["bg.webp", "", "image"],
    ["lyrics.srt", "", "subtitle"],
    ["lyrics.vtt", "", "subtitle"],
    ["memo.txt", "text/plain", null],
    ["movie.mp4", "video/mp4", null],
    ["noext", "audio/mpeg", "audio"],
    ["noext", "image/png", "image"],
  ])("%s (%s) → %s", (name, mime, kind) => expect(mediaKind(name, mime)).toBe(kind));
  it("prefers the extension over a misleading MIME type", () => {
    expect(mediaKind("lyrics.srt", "application/octet-stream")).toBe("subtitle");
    expect(mediaKind("cover.png", "audio/mpeg")).toBe("image");
  });
});

import { warpTunnelMeta } from "../plugins/catalog";

describe("光の強さ（パルスリング・ワープトンネル）", () => {
  it("has a 0〜100% light parameter defaulting to 100%", () => {
    for (const m of [pulseRingMeta, warpTunnelMeta]) {
      const d = m.params.find((p) => p.key === "light");
      expect(d, m.id).toMatchObject({ type: "number", min: 0, max: 100, default: 100, unit: "%" });
    }
  });
});
