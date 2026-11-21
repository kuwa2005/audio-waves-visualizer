/** 字幕（SRT / WebVTT）の読み込みと、時刻に対応する字幕の検索 */

export type Cue = { start: number; end: number; text: string };

/** "00:01:02,345" / "01:02.345" / "1:02:03.4" を秒に */
export function parseTimestamp(s: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const ms = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

/**
 * SRT / WebVTT を読み込む。番号の有無・CRLF・BOM・VTT のヘッダーや設定（align: 等）に対応。
 * タグ（<i> など）は取り除く。開始時刻順に並べて返す。
 */
export function parseSubtitles(src: string): Cue[] {
  const text = src.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx < 0) continue;
    const [a, b] = lines[idx].split("-->");
    const start = parseTimestamp(a);
    const end = parseTimestamp((b ?? "").trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end <= start) continue;
    const body = lines
      .slice(idx + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
      .join("\n")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** 時刻 t に表示する字幕（重なる場合は後から始まったもの）。offset 秒だけ字幕を遅らせる */
export function activeCue(cues: readonly Cue[], t: number, offset = 0): Cue | null {
  const tt = t - offset;
  let lo = 0;
  let hi = cues.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= tt) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let i = last; i >= 0 && i >= last - 3; i--) {
    if (cues[i].end > tt) return cues[i];
  }
  return null;
}
