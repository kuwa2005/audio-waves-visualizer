import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeCue, parseSubtitles, parseTimestamp } from "./subtitles";

describe("parseTimestamp", () => {
  it.each([
    ["00:01:02,345", 62.345],
    ["01:02.5", 62.5],
    ["1:00:00.000", 3600],
    ["bad", null],
  ])("%s → %s", (s, v) => expect(parseTimestamp(s)).toBe(v));
});

describe("parseSubtitles", () => {
  it("reads SRT with CRLF, BOM, tags and multi-line text", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>こんにちは</i>\r\n世界\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n次\r\n";
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 2.5, text: "こんにちは\n世界" },
      { start: 3, end: 4, text: "次" },
    ]);
  });
  it("reads WebVTT with header and cue settings", () => {
    const vtt = "WEBVTT\n\nintro\n00:01.000 --> 00:02.000 align:center\nA\n\n00:03.000 --> 00:04.000\nB";
    expect(parseSubtitles(vtt).map((c) => c.text)).toEqual(["A", "B"]);
  });
  it("skips broken blocks", () => {
    expect(parseSubtitles("1\n00:00:05,000 --> 00:00:04,000\n逆\n\nゴミ")).toEqual([]);
  });
  it("parses the bundled demo subtitles", () => {
    const p = "public/sample/demo.srt";
    if (!existsSync(p)) return;
    const cues = parseSubtitles(readFileSync(p, "utf8"));
    expect(cues.length).toBeGreaterThan(5);
    expect(cues[0].text).toContain("持ち帰り");
  });
});

describe("activeCue", () => {
  const cues = [
    { start: 1, end: 3, text: "a" },
    { start: 4, end: 6, text: "b" },
  ];
  it("finds the cue at t and respects gaps and offset", () => {
    expect(activeCue(cues, 0.5)).toBeNull();
    expect(activeCue(cues, 2)?.text).toBe("a");
    expect(activeCue(cues, 3.5)).toBeNull();
    expect(activeCue(cues, 5.9)?.text).toBe("b");
    expect(activeCue(cues, 3.5, 2)?.text).toBe("a"); // 2 秒遅らせる → 1.5 秒時点の字幕
    expect(activeCue(cues, 2.5, 2)).toBeNull(); // 0.5 秒時点はまだ字幕なし
  });
});
