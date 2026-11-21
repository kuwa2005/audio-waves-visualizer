import { useEffect, useRef } from "react";
import { attachCanvas } from "../app/controller";
import { OUTPUT_SIZE } from "../engine/scene";
import { useStore } from "../state/store";

/** プレビュー領域。描画はすべて Worker が行い、ここは表示枠だけを持つ */
export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = useStore((s) => s.scene.aspect);
  const { width, height } = OUTPUT_SIZE[aspect];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!("transferControlToOffscreen" in canvas)) {
      useStore.getState().patch({ error: "このブラウザは OffscreenCanvas に対応していません" });
      return;
    }
    return attachCanvas(canvas);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        data-testid="stage-canvas"
        className="max-h-full max-w-full rounded-xl bg-black shadow-2xl shadow-black/50"
        style={{ aspectRatio: `${width} / ${height}`, height: width >= height ? "auto" : "100%", width: width >= height ? "100%" : "auto" }}
      />
    </div>
  );
}
