import { AudioEngine } from "../audio/AudioEngine";
import { RenderHost } from "../engine/RenderHost";
import type { FromWorker } from "../engine/protocol";
import { guessAspect } from "../engine/scene";
import { applyAudioFade, type ExportSettings } from "../engine/exportTypes";
import { pickAudio } from "../engine/codecs";
import { encodeAacWithFfmpeg, type PreEncodedAac } from "../audio/aacFallback";
import { parseSubtitles } from "../text/subtitles";
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
      if (msg.wasm && shouldAutoloadDemo()) void loadDemo();
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
      if (st.exportState.state === "running") st.patch({ exportState: { state: "error", message: msg.message, cancelled: false } });
      break;
    case "exportProgress": {
      const prev = st.exportState;
      st.patch({ exportState: { state: "running", progress: msg.progress, note: prev.state === "running" ? prev.note : undefined } });
      break;
    }
    case "exportDone": {
      const r = msg.result;
      const prev = st.exportState;
      if (prev.state === "done") URL.revokeObjectURL(prev.url);
      const blob = new Blob([r.buffer], { type: r.mimeType });
      const base = (st.audioFile?.name ?? "audio-waves").replace(/\.[^.]+$/, "");
      st.patch({
        exportState: {
          state: "done",
          url: URL.createObjectURL(blob),
          fileName: `${base}-${st.scene.aspect.replace(":", "x")}.mp4`,
          size: blob.size,
          videoCodec: r.videoCodec,
          audioCodec: r.audioCodec,
          durationSec: r.durationSec,
          elapsedSec: r.elapsedSec,
        },
      });
      // 「書き出したら自動でダウンロード」が「はい」なら、そのまま保存を始める
      const done = useStore.getState().exportState;
      if (useStore.getState().autoDownload && done.state === "done") startDownload(done.url, done.fileName);
      break;
    }
    case "exportError":
      st.patch({ exportState: { state: "error", message: msg.message, cancelled: msg.cancelled } });
      break;
  }
}

/**
 * デモ素材（public/sample/）の読み込み。本番では起動時に何も読み込まない。
 * URL に ?demo を付けたときだけ読み込む（動作確認・自動テスト用）。
 */
const DEMO_FILES = ["demo.m4a", "demo-16x9.jpg", "demo-9x16.jpg", "demo-1x1.jpg", "demo.srt"];
let demoLoaded = false;

function shouldAutoloadDemo(): boolean {
  return !demoLoaded && new URLSearchParams(location.search).has("demo") && !useStore.getState().audioFile;
}

export async function loadDemo(): Promise<void> {
  demoLoaded = true;
  try {
    const base = `${import.meta.env.BASE_URL}sample/`;
    const files = await Promise.all(
      DEMO_FILES.map(async (name) => {
        const res = await fetch(base + name);
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
        const blob = await res.blob();
        // 表示名は元の曲名にする
        const display = name === "demo.m4a" ? "持ち帰るとは行ったけど（デモ）.m4a" : name === "demo.srt" ? "持ち帰るとは行ったけど（デモ）.srt" : name;
        return new File([blob], display, { type: blob.type });
      }),
    );
    // 利用者が先に自分の素材を読み込んでいたら、デモで上書きしない
    if (useStore.getState().audioFile) return;
    await loadFiles(files);
  } catch (e) {
    useStore.getState().patch({ error: `デモ素材を読み込めませんでした: ${String(e)}` });
  }
}

/** ブラウザのダウンロードを開始する */
function startDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
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

/** 字幕ファイル（SRT / VTT）を読み込む */
export async function loadSubtitleFile(file: File): Promise<void> {
  const cues = parseSubtitles(await file.text());
  if (cues.length === 0) {
    useStore.getState().patch({ error: `字幕を読み取れませんでした（${file.name}）。SRT または WebVTT 形式か確認してください` });
    return;
  }
  useStore.getState().setSubtitles(cues, file.name);
}

/** ドロップ・選択されたファイルを種類で振り分ける */
export type MediaKind = "audio" | "image" | "subtitle" | null;

