import { useEffect, useState } from "react";
import { loadFiles } from "../app/controller";
import type { Aspect } from "../engine/scene";
import { useStore, type Step } from "../state/store";
import { ExportPanel } from "./ExportPanel";
import { BulbIcon, Logo } from "./Logo";
import { Inspector } from "./Inspector";
import { MediaPanel } from "./MediaPanel";
import { PerfHud } from "./PerfHud";
import { Stage } from "./Stage";
import { TextPanel } from "./TextPanel";
import { Timeline } from "./Timeline";
import { VisualPanel } from "./VisualPanel";

/** 旧版（Music Waves Visualizer 最終版）の公開先 */
const CLASSIC_URL = "/visualizer-classic/";

const STEPS: { key: Step; label: string; hint: string }[] = [
  { key: "media", label: "素材", hint: "音声・画像" },
  { key: "visual", label: "ビジュアル", hint: "スペアナ・エフェクト" },
  { key: "text", label: "テキスト", hint: "タイトル・字幕" },
  { key: "export", label: "書き出し", hint: "MP4" },
];

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1"];

function StepContent({ step }: { step: Step }) {
  if (step === "media") return <MediaPanel />;
  if (step === "visual") return <VisualPanel />;
  if (step === "text") return <TextPanel />;
  if (step === "export") return <ExportPanel />;
  return <p className="text-sm text-ink-muted">この機能は今後のフェーズで実装します。</p>;
}

/**
 * 画面構成: 上 = ヘッダー / 左 = 作業ステップと内容 / 中央 = プレビュー / 右 = インスペクター / 下 = タイムライン
 */
export function App() {
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const aspect = useStore((s) => s.scene.aspect);
  const setAspect = useStore((s) => s.setAspect);
  const error = useStore((s) => s.error);
  const loading = useStore((s) => s.loading);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [dragging, setDragging] = useState(false);

  // ウィンドウの外へ出た・ドラッグを取り消した・どこかでドロップした、のいずれでも「ドロップ待ち」表示を解除する
  useEffect(() => {
    const off = () => setDragging(false);
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) off();
    };
    window.addEventListener("drop", off, true);
    window.addEventListener("dragend", off, true);
    window.addEventListener("dragleave", onLeave, true);
    return () => {
      window.removeEventListener("drop", off, true);
      window.removeEventListener("dragend", off, true);
      window.removeEventListener("dragleave", onLeave, true);
    };
  }, []);

  return (
    <div
      className="grid min-h-full grid-rows-[56px_1fr_auto] gap-px bg-line lg:h-full"
      onDragOver={(e) => {
        // レイヤーの並べ替え（ファイル以外のドラッグ）では「ドロップ待ち」表示を出さない
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        void loadFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex min-w-0 items-center gap-2 bg-surface px-3 sm:gap-3 sm:px-4">
        <Logo className="h-8 w-8 shrink-0" />
        <h1 className="hidden truncate text-sm font-semibold tracking-wide sm:block">Audio Waves Visualizer</h1>
        <span className="hidden rounded-md bg-raised px-2 py-0.5 text-xs text-ink-muted sm:inline">v0.7 プレビュー版</span>
        <a href={CLASSIC_URL} data-testid="classic-link" className="classic-link shrink-0 rounded-md px-2 py-1 text-[11px] font-bold sm:ml-2 sm:px-2.5 sm:text-xs">
          → 旧版はこちら
        </a>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <PerfHud />
          <div className="flex rounded-lg bg-raised p-0.5" role="radiogroup" aria-label="画面比率">
            {ASPECTS.map((a) => (
              <button
                key={a}
                role="radio"
                aria-checked={aspect === a}
                data-testid={`aspect-${a}`}
                onClick={() => setAspect(a)}
                className={`rounded-md px-1.5 py-1 font-mono text-[11px] transition sm:px-2.5 sm:text-xs ${aspect === a ? "bg-surface text-ink shadow" : "text-ink-muted hover:text-ink"}`}
              >
                {a}
              </button>
            ))}
          </div>
          <button
            data-testid="header-export"
            onClick={() => setStep("export")}
            className="accent-gradient hidden rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 sm:block"
          >
            書き出し
          </button>
          <button
            data-testid="theme-toggle"
            aria-pressed={theme === "light"}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${theme === "light" ? "bg-amber-100 text-amber-700 shadow-[0_0_14px_rgb(251_191_36/0.7)]" : "bg-raised text-ink-muted hover:text-ink"}`}
            title={theme === "light" ? "消灯してダークモードにする" : "点灯してライトモードにする"}
            aria-label={theme === "light" ? "ダークモードに切り替え" : "ライトモードに切り替え"}
          >
            <BulbIcon on={theme === "light"} />
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-px lg:min-h-0 lg:grid-cols-[320px_1fr_300px]">
        <div className="flex flex-col bg-surface lg:order-none lg:min-h-0">
          <nav className="grid grid-cols-4 gap-1 border-b border-line p-2" aria-label="作業ステップ">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                data-testid={`step-${s.key}`}
                onClick={() => setStep(s.key)}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs transition ${step === s.key ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/60"}`}
                title={s.hint}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step === s.key ? "accent-gradient text-white" : "bg-raised"}`}>{i + 1}</span>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <StepContent step={step} />
          </div>
        </div>

        <section className="relative order-first min-h-[40vh] bg-stage p-4 lg:order-none lg:min-h-0">
          <Stage />
          {loading && <div className="glass absolute left-6 top-6 rounded-lg px-3 py-2 text-sm">{loading}</div>}
          {error && (
            <div role="alert" className="absolute bottom-6 left-6 right-6 flex items-start gap-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">
              <span className="flex-1">{error}</span>
              <button data-testid="error-close" onClick={() => useStore.getState().patch({ error: null })} className="shrink-0 rounded px-1 hover:bg-bad/20" aria-label="閉じる">
                ✕
              </button>
            </div>
          )}
          {dragging && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent-to bg-base/70 text-lg font-semibold">
              ここにドロップ（音声・画像・字幕）
            </div>
          )}
        </section>

        <aside className="bg-surface p-4 lg:min-h-0 lg:overflow-y-auto" aria-label="インスペクター">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">インスペクター</h2>
          <Inspector />
        </aside>
      </main>

      <footer className="sticky bottom-0 z-10 bg-surface px-4 py-3 lg:static" aria-label="タイムライン">
        <Timeline />
      </footer>
    </div>
  );
}
