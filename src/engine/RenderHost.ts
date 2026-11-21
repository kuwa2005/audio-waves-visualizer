import type { FromWorker, ToWorker } from "./protocol";

/**
 * メインスレッド側の窓口。キャンバスの制御を Worker に移し、メッセージをやり取りする。
 * UI（React）は描画処理を一切持たない。
 */
export class RenderHost {
  private readonly worker: Worker;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    onMessage: (msg: FromWorker) => void,
  ) {
    this.worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
    this.worker.onerror = (e) => onMessage({ type: "error", message: e.message || "Worker error" });
    const offscreen = canvas.transferControlToOffscreen();
    this.send({ type: "init", canvas: offscreen, width, height }, [offscreen]);
  }

  send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
