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
      g.fillStyle = "#e8eaf2";
      for (let i = 0; i < track.beats.length; i++) {
        const x = (track.beats[i] / track.duration) * w;
        g.fillRect(x, i % 4 === 0 ? 0 : h * 0.75, 1, i % 4 === 0 ? h * 0.18 : h * 0.25);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [waveform, track]);

  // 再生位置の更新
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const t = currentTime();
      if (headRef.current && duration > 0) headRef.current.style.transform = `translateX(${(t / duration) * 100}cqw)`;
      if (timeRef.current) timeRef.current.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [duration]);

  // スペースキーで再生／一時停止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && tag !== "BUTTON") {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    void seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration);
  };

  return (
    <div className="flex h-full items-center gap-4">
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
        {track && (range.start > 0 || range.length !== null) && (() => {
          const r = resolveRange(range, track.duration);
          return (
            <div
              data-testid="timeline-range"
              className="pointer-events-none absolute inset-y-0 border-x-2 border-accent-to bg-accent-to/15"
              style={{ left: `${(r.start / track.duration) * 100}%`, width: `${((r.end - r.start) / track.duration) * 100}%` }}
              title="書き出す範囲"
            />
          );
        })()}
        {!track && <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-muted">音声を読み込むと波形とビート位置が表示されます</div>}
        <div ref={headRef} className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-white shadow-[0_0_8px_white]" />
      </div>
    </div>
  );
}
