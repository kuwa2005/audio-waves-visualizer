import { create } from "zustand";
import type { PerfSnapshot } from "../engine/perfStats";
import type { ExportProgress } from "../engine/exportTypes";
import {
  defaultScene,
  IDENTITY_TRANSFORM,
  SCALE_MAX,
  SCALE_MIN,
  type Aspect,
  type BackgroundLayer,
  type EffectLayer,
  type LayerTransform,
  type ParamValue,
  type ProgramRange,
  type TextLayerId,
  type Scene,
  type VisualizerLayer,
} from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import { SUBTITLE_PARAMS, TITLE_PARAMS } from "../text/textCatalog";
import type { Cue } from "../text/subtitles";
import { clearSettings, loadAutoDownload, loadPerfOpen, loadSettings, loadTheme, memoryKey, saveAutoDownload, savePerfOpen, saveSettings, saveTheme, type Theme } from "./persist";
import { defaultParams, type ParamDef } from "../plugins/types";
import type { ParamValues } from "../engine/scene";

export type Step = "media" | "visual" | "text" | "export";

export type MediaFile = { name: string; size: number };

export type ExportState =
  | { state: "idle" }
  | { state: "running"; progress: ExportProgress | null; note?: string }
  | { state: "done"; url: string; fileName: string; size: number; videoCodec: string; audioCodec: string; durationSec: number; elapsedSec: number }
  | { state: "error"; message: string; cancelled: boolean };

export type TrackInfoState = {
  name: string;
  duration: number;
  bpm: number;
  beats: Float32Array;
  analyzeMs: number;
};

type State = {
  scene: Scene;
  step: Step;
  selectedLayerId: string | null;
  audioFile: MediaFile | null;
  imageFiles: { id: string; name: string; aspect: Aspect; width: number; height: number }[];
  track: TrackInfoState | null;
  waveform: Float32Array | null;
  loading: string | null;
  playing: boolean;
  perf: PerfSnapshot | null;
  wasm: boolean | null;
  engineVersion: string | null;
  error: string | null;
  exportState: ExportState;
  /** 書き出したら自動でダウンロードを開始する（このブラウザに保存） */
  autoDownload: boolean;
  /** 種類ごとの最後の設定値（外して付け直したときに使う。このブラウザに保存） */
  lastParams: Record<string, ParamValues>;
  /** 種類ごとの最後の位置・大きさ（スペアナ・環境演出） */
  lastTransforms: Record<string, LayerTransform>;
  /** 画面の配色（このブラウザに保存） */
  theme: Theme;
  /** 性能表示を開いているか（このブラウザに保存） */
  perfOpen: boolean;
};

type Actions = {
  setStep(step: Step): void;
  setAspect(aspect: Aspect): void;
  selectLayer(id: string | null): void;
  addVisualizer(pluginId: string): void;
  removeVisualizer(id: string): void;
  toggleVisualizer(id: string): void;
  /** レイヤーの固定・解除（スペアナ等・エフェクト共通） */
  toggleLock(id: string): void;
  /** レイヤーの重なり順を変える（toIndex は scene.visualizers の添字。大きいほど手前） */
  moveVisualizer(id: string, toIndex: number): void;
  /** エフェクトのかかる順番を変える */
  moveEffect(id: string, toIndex: number): void;
  /** 選択中のレイヤーの設定値を初期値に戻す（位置・大きさと、文字の内容はそのまま） */
  resetLayerParams(layerId: string): void;
  setParam(layerId: string, key: string, value: ParamValue): void;
  /** 複数のパラメータをまとめて変える（配色プリセット等） */
  setParams(layerId: string, patch: Record<string, ParamValue>): void;
  setTransform(layerId: string, patch: Partial<LayerTransform>): void;
  addEffect(pluginId: string): void;
  removeEffect(id: string): void;
  toggleEffect(id: string): void;
  setEffectParam(layerId: string, key: string, value: ParamValue): void;
  setBackground(patch: Partial<Omit<BackgroundLayer, "id" | "kind">>): void;
  setRange(patch: Partial<ProgramRange>): void;
  /** 保存した設定を消し、素材の調整・レイヤー・エフェクトを初期状態に戻す（素材と文字はそのまま） */
  resetSettings(): void;
  setAutoDownload(on: boolean): void;
  setTheme(theme: Theme): void;
  setPerfOpen(open: boolean): void;
  setTextParam(id: TextLayerId, key: string, value: ParamValue): void;
  setTextParams(id: TextLayerId, patch: Record<string, ParamValue>): void;
  setTextEnabled(id: TextLayerId, enabled: boolean): void;
  setSubtitles(cues: Cue[], fileName: string | null): void;
  patch(p: Partial<State>): void;
};

