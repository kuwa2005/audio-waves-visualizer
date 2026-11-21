import { create } from "zustand";
import type { PerfSnapshot } from "../engine/perfStats";
import { defaultScene, type Aspect, type BackgroundLayer, type ParamValue, type Scene, type VisualizerLayer } from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { defaultParams } from "../plugins/types";

export type Step = "media" | "visual" | "text" | "export";

export type MediaFile = { name: string; size: number };

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
};

type Actions = {
  setStep(step: Step): void;
  setAspect(aspect: Aspect): void;
  selectLayer(id: string | null): void;
  addVisualizer(pluginId: string): void;
  removeVisualizer(id: string): void;
  toggleVisualizer(id: string): void;
  setParam(layerId: string, key: string, value: ParamValue): void;
  setBackground(patch: Partial<Omit<BackgroundLayer, "id" | "kind">>): void;
  patch(p: Partial<State>): void;
};

let seq = 0;
const newLayerId = () => `vis-${Date.now().toString(36)}-${seq++}`;

function initialScene(): Scene {
  const s = defaultScene();
  const meta = findMeta("neon-bars")!;
  s.visualizers.push({ id: newLayerId(), kind: "visualizer", pluginId: meta.id, enabled: true, opacity: 1, params: defaultParams(meta) });
  return s;
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

  setStep: (step) => set({ step }),
  setAspect: (aspect) => set((s) => ({ scene: { ...s.scene, aspect } })),
  selectLayer: (id) => set({ selectedLayerId: id }),
  addVisualizer: (pluginId) =>
    set((s) => {
      const meta = findMeta(pluginId);
      if (!meta) return {};
      const layer: VisualizerLayer = { id: newLayerId(), kind: "visualizer", pluginId, enabled: true, opacity: 1, params: defaultParams(meta) };
      return { scene: { ...s.scene, visualizers: [...s.scene.visualizers, layer] }, selectedLayerId: layer.id };
    }),
  removeVisualizer: (id) =>
    set((s) => ({
      scene: { ...s.scene, visualizers: s.scene.visualizers.filter((v) => v.id !== id) },
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),
  toggleVisualizer: (id) => set((s) => ({ scene: mapVisualizers(s.scene, (v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)) })),
  setParam: (layerId, key, value) =>
    set((s) => ({ scene: mapVisualizers(s.scene, (v) => (v.id === layerId ? { ...v, params: { ...v.params, [key]: value } } : v)) })),
  setBackground: (p) => set((s) => ({ scene: { ...s.scene, background: { ...s.scene.background, ...p } } })),
  patch: (p) => set(p),
}));
