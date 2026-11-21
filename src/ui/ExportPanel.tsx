import { useEffect, useState } from "react";
import { pickAudio, pickVideo } from "../engine/codecs";
import { cancelExport, currentTime, startExport } from "../app/controller";
import { LENGTH_PRESETS, QUALITY_PRESETS } from "../engine/exportTypes";
import { OUTPUT_SIZE, resolveRange } from "../engine/scene";
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
  const autoDownload = useStore((s) => s.autoDownload);
  const setAutoDownload = useStore((s) => s.setAutoDownload);
  const [fps, setFps] = useState<30 | 60>(60);
  const [quality, setQuality] = useState<(typeof QUALITY_PRESETS)[number]["key"]>("high");
  const range = useStore((s) => s.scene.range);
  const setRange = useStore((s) => s.setRange);
  const setAspect = useStore((s) => s.setAspect);
  const [startText, setStartText] = useState(fmt(range.start));
  const [customLen, setCustomLen] = useState("20");
  const [audioFade, setAudioFade] = useState(0.5);
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
  const startValid = parseTime(startText) !== null;
  const r = resolveRange(range, track.duration);
  const dur = r.end - r.start;
  const isPreset = range.length === null || LENGTH_PRESETS.some((p) => p.seconds === range.length);
  const short = range.length !== null && range.length <= 180;
  const commitStart = (text: string) => {
    setStartText(text);
    const v = parseTime(text);
    if (v !== null) setRange({ start: Math.min(v, Math.max(0, track.duration - 1)) });
  };
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

      <section className="space-y-3 text-sm" data-testid="range-section">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">書き出す範囲</h3>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-ink-muted">開始位置</span>
          <input
            data-testid="range-start"
            value={startText}
            disabled={running}
            onChange={(e) => commitStart(e.target.value)}
            className={`w-20 rounded border bg-raised px-2 py-1 font-mono text-xs ${startValid ? "border-line" : "border-bad"}`}
          />
          <button
            data-testid="range-start-now"
            disabled={running}
            onClick={() => commitStart(fmt(Math.floor(currentTime())))}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:border-accent-from hover:text-ink"
            title="タイムラインの再生位置を開始位置にする"
          >
            ▶ 再生位置から
          </button>
        </div>
        <div>
          <span className="mb-1 block text-ink-muted">長さ（開始位置から）</span>
          <div className="flex flex-wrap gap-1.5">
            {LENGTH_PRESETS.map((p) => (
              <button
                key={p.label}
                data-testid={`len-${p.seconds ?? "end"}`}
                disabled={running}
                onClick={() => setRange({ length: p.seconds })}
                title={p.hint || undefined}
                className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                  range.length === p.seconds ? "border-accent-to bg-accent-to/15 text-ink" : "border-line text-ink-muted hover:border-accent-from hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${!isPreset ? "border-accent-to bg-accent-to/15" : "border-line"}`}>
              <input
                data-testid="len-custom"
                value={customLen}
                disabled={running}
                onChange={(e) => {
                  setCustomLen(e.target.value);
                  const v = parseTime(e.target.value);
                  if (v !== null && v > 0) setRange({ length: v });
                }}
                onFocus={() => {
                  const v = parseTime(customLen);
                  if (v !== null && v > 0) setRange({ length: v });
                }}
                className="w-10 bg-transparent text-right font-mono"
              />
              秒
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-muted">
            目安: 15〜60秒は TikTok・YouTube ショート・ニコニコ向け、YouTube ショートは 3 分まで。各サービスの最新の上限は公式の案内で確認してください。
          </p>
        </div>
        <p className="rounded-lg bg-raised/60 px-3 py-2 font-mono text-xs" data-testid="range-summary">
          {fmt(r.start)} 〜 {fmt(r.end)}（{dur.toFixed(dur < 60 ? 1 : 0)} 秒）・ 予想 約 {mb(estBytes)}
          {range.length !== null && r.start + range.length > track.duration + 0.01 && <span className="block text-warn">曲の最後で切れます</span>}
        </p>
        {short && aspect !== "9:16" && (
          <button
            data-testid="suggest-vertical"
            onClick={() => setAspect("9:16")}
            className="w-full rounded-lg border border-dashed border-accent-to/60 px-3 py-1.5 text-xs text-accent-to hover:bg-accent-to/10"
          >
            ショート動画なら縦型（9:16）がおすすめ → 切り替える
          </button>
        )}
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">音声のフェード</span>
          <div className="flex rounded-lg bg-raised p-0.5">
            {[0, 0.5, 1, 2].map((v) => (
              <button
                key={v}
                disabled={running}
                onClick={() => setAudioFade(v)}
                className={`rounded-md px-2 py-1 font-mono text-xs ${audioFade === v ? "bg-surface shadow" : "text-ink-muted"}`}
              >
                {v === 0 ? "なし" : `${v}秒`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {codecs && "error" in codecs && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          {codecs.error}
        </p>
      )}
      {codecs && !("error" in codecs) && (
        <div className="space-y-1 text-xs" data-testid="codec-info">
          <p className="text-ink-muted">
            形式: MP4（映像 {codecs.video} / 音声 AAC{codecs.audio !== "AAC" ? "（互換モード）" : ""}）
          </p>
          {codecs.audio !== "AAC" && (
            <p data-testid="aac-compat-note" className="leading-4 text-ink-muted">
              このブラウザは AAC を直接作れないため、内蔵の変換プログラムで AAC にします（初回のみ約 32MB を読み込み）。どのプレーヤーでも音が出ます。
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm" data-testid="auto-download">
        <span className="text-ink-muted">書き出したら自動でダウンロードを開始する</span>
        <div className="flex shrink-0 rounded-lg bg-raised p-0.5" role="radiogroup" aria-label="書き出したら自動でダウンロードを開始する">
          {([
            [true, "はい"],
            [false, "いいえ"],
          ] as const).map(([v, label]) => (
            <button
              key={label}
              role="radio"
              aria-checked={autoDownload === v}
              data-testid={`auto-download-${v ? "yes" : "no"}`}
              disabled={running}
              onClick={() => setAutoDownload(v)}
              className={`rounded-md px-3 py-1 text-xs ${autoDownload === v ? "bg-surface shadow" : "text-ink-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!running && (
        <button
          data-testid="export-start"
          disabled={!startValid || dur <= 0}
          onClick={() => void startExport({ fps, videoBitrate: Math.round(bitrate), start: r.start, end: r.end, audioFade })}
          className="accent-gradient w-full rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-40"
        >
          MP4 を書き出す
        </button>
      )}

      {running && (
        <div className="space-y-2" data-testid="export-progress">
          {ex.note && <p className="text-xs text-ink-muted">{ex.note}</p>}
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
          {ex.audioCodec === "Opus" && (
            <p role="alert" data-testid="opus-warning" className="rounded-lg border border-warn/50 bg-warn/10 px-2 py-1.5 text-xs leading-5 text-warn">
              音声を AAC に変換できなかったため Opus になりました。Windows の Media Player（Classic 含む）や QuickTime では音が出ません（VLC・ブラウザ・YouTube では再生できます）。
            </p>
          )}
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
