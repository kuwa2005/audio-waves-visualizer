import { useEffect, useRef } from "react";
import { currentTime, seek, togglePlay } from "../app/controller";
import { resolveRange } from "../engine/scene";
import { useStore } from "../state/store";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * タイムライン: 再生ボタン・波形・ビート位置・再生位置。クリック／ドラッグでシーク。
 * 波形は読み込み時に 1 回だけ描き、再生位置の線と時刻表示だけを毎フレーム更新する（React の再描画なし）。
 */
export function Timeline() {
  const track = useStore((s) => s.track);
  const waveform = useStore((s) => s.waveform);
  const playing = useStore((s) => s.playing);
  const range = useStore((s) => s.scene.range);
  const theme = useStore((s) => s.theme);
  const repeat = useStore((s) => s.repeat);
  const setRepeat = useStore((s) => s.setRepeat);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const duration = track?.duration ?? 0;

  // 波形とビートの描画
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!waveform || !track) return;
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#8b5cf6");
      grad.addColorStop(1, "#22d3ee");
      g.fillStyle = grad;
      g.globalAlpha = 0.75;
      const n = waveform.length;
      for (let x = 0; x < w; x++) {
        const v = waveform[Math.min(n - 1, Math.floor((x / w) * n))];
        const bh = Math.max(1, v * h * 0.9);
        g.fillRect(x, (h - bh) / 2, 1, bh);
      }
      g.globalAlpha = 0.35;
      // ビート位置は文字色で（ライト・ダークのどちらでも見えるように）
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#e8eaf2";
      for (let i = 0; i < track.beats.length; i++) {
        const x = (track.beats[i] / track.duration) * w;
        g.fillRect(x, i % 4 === 0 ? 0 : h * 0.75, 1, i % 4 === 0 ? h * 0.18 : h * 0.25);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [waveform, track, theme]);

  /** 再生位置の線と時刻表示を今の位置に合わせる */
  const updateHead = () => {
    const t = currentTime();
    if (headRef.current) headRef.current.style.transform = `translateX(${duration > 0 ? (t / duration) * 100 : 0}cqw)`;
    if (timeRef.current) timeRef.current.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
  };

  // 再生位置の更新（毎フレーム更新するのは再生中だけ。止まっているときはシークしたときに更新する）
  useEffect(() => {
    updateHead();
    if (!playing) return;
    let id = 0;
    const tick = () => {
      updateHead();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, playing]);

  const updateRef = useRef(updateHead);
  updateRef.current = updateHead;

  // スペースキーで再生／一時停止、Home キーで先頭へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space" && tag !== "BUTTON") {
        e.preventDefault();
        void togglePlay();
      } else if (e.code === "Home" && useStore.getState().track) {
        e.preventDefault();
        void seek(0).then(updateRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    void seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration).then(updateHead);
  };

  return (
    <div className="flex h-full items-center gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <button
          data-testid="seek-start"
          onClick={() => void seek(0).then(updateHead)}
          disabled={!track}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-ink transition hover:border-accent-from disabled:opacity-30"
          aria-label="先頭へ戻る"
          title="先頭へ戻る（Home）"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <rect x="5" y="5" width="2.6" height="14" rx="1" />
            <path d="M19 5.8v12.4a1 1 0 0 1-1.5.86L8.6 13.3a1.5 1.5 0 0 1 0-2.6l8.9-5.76A1 1 0 0 1 19 5.8z" />
          </svg>
        </button>
        <button
          data-testid="play-button"
          onClick={() => void togglePlay()}
          disabled={!track}
          className="accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-white shadow-lg transition disabled:opacity-30"
          aria-label={playing ? "一時停止" : "再生"}
          title="再生／一時停止（Space）"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          data-testid="repeat-button"
          aria-pressed={repeat}
          onClick={() => setRepeat(!repeat)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${repeat ? "border-accent-to bg-accent-to/15 text-accent-to" : "border-line bg-raised text-ink-muted hover:text-ink"}`}
          aria-label={repeat ? "リピート再生をやめる" : "リピート再生する"}
          title={repeat ? "リピート再生中（押すと解除）" : "リピート再生（最後まで再生したら先頭から）"}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a3 3 0 0 1 3-3h15" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a3 3 0 0 1-3 3H3" />
          </svg>
        </button>
      </div>
      <span ref={timeRef} data-testid="time-display" className="w-24 shrink-0 font-mono text-xs text-ink-muted">
        0:00 / 0:00
      </span>
      <div
        data-testid="timeline"
        className="relative h-14 flex-1 cursor-pointer overflow-hidden rounded-lg border border-line bg-base [container-type:inline-size]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromEvent(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFromEvent(e)}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {track &&
          (range.start > 0 || range.length !== null) &&
          (() => {
            const r = resolveRange(range, track.duration);
            return (
              <div
                data-testid="timeline-range"
                className="pointer-events-none absolute inset-y-0 border-x-2 border-accent-to bg-accent-to/15"
                style={{
                  left: `${(r.start / track.duration) * 100}%`,
                  width: `${((r.end - r.start) / track.duration) * 100}%`,
                }}
                title="書き出す範囲"
              />
            );
          })()}
        {!track && <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-muted">音声を読み込むと波形とビート位置が表示されます</div>}
        <div ref={headRef} className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-ink shadow-[0_0_8px_var(--color-ink)]" />
      </div>
    </div>
  );
}
