import { useEffect, useRef } from "react";
import { RenderHost } from "../engine/RenderHost";
import type { FromWorker } from "../engine/protocol";

export const OUTPUT_WIDTH = 1920;
export const OUTPUT_HEIGHT = 1080;

/** プレビュー領域。描画はすべて Worker が行い、ここは表示枠だけを持つ */
export function Stage({ onEngineMessage }: { onEngineMessage: (msg: FromWorker) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlerRef = useRef(onEngineMessage);
  handlerRef.current = onEngineMessage;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!("transferControlToOffscreen" in canvas)) {
      handlerRef.current({ type: "error", message: "このブラウザは OffscreenCanvas に対応していません" });
      return;
    }
    const host = new RenderHost(canvas, OUTPUT_WIDTH, OUTPUT_HEIGHT, (m) => handlerRef.current(m));
    const onVisibility = () => host.send({ type: "setRunning", running: !document.hidden });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      host.dispose();
    };
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black">
      <canvas
        ref={canvasRef}
        data-testid="stage-canvas"
        className="aspect-video max-h-full max-w-full"
        style={{ width: "100%", height: "auto" }}
      />
    </div>
  );
}
