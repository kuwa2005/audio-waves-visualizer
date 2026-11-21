import { useRef } from "react";
import { loadFiles } from "../app/controller";
import { str } from "../plugins/types";
import { useStore } from "../state/store";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/** 手順3: テキスト（タイトルと字幕）。文字の内容はここ、見た目はインスペクターで調整する */
export function TextPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const title = useStore((s) => s.scene.title);
  const subs = useStore((s) => s.scene.subtitles);
  const selected = useStore((s) => s.selectedLayerId);
  const { setTextEnabled, setTextParam, selectLayer, setSubtitles } = useStore.getState();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">タイトル</h3>
          <label className="flex items-center gap-1.5 text-sm">
            <input data-testid="title-enabled" type="checkbox" checked={title.enabled} onChange={(e) => setTextEnabled("title", e.target.checked)} />
            表示する
          </label>
        </div>
        <textarea
          data-testid="title-text"
          rows={2}
          value={str(title.params, "title", "")}
          onChange={(e) => {
            setTextParam("title", "title", e.target.value);
            if (!title.enabled) setTextEnabled("title", true);
          }}
          placeholder="曲名など（改行できます）"
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm"
        />
        <input
          data-testid="title-subtext"
          value={str(title.params, "subtitle", "")}
          onChange={(e) => setTextParam("title", "subtitle", e.target.value)}
          placeholder="サブタイトル（アーティスト名など）"
          className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm"
        />
        <button
          data-testid="title-style"
          onClick={() => selectLayer("title")}
          className={`w-full rounded-lg border px-3 py-1.5 text-xs transition ${selected === "title" ? "border-accent-to text-ink" : "border-line text-ink-muted hover:text-ink"}`}
        >
          見た目・動きを調整（インスペクター） →
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">字幕</h3>
          <label className="flex items-center gap-1.5 text-sm">
            <input data-testid="subs-enabled" type="checkbox" checked={subs.enabled} onChange={(e) => setTextEnabled("subtitles", e.target.checked)} />
            表示する
          </label>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-line bg-raised/40 px-4 py-4 text-left transition hover:border-accent-from hover:bg-raised"
        >
          <span className="block text-sm font-medium">{subs.fileName ?? "字幕ファイルを選ぶ（SRT / VTT）"}</span>
          <span data-testid="subs-info" className="mt-1 block text-xs text-ink-muted">
            {subs.cues.length > 0 ? `${subs.cues.length} 件の字幕` : "ドロップでも読み込めます"}
          </span>
        </button>
        <input
          ref={fileRef}
          data-testid="subs-input"
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          className="hidden"
          onChange={(e) => e.target.files && loadFiles(e.target.files)}
        />
        {subs.cues.length > 0 && (
          <>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2 text-xs" data-testid="subs-list">
              {subs.cues.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-mono text-ink-muted">{fmt(c.start)}</span>
                  <span className="truncate">{c.text.replace(/\n/g, " / ")}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                data-testid="subs-style"
                onClick={() => selectLayer("subtitles")}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition ${selected === "subtitles" ? "border-accent-to text-ink" : "border-line text-ink-muted hover:text-ink"}`}
              >
                見た目・動き・タイミング →
              </button>
              <button onClick={() => setSubtitles([], null)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-bad hover:text-bad">
                字幕を外す
              </button>
            </div>
          </>
        )}
      </section>
      <p className="text-[11px] leading-4 text-ink-muted">プレビュー上の文字はドラッグで移動、ホイールで拡大縮小できます。</p>
    </div>
  );
}
