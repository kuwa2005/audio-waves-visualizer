import { useEffect, useState } from "react";
import { pickAudio, pickVideo } from "../engine/codecs";
import { cancelExport, startExport } from "../app/controller";
import { clampRange, QUALITY_PRESETS } from "../engine/exportTypes";
import { OUTPUT_SIZE } from "../engine/scene";
import { useStore } from "../state/store";

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "1:23" / "83" / "83.5" を秒に変換（不正なら null） */
export function parseTime(text: string): number | null {
  const t = text.trim();
  const m = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 手順4: 書き出し */
export function ExportPanel() {
  const track = useStore((s) => s.track);
  const aspect = useStore((s) => s.scene.aspect);
  const ex = useStore((s) => s.exportState);
  const [fps, setFps] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<(typeof QUALITY_PRESETS)[number]["key"]>("high");
  const [whole, setWhole] = useState(true);
  const [startText, setStartText] = useState("0:00");
  const [endText, setEndText] = useState("0:30");
  const [codecs, setCodecs] = useState<{ video: string; audio: string } | { error: string } | null>(null);
  const aspectForProbe = useStore((s) => s.scene.aspect);

  // 書き出し前に、この環境で使えるコーデックを確認して表示する
  useEffect(() => {
    let alive = true;
    const { width, height } = OUTPUT_SIZE[aspectForProbe];
    Promise.all([pickVideo(width, height, fps, 14_000_000), pickAudio(48000, 2)])
      .then(([v, a]) => alive && setCodecs({ video: v.label, audio: a.label }))
      .catch((e) => alive && setCodecs({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [aspectForProbe, fps]);

  if (!track) return <p className="text-sm text-ink-muted">先に「素材」で音声を読み込んでください。</p>;

  const { width, height } = OUTPUT_SIZE[aspect];
  const bitrate = QUALITY_PRESETS.find((q) => q.key === quality)!.bitrate * (fps === 60 ? 1.25 : 1);
  const startSec = whole ? 0 : parseTime(startText);
  const endSec = whole ? track.duration : parseTime(endText);
  const rangeValid = startSec !== null && endSec !== null && endSec > startSec;
  const range = rangeValid ? clampRange(startSec!, endSec!, track.duration) : null;
  const dur = range ? range.end - range.start : 0;
  const estBytes = ((bitrate + 256_000) * dur) / 8;
  const running = ex.state === "running";

  return (
    <div className="space-y-5" data-testid="export-panel">
      <section className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">解像度</span>
          <span className="font-mono">
            {width}×{height}（{aspect}）
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">フレームレート</span>
          <div className="flex rounded-lg bg-raised p-0.5">
            {([30, 60] as const).map((v) => (
              <button key={v} disabled={running} onClick={() => setFps(v)} className={`rounded-md px-3 py-1 font-mono text-xs ${fps === v ? "bg-surface shadow" : "text-ink-muted"}`}>
                {v}fps
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">画質</span>
          <div className="flex rounded-lg bg-raised p-0.5">
            {QUALITY_PRESETS.map((q) => (
              <button key={q.key} disabled={running} onClick={() => setQuality(q.key)} className={`rounded-md px-2.5 py-1 text-xs ${quality === q.key ? "bg-surface shadow" : "text-ink-muted"}`}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">範囲</h3>
        <label className="flex items-center gap-2">
          <input type="radio" checked={whole} disabled={running} onChange={() => setWhole(true)} /> 曲全体（{fmt(track.duration)}）
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!whole} disabled={running} onChange={() => setWhole(false)} data-testid="range-custom" /> 範囲を指定
        </label>
        {!whole && (
          <div className="flex items-center gap-2 pl-6">
            <input data-testid="range-start" value={startText} disabled={running} onChange={(e) => setStartText(e.target.value)} className="w-20 rounded border border-line bg-raised px-2 py-1 font-mono text-xs" />
            〜
            <input data-testid="range-end" value={endText} disabled={running} onChange={(e) => setEndText(e.target.value)} className="w-20 rounded border border-line bg-raised px-2 py-1 font-mono text-xs" />
          </div>
        )}
        {!rangeValid && <p className="text-xs text-bad">範囲は「分:秒」または秒で、開始 &lt; 終了 になるよう入力してください。</p>}
        {range && (
          <p className="text-xs text-ink-muted">
            長さ {fmt(dur)} ・ 予想サイズ 約 {mb(estBytes)}
          </p>
        )}
      </section>

      {codecs && "error" in codecs && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          {codecs.error}
        </p>
      )}
      {codecs && !("error" in codecs) && (
        <div className="space-y-2 text-xs" data-testid="codec-info">
          <p className="text-ink-muted">
            形式: MP4（映像 {codecs.video} / 音声 {codecs.audio}）
          </p>
          {codecs.audio !== "AAC" && (
            <p role="alert" data-testid="opus-warning" className="rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 leading-5 text-warn">
              このブラウザでは AAC 音声を作れないため、音声は Opus になります。Windows 標準の「メディア プレーヤー」や
              macOS の QuickTime では<strong>音が出ません</strong>（VLC・ブラウザ・YouTube などでは再生できます）。
              Windows / macOS の Chrome または Edge で書き出すと AAC になります。
            </p>
          )}
        </div>
      )}

      {!running && (
        <button
          data-testid="export-start"
          disabled={!range || dur <= 0}
          onClick={() => range && startExport({ fps, videoBitrate: Math.round(bitrate), start: range.start, end: range.end })}
          className="accent-gradient w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-40"
        >
          MP4 を書き出す
        </button>
      )}

      {running && (
        <div className="space-y-2" data-testid="export-progress">
          {(() => {
            const p = ex.progress;
            const ratio = p ? p.frame / Math.max(1, p.totalFrames) : 0;
            const eta = p && p.speed > 0 ? ((p.totalFrames - p.frame) / fps) / p.speed : NaN;
            return (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-raised">
                  <div className="accent-gradient h-full transition-[width]" style={{ width: `${ratio * 100}%` }} />
                </div>
                <div className="flex justify-between font-mono text-xs text-ink-muted">
                  <span>
                    {p?.phase === "finalizing" ? "仕上げ中…" : p?.phase === "rendering" ? `${(ratio * 100).toFixed(1)}%` : "準備中…"}
                  </span>
                  <span>{p && p.speed > 0 ? `${p.speed.toFixed(2)}倍速 ・ 残り ${fmt(eta)}` : ""}</span>
                </div>
              </>
            );
          })()}
          <button onClick={cancelExport} className="w-full rounded-xl border border-line py-2 text-sm hover:border-bad hover:text-bad">
            中止
          </button>
        </div>
      )}

      {ex.state === "done" && (
        <div className="space-y-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm" data-testid="export-done">
          <p className="font-semibold text-ok">書き出しが完了しました</p>
          <p className="text-xs text-ink-muted">
            {mb(ex.size)} ・ {fmt(ex.durationSec)} ・ 映像 {ex.videoCodec} / 音声 {ex.audioCodec} ・ 処理 {ex.elapsedSec.toFixed(1)} 秒
          </p>
          <a href={ex.url} download={ex.fileName} data-testid="export-download" className="accent-gradient block rounded-lg py-2 text-center font-semibold text-white">
            ダウンロード
          </a>
        </div>
      )}
      {ex.state === "error" && (
        <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${ex.cancelled ? "bg-raised text-ink-muted" : "border border-bad/40 bg-bad/10 text-bad"}`}>
          {ex.message}
        </p>
      )}
    </div>
  );
}
