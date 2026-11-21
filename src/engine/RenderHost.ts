import type { FromWorker, ToWorker } from "./protocol";
import type { Scene } from "./scene";

/**
 * メインスレッド側の窓口。キャンバスの制御を Worker に移し、メッセージをやり取りする。
 * UI（React）は描画処理を一切持たない。
 */
export class RenderHost {
  private readonly worker: Worker;

  constructor(canvas: HTMLCanvasElement, scene: Scene, onMessage: (msg: FromWorker) => void) {
    this.worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
    this.worker.onerror = (e) => onMessage({ type: "error", message: e.message || "Worker error" });
    const offscreen = canvas.transferControlToOffscreen();
    this.send({ type: "init", canvas: offscreen, scene }, [offscreen]);
  }

  send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
