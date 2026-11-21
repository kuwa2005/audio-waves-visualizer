import { useRef, useState } from "react";
import { loadFiles, MEDIA_EXTENSIONS } from "../app/controller";
import { OUTPUT_SIZE, type Aspect } from "../engine/scene";
import { useStore } from "../state/store";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 今の比率で使われる背景画像の「全体が見える倍率」（100% = 画面を覆う大きさ に対する比） */
function containScale(images: { aspect: Aspect; width: number; height: number }[], aspect: Aspect): number {
  const im = images.find((i) => i.aspect === aspect) ?? images.find((i) => i.aspect === "16:9") ?? images.find((i) => i.aspect === "1:1") ?? images[0];
  if (!im) return 1;
  const { width: W, height: H } = OUTPUT_SIZE[aspect];
  const cover = Math.max(W / im.width, H / im.height);
  const contain = Math.min(W / im.width, H / im.height);
  return Math.max(0.5, Math.min(1, contain / cover));
}

const ACCEPT = [...MEDIA_EXTENSIONS.audio, ...MEDIA_EXTENSIONS.image, ...MEDIA_EXTENSIONS.subtitle].map((e) => `.${e}`).join(",");

/**
 * 手順1: 素材。ドロップ（またはクリックして選択）の場所は 1 つだけで、拡張子で
 * 音源・背景画像・字幕に振り分ける。画面全体へのドロップも同じ処理。
 */