/** 対応する拡張子（素材エリアの accept にも使う） */
export const MEDIA_EXTENSIONS = {
  audio: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "opus"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"],
  subtitle: ["srt", "vtt"],
} as const;

/** ファイルの種類を拡張子で判定する（拡張子が無いときだけ MIME タイプで判定） */
export function mediaKind(name: string, mime = ""): MediaKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext) {
    for (const k of ["audio", "image", "subtitle"] as const) if ((MEDIA_EXTENSIONS[k] as readonly string[]).includes(ext)) return k;
    return null;
  }
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/vtt" || mime === "application/x-subrip") return "subtitle";
  return null;
}

/** ドロップ・選択されたファイルを拡張子で 背景画像・音源・字幕 に振り分ける（音源は最後の 1 つを使う） */
export async function loadFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  const skipped: string[] = [];
  const audios: File[] = [];
  for (const f of list) {
    const kind = mediaKind(f.name, f.type);
    if (kind === "image") await loadImage(f);
    else if (kind === "subtitle") await loadSubtitleFile(f);
    else if (kind === "audio") audios.push(f);
    else skipped.push(f.name);
  }
  // 音源は解析に時間がかかるので最後に 1 つだけ読み込む
  if (audios.length) await loadAudio(audios[audios.length - 1]);
  if (skipped.length) {
    useStore.getState().patch({
      error: `対応していない形式のため読み込みませんでした: ${skipped.join("、")}（音源: ${MEDIA_EXTENSIONS.audio.join(" / ")}、画像: ${MEDIA_EXTENSIONS.image.join(" / ")}、字幕: srt / vtt）`,
    });
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

/** ブラウザが AAC を作れるか（作れなければ ffmpeg.wasm で AAC を作る） */
export async function nativeAacAvailable(sampleRate = 48000, channels = 2): Promise<boolean> {
  try {
    return (await pickAudio(sampleRate, channels)).label === "AAC";
  } catch {
    return false;
  }
}

/** MP4 書き出しを開始する（再生は一時停止する） */
export async function startExport(settings: ExportSettings): Promise<void> {
  const st = useStore.getState();
  if (!st.track || st.exportState.state === "running") return;
  if (audio.isPlaying) {
    audio.pause();
    stopSync();
    st.patch({ playing: false });
    pushTransport();
  }
  const src = audio.channelsCopy();
  if (!src) return;
  st.patch({ exportState: { state: "running", progress: null } });

  // AAC を作れない環境では、ffmpeg.wasm で範囲の音声を AAC にしてから渡す
  let aac: PreEncodedAac | undefined;
  if (!(await nativeAacAvailable(src.sampleRate, src.channels.length))) {
    try {
      useStore.getState().patch({ exportState: { state: "running", progress: null, note: "音声を AAC に変換中…（初回は変換プログラム約 32MB を読み込みます）" } });
      const from = Math.floor(settings.start * src.sampleRate);
      const to = Math.floor(settings.end * src.sampleRate);
      const slices = src.channels.map((c) => c.slice(from, to));
      if (settings.audioFade > 0) slices.forEach((c) => applyAudioFade(c, src.sampleRate, settings.audioFade));
      aac = await encodeAacWithFfmpeg(slices, src.sampleRate);
      useStore.getState().patch({ exportState: { state: "running", progress: null } });
    } catch (e) {
      // 変換できなければ Opus で続行（完了時に注意を表示）
      console.warn("AAC fallback failed", e);
      useStore.getState().patch({ exportState: { state: "running", progress: null, note: "AAC に変換できなかったため Opus で書き出します" } });
    }
  }
  const transfer: Transferable[] = src.channels.map((c) => c.buffer);
  if (aac) transfer.push(aac.data.buffer, aac.sizes.buffer);
  host?.send({ type: "export", settings, channels: src.channels, sampleRate: src.sampleRate, aac }, transfer);
}

export function cancelExport(): void {
  host?.send({ type: "cancelExport" });
}
