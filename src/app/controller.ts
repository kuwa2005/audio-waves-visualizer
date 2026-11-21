import { AudioEngine } from "../audio/AudioEngine";
import { RenderHost } from "../engine/RenderHost";
import type { FromWorker } from "../engine/protocol";
import { guessAspect } from "../engine/scene";
import { useStore } from "../state/store";

/**
 * 画面（React）と、音声エンジン・描画 Worker をつなぐ司令塔。
 * React コンポーネントはここの関数を呼ぶだけで、描画や音声の詳細を知らない。
 */
const audio = new AudioEngine();
let host: RenderHost | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let imageSeq = 0;

function onWorkerMessage(msg: FromWorker): void {
  const st = useStore.getState();
  switch (msg.type) {
    case "ready":
      st.patch({ wasm: msg.wasm, engineVersion: msg.version });
      break;
    case "perf":
      st.patch({ perf: msg.perf });
      break;
    case "trackInfo":
      st.patch({
        track: { name: st.audioFile?.name ?? "", ...msg.info },
        loading: null,
      });
      pushTransport();
      break;
    case "error":
      st.patch({ error: msg.message, loading: null });
      break;
  }
}

function pushTransport(): void {
  host?.send({ type: "transport", transport: audio.transport() });
}

export function attachCanvas(canvas: HTMLCanvasElement): () => void {
  host = new RenderHost(canvas, useStore.getState().scene, onWorkerMessage);
  const unsub = useStore.subscribe((s, prev) => {
    if (s.scene !== prev.scene) host?.send({ type: "scene", scene: s.scene });
  });
  const onVisibility = () => host?.send({ type: "setRunning", running: !document.hidden });
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    unsub();
    document.removeEventListener("visibilitychange", onVisibility);
    host?.dispose();
    host = null;
  };
}

audio.onEnded = () => {
  useStore.getState().patch({ playing: false });
  stopSync();
  pushTransport();
};

function startSync(): void {
  stopSync();
  // 音声と映像の時計のずれを定期的に補正する
  syncTimer = setInterval(pushTransport, 1000);
}
function stopSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

export async function loadAudio(file: File): Promise<void> {
  const st = useStore.getState();
  st.patch({ loading: `音声を解析中: ${file.name}`, error: null, playing: false, audioFile: { name: file.name, size: file.size } });
  stopSync();
  try {
    const { pcm, sampleRate } = await audio.load(file);
    useStore.getState().patch({ waveform: computePeaks(pcm, 1200) });
    host?.send({ type: "loadTrack", pcm, sampleRate }, [pcm.buffer]);
    pushTransport();
  } catch (e) {
    st.patch({ loading: null, error: `音声を読み込めませんでした（${file.name}）: ${String(e)}` });
  }
}

/** タイムライン表示用の波形の概形（区間ごとの最大振幅） */
export function computePeaks(pcm: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets);
  const per = pcm.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(pcm.length, Math.floor((b + 1) * per));
    let m = 0;
    for (let i = from; i < to; i++) {
      const v = pcm[i] < 0 ? -pcm[i] : pcm[i];
      if (v > m) m = v;
    }
    out[b] = m;
  }
  return out;
}

export async function loadImage(file: File): Promise<void> {
  const st = useStore.getState();
  try {
    const bitmap = await createImageBitmap(file);
    const aspect = guessAspect(bitmap.width, bitmap.height);
    const id = `img-${imageSeq++}`;
    const info = { id, name: file.name, aspect, width: bitmap.width, height: bitmap.height };
    host?.send({ type: "image", id, bitmap }, [bitmap]);
    const s = useStore.getState();
    s.patch({ imageFiles: [...s.imageFiles.filter((f) => f.aspect !== aspect), info] });
    s.setBackground({ images: { ...s.scene.background.images, [aspect]: id } });
  } catch (e) {
    st.patch({ error: `画像を読み込めませんでした（${file.name}）: ${String(e)}` });
  }
}

/** ドロップ・選択されたファイルを種類で振り分ける */
export async function loadFiles(files: FileList | File[]): Promise<void> {
  for (const f of Array.from(files)) {
    if (f.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(f.name)) await loadAudio(f);
    else if (f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name)) await loadImage(f);
  }
}

export async function togglePlay(): Promise<void> {
  if (!useStore.getState().track) return;
  if (audio.isPlaying) {
    audio.pause();
    stopSync();
  } else {
    await audio.play();
    startSync();
  }
  useStore.getState().patch({ playing: audio.isPlaying });
  pushTransport();
}

export async function seek(t: number): Promise<void> {
  await audio.seek(t);
  pushTransport();
}

export function currentTime(): number {
  return audio.currentTime();
}
