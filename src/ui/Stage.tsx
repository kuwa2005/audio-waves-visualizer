import { useEffect, useRef, useState } from "react";
import { attachCanvas } from "../app/controller";
import { IDENTITY_TRANSFORM, OUTPUT_SIZE, transformRect, type LayerTransform, type Rect } from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { subtitleBounds, titleBounds } from "../text/textCatalog";
import { useStore } from "../state/store";

/** 文字レイヤー（タイトル・字幕）の変形後の範囲 */
function textRect(id: "title" | "subtitles"): Rect | null {
  const { scene } = useStore.getState();
  const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
  const L = scene[id];
  if (!L.enabled || (id === "subtitles" && scene.subtitles.cues.length === 0)) return null;
  const b = id === "title" ? titleBounds(L.params, W, H) : subtitleBounds(L.params, W, H);
  return transformRect(b, L.transform, W, H);
}

/** 出力座標で、point を含むレイヤーを手前から順に返す（文字がいちばん手前） */
export function hitAll(px: number, py: number): string[] {
  const { scene } = useStore.getState();
  const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
  const out: string[] = [];
  for (const id of ["subtitles", "title"] as const) {
    if (scene[id].locked) continue; // 固定中はクリックで選べない
    const r = textRect(id);
    if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) out.push(id);
  }
  for (let i = scene.visualizers.length - 1; i >= 0; i--) {
    const l = scene.visualizers[i];
    const meta = findMeta(l.pluginId);
    // 固定中のレイヤーはクリックで選べない（下のレイヤーを操作できる）
    if (!l.enabled || l.locked || !meta) continue;
    const r = transformRect(meta.bounds(l.params, W, H), l.transform, W, H);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) out.push(l.id);
  }
  return out;
}

/** 操作の対象: 選択中のレイヤーがその位置にあればそれ（下に隠れていても掴める）、無ければ最前面 */
function pickTarget(px: number, py: number): { id: string | null; hits: string[] } {
  const hits = hitAll(px, py);
  const sel = useStore.getState().selectedLayerId;
  return { id: sel && hits.includes(sel) ? sel : (hits[0] ?? null), hits };
}

/** 固定中のレイヤーか */
function isLocked(id: string): boolean {
  const { scene } = useStore.getState();
  if (id === "title" || id === "subtitles") return !!scene[id].locked;
  return !!scene.visualizers.find((v) => v.id === id)?.locked;
}

/** クリックとみなす移動量（出力座標の px） */
const CLICK_SLOP = 6;

/** レイヤー ID（ビジュアライザー・タイトル・字幕）の現在の変形 */
function transformOf(id: string | null): LayerTransform | null {
  if (!id) return null;
  const { scene } = useStore.getState();
  if (id === "title" || id === "subtitles") return scene[id].transform;
  return scene.visualizers.find((v) => v.id === id)?.transform ?? null;
}

/**
 * プレビュー領域。描画はすべて Worker が行い、ここは表示枠とマウス操作だけを持つ。
 * - ドラッグ: レイヤーを移動 / ホイール: 拡大縮小 / ダブルクリック: 位置と大きさを戻す
 */