export function MediaPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const audioFile = useStore((s) => s.audioFile);
  const track = useStore((s) => s.track);
  const loading = useStore((s) => s.loading);
  const images = useStore((s) => s.imageFiles);
  const subs = useStore((s) => s.scene.subtitles);
  const bg = useStore((s) => s.scene.background);
  const setBackground = useStore((s) => s.setBackground);
  const aspect = useStore((s) => s.scene.aspect);

  return (
    <div className="space-y-5">
      <section>
        <button
          data-testid="media-drop"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          // 読み込みと「ドロップ待ち」表示の解除はアプリ全体（App）で行う。ここでは強調表示を消すだけ
          onDrop={() => setOver(false)}
          className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
            over ? "border-accent-to bg-accent-to/10" : "border-line bg-raised/40 hover:border-accent-from hover:bg-raised"
          }`}
        >
          <span className="accent-gradient flex h-10 w-10 items-center justify-center rounded-full text-lg text-white" aria-hidden>
            ＋
          </span>
          <span className="text-sm font-semibold">ここにドロップ、またはクリックして選ぶ</span>
          <span className="text-xs leading-5 text-ink-muted">
            音源・背景画像・字幕をまとめて入れられます
            <br />
            拡張子で自動的に振り分けます
          </span>
        </button>
        <input
          ref={inputRef}
          data-testid="media-input"
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void loadFiles(e.target.files);
            e.target.value = ""; // 同じファイルをもう一度選べるように
          }}
        />
      </section>

      <section className="space-y-2 text-sm" data-testid="media-summary">
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">♪ 音源</span>
            <span className="text-[10px] text-ink-muted">{MEDIA_EXTENSIONS.audio.slice(0, 5).join(" / ")} など</span>
          </div>
          <p className="mt-0.5 truncate" data-testid="media-audio">
            {audioFile ? audioFile.name : <span className="text-ink-muted">未選択</span>}
          </p>
          {(loading || track) && (
            <p className="text-xs text-ink-muted">{loading ?? `${formatTime(track!.duration)} ・ ${track!.bpm.toFixed(1)} BPM ・ ${track!.beats.length} 拍`}</p>
          )}
        </div>
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">▣ 背景画像</span>
            <span className="text-[10px] text-ink-muted">16:9・9:16・1:1 を自動判定</span>
          </div>
          {images.length === 0 ? (
            <p className="mt-0.5 text-ink-muted">未選択</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5 text-xs" data-testid="media-images">
              {images.map((im) => (
                <li key={im.id} className="flex justify-between gap-2">
                  <span className="truncate">{im.name}</span>
                  <span className="shrink-0 rounded bg-raised px-1.5">{im.aspect}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">“” 字幕</span>
            <span className="text-[10px] text-ink-muted">srt / vtt</span>
          </div>
          <p className="mt-0.5 truncate" data-testid="media-subs">
            {subs.fileName ? `${subs.fileName}（${subs.cues.length} 件）` : <span className="text-ink-muted">未選択</span>}
          </p>
        </div>
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
            ビートでズーム <span className="font-mono text-xs text-ink-muted">{bg.zoomPunch > 0 ? "+" : ""}{Math.round(bg.zoomPunch * 100)}%</span>
          </span>
          <input data-testid="zoom-punch" type="range" min={-1} max={1} step={0.05} value={bg.zoomPunch} onChange={(e) => setBackground({ zoomPunch: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
          <span className="flex justify-between text-[10px] text-ink-muted">
            <span>← ズームアウト</span>
            <span>0</span>
            <span>ズームイン →</span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            背景の倍率 <span className="font-mono text-xs text-ink-muted">{Math.round(bg.scale * 100)}%</span>
          </span>
          <input data-testid="bg-scale" type="range" min={0.5} max={3} step={0.05} value={bg.scale} onChange={(e) => setBackground({ scale: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="flex justify-between">
              位置（横） <span className="font-mono text-xs text-ink-muted">{bg.panX.toFixed(2)}</span>
            </span>
            <input data-testid="bg-pan-x" type="range" min={-1} max={1} step={0.01} value={bg.panX} onChange={(e) => setBackground({ panX: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
          </label>
          <label className="block text-sm">
            <span className="flex justify-between">
              位置（縦） <span className="font-mono text-xs text-ink-muted">{bg.panY.toFixed(2)}</span>
            </span>
            <input data-testid="bg-pan-y" type="range" min={-1} max={1} step={0.01} value={bg.panY} onChange={(e) => setBackground({ panY: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            data-testid="bg-fit-reset"
            onClick={() => setBackground({ scale: 1, panX: 0, panY: 0 })}
            className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
            title="画面をちょうど覆う大きさ（100%）"
          >
            画面いっぱい（100%）
          </button>
          <button
            data-testid="bg-fit-contain"
            disabled={images.length === 0}
            onClick={() => setBackground({ scale: containScale(images, aspect), panX: 0, panY: 0 })}
            className="rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
            title="画像の全体が見える大きさ（縦横比が違うと周りが黒くなる）"
          >
            画像全体を表示
          </button>
        </div>
        <p className="text-[11px] leading-4 text-ink-muted">
          100% は画面をちょうど覆う大きさ（画面と同じ縦横比の画像なら全体がぴったり収まる）。小さくすると周りが黒、大きくすると位置で見せる場所を選べます。
        </p>
        <label className="block text-sm">
          <span className="flex justify-between">
            画面のフェードイン <span className="font-mono text-xs text-ink-muted">{bg.fadeIn.toFixed(1)} 秒</span>
          </span>
          <input data-testid="fade-in" type="range" min={0} max={5} step={0.1} value={bg.fadeIn} onChange={(e) => setBackground({ fadeIn: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            画面のフェードアウト <span className="font-mono text-xs text-ink-muted">{bg.fadeOut.toFixed(1)} 秒</span>
          </span>
          <input data-testid="fade-out" type="range" min={0} max={5} step={0.1} value={bg.fadeOut} onChange={(e) => setBackground({ fadeOut: Number(e.target.value) })} className="w-full accent-[var(--color-accent-from)]" />
        </label>
        <p className="text-[11px] leading-4 text-ink-muted">画面全体（背景・スペアナ・エフェクト・文字）が、書き出す範囲（「書き出し」で設定）の始まりで黒から現れ、終わりで黒へ消えます。プレビューにも反映されます。</p>
      </section>
    </div>
  );
}
