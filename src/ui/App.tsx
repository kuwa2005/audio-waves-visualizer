import { useCallback, useState } from "react";
import type { FromWorker } from "../engine/protocol";
import type { PerfSnapshot } from "../engine/perfStats";
import { PerfHud } from "./PerfHud";
import { Stage } from "./Stage";

/** 旧版（Music Waves Visualizer 最終版）の公開先 */
const CLASSIC_URL = "/visualizer-classic/";

const STEPS = [
  { key: "media", label: "素材", hint: "音声・画像・動画" },
  { key: "visual", label: "ビジュアル", hint: "スペアナ・エフェクト" },
  { key: "text", label: "テキスト", hint: "タイトル・字幕" },
  { key: "export", label: "書き出し", hint: "MP4" },
] as const;

/**
 * アプリの骨組み（フェーズ1）。
 * 左: 作業ステップ / 中央: プレビュー / 右: インスペクター / 下: タイムライン
 * 各パネルの中身はフェーズ4以降で実装する。
 */
export function App() {
  const [perf, setPerf] = useState<PerfSnapshot | null>(null);
  const [wasm, setWasm] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]["key"]>("media");

  const onEngineMessage = useCallback((msg: FromWorker) => {
    if (msg.type === "perf") setPerf(msg.perf);
    else if (msg.type === "ready") setWasm(msg.wasm);
    else if (msg.type === "error") setError(msg.message);
  }, []);

  return (
    <div className="grid h-full grid-rows-[56px_1fr_120px] gap-px bg-line">
      <header className="flex items-center gap-4 bg-surface px-4">
        <div className="accent-gradient h-7 w-7 rounded-lg" aria-hidden />
        <h1 className="text-sm font-semibold tracking-wide">Audio Waves Visualizer</h1>
        <span className="rounded-md bg-raised px-2 py-0.5 text-xs text-ink-muted">v0.1 プレビュー版</span>
        <div className="ml-auto flex items-center gap-3">
          <a
            href={CLASSIC_URL}
            data-testid="classic-link"
            className="text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline"
          >
            → 旧版はこちら
          </a>
          <button
            className="accent-gradient rounded-lg px-4 py-1.5 text-sm font-semibold text-white opacity-60"
            disabled
            title="フェーズ3で実装"
          >
            書き出し
          </button>
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 gap-px lg:grid-cols-[240px_1fr_320px]">
        <nav className="hidden flex-col gap-1 bg-surface p-3 lg:flex" aria-label="作業ステップ">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                step === s.key ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60"
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === s.key ? "accent-gradient text-white" : "bg-raised"}`}>
                {i + 1}
              </span>
              <span>
                <span className="block text-sm">{s.label}</span>
                <span className="block text-xs text-ink-muted">{s.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <section className="relative min-h-0 bg-base p-4">
          <Stage onEngineMessage={onEngineMessage} />
          <PerfHud perf={perf} wasm={wasm} />
          {error && (
            <div role="alert" className="absolute bottom-6 left-6 right-6 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">
              {error}
            </div>
          )}
        </section>

        <aside className="hidden bg-surface p-4 lg:block" aria-label="インスペクター">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">インスペクター</h2>
          <p className="mt-3 text-sm text-ink-muted">選んだレイヤーの設定がここに表示されます（フェーズ4で実装）。</p>
        </aside>
      </main>

      <footer className="bg-surface px-4 py-3" aria-label="タイムライン">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">タイムライン</h2>
        <div className="mt-3 h-12 rounded-lg border border-dashed border-line" />
      </footer>
    </div>
  );
}
