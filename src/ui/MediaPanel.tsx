import { useRef } from "react";
import { loadFiles } from "../app/controller";
import { useStore } from "../state/store";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 手順1: 素材（音声・背景画像）。ドラッグ＆ドロップは画面全体でも受け付ける */
export function MediaPanel() {
  const audioRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioFile = useStore((s) => s.audioFile);
  const track = useStore((s) => s.track);
  const loading = useStore((s) => s.loading);
  const images = useStore((s) => s.imageFiles);
  const bg = useStore((s) => s.scene.background);
  const setBackground = useStore((s) => s.setBackground);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">音声</h3>
        <button
          onClick={() => audioRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-line bg-raised/40 px-4 py-5 text-left transition hover:border-accent-from hover:bg-raised"
        >
          <span className="block text-sm font-medium">{audioFile ? audioFile.name : "音声ファイルを選ぶ"}</span>
          <span className="mt-1 block text-xs text-ink-muted">
            {loading ?? (track ? `${formatTime(track.duration)} ・ ${track.bpm.toFixed(1)} BPM ・ ${track.beats.length} 拍` : "WAV / MP3 / M4A / FLAC など。ドロップでも可")}
          </span>
        </button>
        <input
          ref={audioRef}
          data-testid="audio-input"
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.srt,.vtt"
          className="hidden"
          onChange={(e) => e.target.files && loadFiles(e.target.files)}
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">背景画像</h3>
        <button
          onClick={() => imageRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-line bg-raised/40 px-4 py-5 text-left transition hover:border-accent-from hover:bg-raised"
        >
          <span className="block text-sm font-medium">画像を選ぶ（複数可）</span>
          <span className="mt-1 block text-xs text-ink-muted">16:9・9:16・1:1 用を自動で振り分けます</span>
        </button>
        <input
          ref={imageRef}
          data-testid="image-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && loadFiles(e.target.files)}
        />
        {images.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {images.map((im) => (
              <li key={im.id} className="flex justify-between gap-2">
                <span className="truncate">{im.name}</span>
                <span className="shrink-0 rounded bg-raised px-1.5">{im.aspect}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">背景の調整</h3>
        <label className="block text-sm">
          <span className="flex justify-between">
            暗さ <span className="font-mono text-xs text-ink-muted">{Math.round(bg.dim * 100)}%</span>
          </span>
          <input type="range" min={0} max={0.9} step={0.05} value={bg.dim} onChange={(e) => setBackground({ dim: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            ビートでズーム <span className="font-mono text-xs text-ink-muted">{Math.round(bg.zoomPunch * 100)}%</span>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={bg.zoomPunch} onChange={(e) => setBackground({ zoomPunch: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            画像のフェードイン <span className="font-mono text-xs text-ink-muted">{bg.fadeIn.toFixed(1)} 秒</span>
          </span>
          <input data-testid="fade-in" type="range" min={0} max={5} step={0.1} value={bg.fadeIn} onChange={(e) => setBackground({ fadeIn: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            画像のフェードアウト <span className="font-mono text-xs text-ink-muted">{bg.fadeOut.toFixed(1)} 秒</span>
          </span>
          <input data-testid="fade-out" type="range" min={0} max={5} step={0.1} value={bg.fadeOut} onChange={(e) => setBackground({ fadeOut: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <p className="text-[11px] leading-4 text-ink-muted">書き出す範囲（「書き出し」で設定）の始まりで黒から現れ、終わりで黒へ消えます。プレビューにも反映されます。</p>
      </section>
    </div>
  );
}
