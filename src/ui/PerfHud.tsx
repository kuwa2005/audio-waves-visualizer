import { useStore } from "../state/store";

const FRAME_BUDGET_MS = 1000 / 60;

/**
 * 性能表示（ヘッダーに格納）。普段は「FPS ▼」だけを出し、押すと詳細を開く。
 * 描画時間が予算の半分以内なら緑、予算内なら黄、超えたら赤。止まっているときは描画しないので「停止中」。
 */
export function PerfHud() {
  const perf = useStore((s) => s.perf);
  const wasm = useStore((s) => s.wasm);
  const track = useStore((s) => s.track);
  const playing = useStore((s) => s.playing);
  const open = useStore((s) => s.perfOpen);
  const setOpen = useStore((s) => s.setPerfOpen);
  const p95 = perf?.renderP95 ?? 0;
  const color = !playing ? "text-ink-muted" : p95 < FRAME_BUDGET_MS / 2 ? "text-ok" : p95 < FRAME_BUDGET_MS ? "text-warn" : "text-bad";
  const live = playing && perf !== null;
  return (
    <div className="relative">
      <button
        data-testid="perf-toggle"
        aria-expanded={open}
        aria-controls="perf-hud"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-raised px-1.5 py-1 font-mono text-[11px] sm:px-2 sm:text-xs text-ink-muted transition hover:text-ink"
        title={open ? "性能表示を閉じる" : "性能表示（FPS・描画時間など）を開く"}
      >
        FPS <span aria-hidden className={`inline-block transition ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div
        id="perf-hud"
        data-testid="perf-hud"
        hidden={!open}
        className="glass absolute right-0 top-full z-30 mt-2 w-max rounded-lg border border-line px-3 py-2 font-mono text-xs leading-5 shadow-xl"
      >
        <div>
          FPS{" "}
          <span data-testid="perf-fps" className={color}>
            {live ? perf.fps.toFixed(1) : "停止中"}
          </span>
        </div>
        <div>
          描画 p50/p95 <span className={color}>{live ? `${perf.renderP50.toFixed(2)} / ${p95.toFixed(2)} ms` : "--"}</span>
        </div>
        <div>
          コマ落ち <span data-testid="perf-dropped">{perf?.dropped ?? "--"}</span>
        </div>
        <div>
          WASM <span data-testid="perf-wasm">{wasm === null ? "読込中" : wasm ? "OK" : "失敗"}</span>
        </div>
        {track && (
          <div>
            BPM <span data-testid="perf-bpm">{track.bpm.toFixed(1)}</span> / 解析 {track.analyzeMs.toFixed(0)} ms
          </div>
        )}
        {!playing && <div className="mt-1 text-[10px] text-ink-muted">止まっている間は描画を休止しています</div>}
      </div>
    </div>
  );
}