export function Stage() {
  const outerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; start: LayerTransform; moved: boolean; hits: string[]; wasSelected: boolean } | null>(null);
  /** ダブルクリックの 1 回目で掴んだレイヤー（2 回目のクリックで下のレイヤーに切り替わっても、こちらを戻す） */
  const firstClick = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  /** 選択枠（ガイド）はプレビューがフォーカスを持っている間だけ表示する */
  const [focused, setFocused] = useState(false);
  const aspect = useStore((s) => s.scene.aspect);
  const selectedId = useStore((s) => s.selectedLayerId);
  const selected = useStore((s) => s.scene.visualizers.find((v) => v.id === s.selectedLayerId));
  // 文字レイヤーの変更でも枠を更新するため購読しておく
  const textState = useStore((s) => (s.selectedLayerId === "title" || s.selectedLayerId === "subtitles" ? s.scene[s.selectedLayerId] : null));
  const { width: W, height: H } = OUTPUT_SIZE[aspect];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!("transferControlToOffscreen" in canvas)) {
      useStore.getState().patch({ error: "このブラウザは OffscreenCanvas に対応していません" });
      return;
    }
    return attachCanvas(canvas);
  }, []);

  // 表示枠を、比率を保ったまま領域いっぱいに合わせる
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(el.clientWidth / W, el.clientHeight / H);
      setBox({ w: Math.floor(W * s), h: Math.floor(H * s) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  const toOutput = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { px: ((clientX - r.left) / r.width) * W, py: ((clientY - r.top) / r.height) * H };
  };

  // プレビューの外をクリックしたらガイドを消す（レイヤーの選択自体は残し、インスペクターで調整できるようにする）
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setFocused(false);
    };
    const onBlur = () => setFocused(false);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ホイールで拡大縮小（ページのスクロールを止めるため passive: false で登録）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { px, py } = toOutput(e.clientX, e.clientY);
      const st = useStore.getState();
      const id = pickTarget(px, py).id ?? st.selectedLayerId;
      const tr = transformOf(id);
      if (!id || !tr || isLocked(id)) return;
      e.preventDefault();
      if (st.selectedLayerId !== id) st.selectLayer(id);
      setFocused(true);
      st.setTransform(id, { scale: tr.scale * Math.exp(-e.deltaY * 0.0015) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, H]);

  const selRect: Rect | null = (() => {
    if (textState) return textRect(textState.id);
    if (!selected) return null;
    const meta = findMeta(selected.pluginId);
    return meta ? transformRect(meta.bounds(selected.params, W, H), selected.transform, W, H) : null;
  })();
  const selLabel = textState
    ? `${textState.id === "title" ? "タイトル" : "字幕"} ・ ${Math.round(textState.transform.scale * 100)}%`
    : selected
      ? `${findMeta(selected.pluginId)?.name} ・ ${Math.round(selected.transform.scale * 100)}%`
      : "";

  return (
    <div ref={outerRef} className="flex h-full w-full items-center justify-center">
      <div
        ref={boxRef}
        data-testid="stage"
        className="relative touch-none select-none"
        style={{ width: box.w, height: box.h, cursor: drag.current ? "grabbing" : hover ? "grab" : "default" }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const { px, py } = toOutput(e.clientX, e.clientY);
          const { id, hits } = pickTarget(px, py);
          const st = useStore.getState();
          const wasSelected = !!id && st.selectedLayerId === id;
          const now = performance.now();
          if (now - firstClick.current.at > 500) firstClick.current = { id, at: now };
          // 枠の外（レイヤーの無い所）をクリックしたら選択とガイドを解除
          setFocused(!!id);
          st.selectLayer(id);
          if (!id) return;
          drag.current = { id, px, py, start: { ...transformOf(id)! }, moved: false, hits, wasSelected };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const { px, py } = toOutput(e.clientX, e.clientY);
          const d = drag.current;
          if (d) {
            if (!d.moved && Math.hypot(px - d.px, py - d.py) < CLICK_SLOP) return;
            d.moved = true;
            useStore.getState().setTransform(d.id, { x: d.start.x + (px - d.px) / W, y: d.start.y + (py - d.py) / H });
          } else {
            setHover(hitAll(px, py)[0] ?? null);
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          // 選択中のレイヤーをもう一度クリック（動かさずに）したら、その下に重なっているレイヤーを順に選ぶ
          if (d && !d.moved && d.wasSelected && d.hits.length > 1) {
            const next = d.hits[(d.hits.indexOf(d.id) + 1) % d.hits.length];
            useStore.getState().selectLayer(next);
          }
        }}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => !drag.current && setHover(null)}
        onDoubleClick={(e) => {
          // ダブルクリックで元に戻すのは、1 回目のクリックで掴んだレイヤー
          const { px, py } = toOutput(e.clientX, e.clientY);
          const first = firstClick.current.id;
          const id = first && hitAll(px, py).includes(first) ? first : pickTarget(px, py).id;
          if (!id) return;
          useStore.getState().selectLayer(id);
          useStore.getState().setTransform(id, { ...IDENTITY_TRANSFORM });
        }}
      >
        <canvas ref={canvasRef} data-testid="stage-canvas" className="absolute inset-0 h-full w-full bg-black shadow-2xl shadow-black/50" />
        {focused && selRect && selectedId && (
          <div
            data-testid="selection-box"
            className="pointer-events-none absolute rounded-md border-2 border-dashed border-accent-to/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{
              left: `${(selRect.x / W) * 100}%`,
              top: `${(selRect.y / H) * 100}%`,
              width: `${(selRect.w / W) * 100}%`,
              height: `${(selRect.h / H) * 100}%`,
            }}
          >
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-accent-to/90 px-1.5 py-0.5 text-[11px] font-semibold text-black">
              {selLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
