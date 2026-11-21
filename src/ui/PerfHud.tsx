import { useStore } from "../state/store";

const FRAME_BUDGET_MS = 1000 / 60;

/** フレーム時間の表示。描画時間が予算の半分以内なら緑、予算内なら黄、超えたら赤 */
export function PerfHud() {
  const perf = useStore((s) => s.perf);
  const wasm = useStore((s) => s.wasm);
  const track = useStore((s) => s.track);
  const p95 = perf?.renderP95 ?? 0;
  const color = p95 < FRAME_BUDGET_MS / 2 ? "text-ok" : p95 < FRAME_BUDGET_MS ? "text-warn" : "text-bad";
  return (
    <div
      data-testid="perf-hud"
      className="glass pointer-events-none absolute right-3 top-3 rounded-lg border border-line px-3 py-2 font-mono text-xs leading-5"
    >
      <div>
        FPS <span data-testid="perf-fps" className={color}>{perf ? perf.fps.toFixed(1) : "--"}</span>
      </div>
      <div>
        描画 p50/p95 <span className={color}>{perf ? `${perf.renderP50.toFixed(2)} / ${p95.toFixed(2)} ms` : "--"}</span>
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
    </div>
  );
}
