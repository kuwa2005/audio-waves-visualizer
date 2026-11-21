import { useState } from "react";
import { loadFiles } from "../app/controller";
import type { Aspect } from "../engine/scene";
import { useStore, type Step } from "../state/store";
import { ExportPanel } from "./ExportPanel";
import { Inspector } from "./Inspector";
import { MediaPanel } from "./MediaPanel";
import { PerfHud } from "./PerfHud";
import { Stage } from "./Stage";
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
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="grid h-full grid-rows-[56px_1fr_auto] gap-px bg-line"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void loadFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex items-center gap-3 bg-surface px-4">
        <div className="accent-gradient h-7 w-7 shrink-0 rounded-lg" aria-hidden />
        <h1 className="truncate text-sm font-semibold tracking-wide">Audio Waves Visualizer</h1>
        <span className="hidden rounded-md bg-raised px-2 py-0.5 text-xs text-ink-muted sm:inline">v0.3 プレビュー版</span>
        <a href={CLASSIC_URL} data-testid="classic-link" className="classic-link ml-2 shrink-0 rounded-md px-2.5 py-1 text-xs font-bold">
          → 旧版はこちら
        </a>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex rounded-lg bg-raised p-0.5" role="radiogroup" aria-label="画面比率">
            {ASPECTS.map((a) => (
              <button
                key={a}
                role="radio"
                aria-checked={aspect === a}
                data-testid={`aspect-${a}`}
                onClick={() => setAspect(a)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs transition ${aspect === a ? "bg-surface text-ink shadow" : "text-ink-muted hover:text-ink"}`}
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
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-1 gap-px lg:grid-cols-[320px_1fr_300px]">
        <div className="flex min-h-0 flex-col bg-surface lg:order-none">
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <StepContent step={step} />
          </div>
        </div>

        <section className="relative order-first min-h-[40vh] bg-base p-4 lg:order-none lg:min-h-0">
          <Stage />
          <PerfHud />
          {loading && <div className="glass absolute left-6 top-6 rounded-lg px-3 py-2 text-sm">{loading}</div>}
          {error && (
            <div role="alert" className="absolute bottom-6 left-6 right-6 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">
              {error}
            </div>
          )}
          {dragging && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent-to bg-base/70 text-lg font-semibold">
              ここにドロップ（音声・画像）
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto bg-surface p-4" aria-label="インスペクター">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">インスペクター</h2>
          <Inspector />
        </aside>
      </main>

      <footer className="bg-surface px-4 py-3" aria-label="タイムライン">
        <Timeline />
      </footer>
    </div>
  );
}