/** 配色を画面に反映する（index.html でも読み込み前に同じことをして、ちらつきを防いでいる） */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

let seq = 0;
const newLayerId = () => `layer-${Date.now().toString(36)}-${seq++}`;

/** 初期状態のシーン（保存した設定を使わない） */
function freshScene(): Scene {
  const s = defaultScene();
  s.title.params = defaultParams({ params: TITLE_PARAMS });
  s.subtitles.params = defaultParams({ params: SUBTITLE_PARAMS });
  // レイヤーは空から始める（種類ごとの設定値は覚えているので、追加すれば前の設定で出る）
  return s;
}

const saved = loadSettings();

/** 起動時のシーン: 比率と素材の調整を復元する。レイヤーは空から始める */
function initialScene(): Scene {
  const s = freshScene();
  if (!saved) return s;
  return { ...s, aspect: saved.aspect ?? s.aspect, background: { ...s.background, ...saved.background } };
}

/** 種類ごとの記憶。前の版で保存したレイヤー一覧しか無ければ、そこから引き継ぐ */
function initialMemory(): { lastParams: Record<string, ParamValues>; lastTransforms: Record<string, LayerTransform> } {
  const lastParams = { ...(saved?.lastParams ?? {}) };
  const lastTransforms = { ...(saved?.lastTransforms ?? {}) };
  for (const v of saved?.visualizers ?? []) {
    const k = memoryKey("visualizer", v.pluginId);
    lastParams[k] ??= v.params;
    lastTransforms[k] ??= v.transform;
  }
  for (const e of saved?.effects ?? []) lastParams[memoryKey("effect", e.pluginId)] ??= e.params;
  return { lastParams, lastTransforms };
}

/** 配列の要素を移動する（範囲外は端に寄せる） */
function moveItem<T extends { id: string }>(list: T[], id: string, toIndex: number): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from < 0) return list;
  const to = Math.min(list.length - 1, Math.max(0, toIndex));
  if (to === from) return list;
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** 初期値に戻す。文字の内容（text 型）は残す */
function resetParams(defs: ParamDef[], cur: ParamValues): ParamValues {
  const out = defaultParams({ params: defs });
  for (const d of defs) if (d.type === "text" && cur[d.key] !== undefined) out[d.key] = cur[d.key];
  return out;
}

/** 変更したレイヤーの設定値を「種類ごとの最後の設定値」に記録する */
function remember(s: State, scene: Scene, layerId: string): Record<string, ParamValues> {
  const v = scene.visualizers.find((x) => x.id === layerId);
  if (v) return { ...s.lastParams, [memoryKey("visualizer", v.pluginId)]: v.params };
  const e = scene.effects.find((x) => x.id === layerId);
  if (e) return { ...s.lastParams, [memoryKey("effect", e.pluginId)]: e.params };
  return s.lastParams;
}

/** 追加するときの設定値: 前に使った値があればそれ、無ければ初期値 */
function paramsForNew(s: State, kind: "visualizer" | "effect", meta: { id: string; params: ParamDef[] }): ParamValues {
  const mem = s.lastParams[memoryKey(kind, meta.id)];
  return mem ? { ...defaultParams(meta), ...mem } : defaultParams(meta);
}

function mapVisualizers(scene: Scene, fn: (v: VisualizerLayer) => VisualizerLayer): Scene {
  return { ...scene, visualizers: scene.visualizers.map(fn) };
}

