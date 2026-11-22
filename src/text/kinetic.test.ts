import { describe, expect, it } from "vitest";
import { blockTransform, glyphState, layoutGlyphs, type AnimInput, type Glyph } from "./kinetic";
import type { TextStyle } from "./textCatalog";

const g = (index: number, ch = "あ"): Glyph => ({ ch, x: 0, y: 0, w: 50, line: 0, index });
const input = (anim: AnimInput["anim"], lt: number, over: Partial<AnimInput> = {}): AnimInput => ({
  anim,
  lt,
  left: 3 - lt,
  dur: 3,
  cueIndex: 4,
  count: 10,
  size: 50,
  W: 1920,
  H: 1080,
  kick: 0,
  t: 10 + lt,
  highlight: "#ffd23f",
  ...over,
});

describe("字幕の動き（1 文字ずつ）", () => {
  it("charPop: later characters appear later", () => {
    expect(glyphState(g(0), input("charPop", 0.15)).scale).toBeGreaterThan(0.3);
    expect(glyphState(g(9), input("charPop", 0.15)).scale).toBeCloseTo(0, 6);
    expect(glyphState(g(9), input("charPop", 1.5)).scale).toBeCloseTo(1, 2);
  });
  it("scramble: random characters before settling, then the real one", () => {
    const before = glyphState(g(9, "愛"), input("scramble", 0.05));
    expect(before.ch).toBeDefined();
    expect(before.ch).not.toBe("愛");
    expect(glyphState(g(9, "愛"), input("scramble", 2)).ch).toBeUndefined();
  });
  it("impact: starts huge and settles at normal size", () => {
    expect(glyphState(g(0), input("impact", 0)).scale).toBeCloseTo(3, 5);
    expect(glyphState(g(0), input("impact", 1)).scale).toBeCloseTo(1, 5);
  });
  it("all animations fade out by the end of the cue", () => {
    for (const anim of ["fade", "pop", "slide", "charPop", "charDrop", "charSpin", "wave", "scramble", "neon", "scatter", "impact", "random"] as const) {
      expect(glyphState(g(3), input(anim, 3, { left: 0 })).alpha, anim).toBeLessThan(0.05);
    }
  });
  it("is deterministic for the same cue and time (preview == export)", () => {
    for (const anim of ["scatter", "glitch", "scramble", "neon"] as const) {
      expect(glyphState(g(2), input(anim, 0.2))).toEqual(glyphState(g(2), input(anim, 0.2)));
    }
  });
  it("random placement differs between cues but is stable per cue", () => {
    expect(blockTransform("random", 1, 1920, 1080)).toEqual(blockTransform("random", 1, 1920, 1080));
    expect(blockTransform("random", 1, 1920, 1080)).not.toEqual(blockTransform("random", 2, 1920, 1080));
    expect(blockTransform("fade", 1, 1920, 1080)).toEqual({ dx: 0, dy: 0, rot: 0, scale: 1 });
  });
});

describe("縦書きのレイアウト", () => {
  const style = { sizePx: 40 } as TextStyle;
  it("stacks characters top to bottom, first line on the right, with vertical punctuation", () => {
    const { glyphs } = layoutGlyphs(["「あい」", "う。"], style, true);
    const first = glyphs.filter((x) => x.line === 0);
    const second = glyphs.filter((x) => x.line === 1);
    expect(first.map((x) => x.ch).join("")).toBe("﹁あい﹂");
    expect(second.map((x) => x.ch).join("")).toBe("う︒");
    expect(first[0].x).toBeGreaterThan(second[0].x); // 1 行目が右
    expect(first[1].y).toBeGreaterThan(first[0].y); // 上から下へ
  });
});
