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
  type Scene,
  type VisualizerLayer,
} from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import { defaultParams } from "../plugins/types";

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
};

type Actions = {
  setStep(step: Step): void;
  setAspect(aspect: Aspect): void;
  selectLayer(id: string | null): void;
  addVisualizer(pluginId: string): void;
  removeVisualizer(id: string): void;
  toggleVisualizer(id: string): void;
  setParam(layerId: string, key: string, value: ParamValue): void;
  setTransform(layerId: string, patch: Partial<LayerTransform>): void;
  addEffect(pluginId: string): void;
  removeEffect(id: string): void;
  toggleEffect(id: string): void;
  setEffectParam(layerId: string, key: string, value: ParamValue): void;
  setBackground(patch: Partial<Omit<BackgroundLayer, "id" | "kind">>): void;
  setRange(patch: Partial<ProgramRange>): void;
  patch(p: Partial<State>): void;
};

let seq = 0;
const newLayerId = () => `layer-${Date.now().toString(36)}-${seq++}`;

function initialScene(): Scene {
  const s = defaultScene();
  const meta = findMeta("neon-bars")!;
  s.visualizers.push({ id: newLayerId(), kind: "visualizer", pluginId: meta.id, enabled: true, opacity: 1, transform: { ...IDENTITY_TRANSFORM }, params: defaultParams(meta) });
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
  exportState: { state: "idle" },

  setStep: (step) => set({ step }),
  setAspect: (aspect) => set((s) => ({ scene: { ...s.scene, aspect } })),
  selectLayer: (id) => set({ selectedLayerId: id }),
  addVisualizer: (pluginId) =>
    set((s) => {
      const meta = findMeta(pluginId);
      if (!meta) return {};
      const layer: VisualizerLayer = { id: newLayerId(), kind: "visualizer", pluginId, enabled: true, opacity: 1, transform: { ...IDENTITY_TRANSFORM }, params: defaultParams(meta) };
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
  setTransform: (layerId, patch) =>
    set((s) => ({
      scene: mapVisualizers(s.scene, (v) => {
        if (v.id !== layerId) return v;
        const t = { ...v.transform, ...patch };
        t.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, t.scale));
        t.x = Math.min(1, Math.max(-1, t.x));
        t.y = Math.min(1, Math.max(-1, t.y));
        return { ...v, transform: t };
      }),
    })),
  addEffect: (pluginId) =>
    set((s) => {
      const meta = findEffectMeta(pluginId);
      if (!meta) return {};
      const layer: EffectLayer = { id: newLayerId(), kind: "effect", pluginId, enabled: true, params: defaultParams(meta) };
      return { scene: { ...s.scene, effects: [...s.scene.effects, layer] }, selectedLayerId: layer.id };
    }),
  removeEffect: (id) =>
    set((s) => ({
      scene: { ...s.scene, effects: s.scene.effects.filter((e) => e.id !== id) },
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),
  toggleEffect: (id) => set((s) => ({ scene: { ...s.scene, effects: s.scene.effects.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)) } })),
  setEffectParam: (layerId, key, value) =>
    set((s) => ({
      scene: { ...s.scene, effects: s.scene.effects.map((e) => (e.id === layerId ? { ...e, params: { ...e.params, [key]: value } } : e)) },
    })),
  setRange: (p) => set((s) => ({ scene: { ...s.scene, range: { ...s.scene.range, ...p } } })),
  setBackground: (p) => set((s) => ({ scene: { ...s.scene, background: { ...s.scene.background, ...p } } })),
  patch: (p) => set(p),
}));