export const useStore = create<State & Actions>((set) => ({
  scene: initialScene(),
  step: "media",
  selectedLayerId: null,
  audioFile: null,
  imageFiles: [],
  track: null,
  waveform: null,
  loading: null,
  playing: false,
  perf: null,
  wasm: null,
  engineVersion: null,
  error: null,
  exportState: { state: "idle" },
  autoDownload: loadAutoDownload(),
  ...initialMemory(),
  theme: loadTheme(),
  perfOpen: loadPerfOpen(),

  setStep: (step) => set({ step }),
  setAspect: (aspect) => set((s) => ({ scene: { ...s.scene, aspect } })),
  selectLayer: (id) => set({ selectedLayerId: id }),
  addVisualizer: (pluginId) =>
    set((s) => {
      const meta = findMeta(pluginId);
      if (!meta) return {};
      const transform = { ...(s.lastTransforms[memoryKey("visualizer", pluginId)] ?? IDENTITY_TRANSFORM) };
      const layer: VisualizerLayer = { id: newLayerId(), kind: "visualizer", pluginId, enabled: true, opacity: 1, transform, params: paramsForNew(s, "visualizer", meta) };
      return { scene: { ...s.scene, visualizers: [...s.scene.visualizers, layer] }, selectedLayerId: layer.id };
    }),
  removeVisualizer: (id) =>
    set((s) => s.scene.visualizers.some((v) => v.id === id && v.locked) ? {} : ({
      scene: { ...s.scene, visualizers: s.scene.visualizers.filter((v) => v.id !== id) },
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),
  toggleLock: (id) =>
    set((s) => ({
      scene: {
        ...s.scene,
        visualizers: s.scene.visualizers.map((v) => (v.id === id ? { ...v, locked: !v.locked } : v)),
        effects: s.scene.effects.map((e) => (e.id === id ? { ...e, locked: !e.locked } : e)),
      },
    })),
  toggleVisualizer: (id) => set((s) => ({ scene: mapVisualizers(s.scene, (v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)) })),
  moveVisualizer: (id, toIndex) => set((s) => ({ scene: { ...s.scene, visualizers: moveItem(s.scene.visualizers, id, toIndex) } })),
  moveEffect: (id, toIndex) => set((s) => ({ scene: { ...s.scene, effects: moveItem(s.scene.effects, id, toIndex) } })),
  setParams: (layerId, patch) =>
    set((s) => {
      const scene = mapVisualizers(s.scene, (v) => (v.id === layerId ? { ...v, params: { ...v.params, ...patch } } : v));
      return { scene, lastParams: remember(s, scene, layerId) };
    }),
  setParam: (layerId, key, value) =>
    set((s) => {
      const scene = mapVisualizers(s.scene, (v) => (v.id === layerId ? { ...v, params: { ...v.params, [key]: value } } : v));
      return { scene, lastParams: remember(s, scene, layerId) };
    }),
  resetLayerParams: (layerId) =>
    set((s) => {
      if (layerId === "title" || layerId === "subtitles") {
        const L = s.scene[layerId];
        return { scene: { ...s.scene, [layerId]: { ...L, params: resetParams(layerId === "title" ? TITLE_PARAMS : SUBTITLE_PARAMS, L.params) } } };
      }
      const scene = {
        ...s.scene,
        visualizers: s.scene.visualizers.map((v) => (v.id === layerId ? { ...v, params: resetParams(findMeta(v.pluginId)?.params ?? [], v.params) } : v)),
        effects: s.scene.effects.map((e) => (e.id === layerId ? { ...e, params: resetParams(findEffectMeta(e.pluginId)?.params ?? [], e.params) } : e)),
      };
      return { scene, lastParams: remember(s, scene, layerId) };
    }),
  setTransform: (layerId, patch) =>
    set((s) => {
      const clampT = (cur: LayerTransform) => {
        const t = { ...cur, ...patch };
        t.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, t.scale));
        t.x = Math.min(1, Math.max(-1, t.x));
        t.y = Math.min(1, Math.max(-1, t.y));
        return t;
      };
      if (layerId === "title" || layerId === "subtitles") {
        const L = s.scene[layerId];
        return { scene: { ...s.scene, [layerId]: { ...L, transform: clampT(L.transform) } } };
      }
      const layer = s.scene.visualizers.find((v) => v.id === layerId);
      if (!layer) return {};
      const transform = clampT(layer.transform);
      return {
        scene: mapVisualizers(s.scene, (v) => (v.id === layerId ? { ...v, transform } : v)),
        lastTransforms: { ...s.lastTransforms, [memoryKey("visualizer", layer.pluginId)]: transform },
      };
    }),
  setTextParam: (id, key, value) =>
    set((s) => ({ scene: { ...s.scene, [id]: { ...s.scene[id], params: { ...s.scene[id].params, [key]: value } } } })),
  setTextParams: (id, patch) => set((s) => ({ scene: { ...s.scene, [id]: { ...s.scene[id], params: { ...s.scene[id].params, ...patch } } } })),
  setTextEnabled: (id, enabled) => set((s) => ({ scene: { ...s.scene, [id]: { ...s.scene[id], enabled } } })),
  setSubtitles: (cues, fileName) =>
    set((s) => ({ scene: { ...s.scene, subtitles: { ...s.scene.subtitles, cues, fileName, enabled: cues.length > 0 ? true : s.scene.subtitles.enabled } } })),
  addEffect: (pluginId) =>
    set((s) => {
      const meta = findEffectMeta(pluginId);
      if (!meta) return {};
      const layer: EffectLayer = { id: newLayerId(), kind: "effect", pluginId, enabled: true, params: paramsForNew(s, "effect", meta) };
      return { scene: { ...s.scene, effects: [...s.scene.effects, layer] }, selectedLayerId: layer.id };
    }),
  removeEffect: (id) =>
    set((s) => s.scene.effects.some((e) => e.id === id && e.locked) ? {} : ({
      scene: { ...s.scene, effects: s.scene.effects.filter((e) => e.id !== id) },
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),
  toggleEffect: (id) => set((s) => ({ scene: { ...s.scene, effects: s.scene.effects.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)) } })),
  setEffectParam: (layerId, key, value) =>
    set((s) => {
      const scene = { ...s.scene, effects: s.scene.effects.map((e) => (e.id === layerId ? { ...e, params: { ...e.params, [key]: value } } : e)) };
      return { scene, lastParams: remember(s, scene, layerId) };
    }),
  setRange: (p) => set((s) => ({ scene: { ...s.scene, range: { ...s.scene.range, ...p } } })),
  setBackground: (p) => set((s) => ({ scene: { ...s.scene, background: { ...s.scene.background, ...p } } })),
  resetSettings: () =>
    set((s) => {
      clearSettings();
      const f = freshScene();
      const fb = f.background;
      const bg = { ...s.scene.background, dim: fb.dim, zoomPunch: fb.zoomPunch, scale: fb.scale, panX: fb.panX, panY: fb.panY, fadeIn: fb.fadeIn, fadeOut: fb.fadeOut };
      return { scene: { ...s.scene, background: bg, visualizers: f.visualizers, effects: f.effects }, selectedLayerId: null, lastParams: {}, lastTransforms: {} };
    }),
  setAutoDownload: (on) => {
    saveAutoDownload(on);
    set({ autoDownload: on });
  },
  setTheme: (theme) => {
    saveTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
  setPerfOpen: (open) => {
    savePerfOpen(open);
    set({ perfOpen: open });
  },
  patch: (p) => set(p),
}));

// 設定が変わったら少し待ってから保存する（スライダー操作中に何度も書き込まない）
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((s, prev) => {
  const a = s.scene;
  const b = prev.scene;
  if (a.aspect === b.aspect && a.background === b.background && a.visualizers === b.visualizers && a.effects === b.effects && s.lastParams === prev.lastParams && s.lastTransforms === prev.lastTransforms) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const st = useStore.getState();
    const cur = st.scene;
    // レイヤーの一覧は保存しない（再読み込み時は空から始める）。種類ごとの設定値と位置・大きさを保存する
    saveSettings({ aspect: cur.aspect, lastParams: st.lastParams, lastTransforms: st.lastTransforms, background: cur.background, visualizers: [], effects: [] });
  }, 300);
});
