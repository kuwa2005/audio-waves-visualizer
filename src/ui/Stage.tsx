import { useEffect, useRef, useState } from "react";
import { attachCanvas } from "../app/controller";
import { IDENTITY_TRANSFORM, OUTPUT_SIZE, transformRect, type LayerTransform, type Rect } from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { useStore } from "../state/store";

/** 出力座標で、point を含む最前面のレイヤーを探す */
function hitTest(px: number, py: number): string | null {
  const { scene } = useStore.getState();
  const { width: W, height: H } = OUTPUT_SIZE[scene.aspect];
  for (let i = scene.visualizers.length - 1; i >= 0; i--) {
    const l = scene.visualizers[i];
    const meta = findMeta(l.pluginId);
    if (!l.enabled || !meta) continue;
    const r = transformRect(meta.bounds(l.params, W, H), l.transform, W, H);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return l.id;
  }
  return null;
}

/**
 * プレビュー領域。描画はすべて Worker が行い、ここは表示枠とマウス操作だけを持つ。
 * - ドラッグ: レイヤーを移動 / ホイール: 拡大縮小 / ダブルクリック: 位置と大きさを戻す
 */
export function Stage() {
  const outerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; start: LayerTransform } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const aspect = useStore((s) => s.scene.aspect);
  const selectedId = useStore((s) => s.selectedLayerId);
  const selected = useStore((s) => s.scene.visualizers.find((v) => v.id === s.selectedLayerId));
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

  // ホイールで拡大縮小（ページのスクロールを止めるため passive: false で登録）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { px, py } = toOutput(e.clientX, e.clientY);
      const st = useStore.getState();
      const id = hitTest(px, py) ?? st.selectedLayerId;
      const layer = st.scene.visualizers.find((v) => v.id === id);
      if (!layer) return;
      e.preventDefault();
      if (st.selectedLayerId !== layer.id) st.selectLayer(layer.id);
      st.setTransform(layer.id, { scale: layer.transform.scale * Math.exp(-e.deltaY * 0.0015) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, H]);

  const selRect: Rect | null = (() => {
    if (!selected) return null;
    const meta = findMeta(selected.pluginId);
    return meta ? transformRect(meta.bounds(selected.params, W, H), selected.transform, W, H) : null;
  })();

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
          const id = hitTest(px, py);
          const st = useStore.getState();
          st.selectLayer(id);
          if (!id) return;
          const layer = st.scene.visualizers.find((v) => v.id === id)!;
          drag.current = { id, px, py, start: { ...layer.transform } };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const { px, py } = toOutput(e.clientX, e.clientY);
          const d = drag.current;
          if (d) {
            useStore.getState().setTransform(d.id, { x: d.start.x + (px - d.px) / W, y: d.start.y + (py - d.py) / H });
          } else {
            setHover(hitTest(px, py));
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => !drag.current && setHover(null)}
        onDoubleClick={(e) => {
          const { px, py } = toOutput(e.clientX, e.clientY);
          const id = hitTest(px, py);
          if (id) useStore.getState().setTransform(id, { ...IDENTITY_TRANSFORM });
        }}
      >
        <canvas ref={canvasRef} data-testid="stage-canvas" className="absolute inset-0 h-full w-full rounded-xl bg-black shadow-2xl shadow-black/50" />
        {selRect && selectedId && (
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
              {findMeta(selected!.pluginId)?.name} ・ {Math.round(selected!.transform.scale * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
