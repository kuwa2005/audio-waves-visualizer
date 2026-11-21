import type { PluginMeta } from "./types";

/**
 * ビジュアライザーの一覧（メタ情報のみ）。UI はこれを使い、描画コードは Worker 側の registry が持つ。
 * 新しいビジュアライザーを追加するときは、ここと registry.ts の両方に登録する。
 */

export const neonBarsMeta: PluginMeta = {
  id: "neon-bars",
  name: "ネオンバー",
  description: "発光する周波数バー。ビートで床が光り、ピークが残る",
  params: [
    { key: "bars", label: "本数", type: "number", min: 16, max: 192, step: 8, default: 96 },
    { key: "height", label: "高さ", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.55 },
    { key: "y", label: "位置（縦）", type: "number", min: 0.2, max: 1, step: 0.01, default: 0.82 },
    { key: "hueFrom", label: "色相（低音側）", type: "number", min: 0, max: 360, step: 1, default: 275, unit: "°" },
    { key: "hueTo", label: "色相（高音側）", type: "number", min: 0, max: 360, step: 1, default: 185, unit: "°" },
    { key: "glow", label: "発光", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "mirror", label: "鏡像（下に反射）", type: "boolean", default: true },
  ],
};

export const pulseRingMeta: PluginMeta = {
  id: "pulse-ring",
  name: "パルスリング",
  description: "円形スペクトラム。ビートごとに衝撃波リングが広がる",
  params: [
    { key: "radius", label: "半径", type: "number", min: 0.05, max: 0.45, step: 0.01, default: 0.2 },
    { key: "spikes", label: "トゲの数", type: "number", min: 32, max: 256, step: 8, default: 128 },
    { key: "length", label: "トゲの長さ", type: "number", min: 0.05, max: 0.5, step: 0.01, default: 0.22 },
    { key: "color", label: "色", type: "color", default: "#22d3ee" },
    { key: "accent", label: "衝撃波の色", type: "color", default: "#f472b6" },
    { key: "shockwave", label: "衝撃波", type: "number", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "rotate", label: "回転速度", type: "number", min: -1, max: 1, step: 0.05, default: 0.15 },
  ],
};

export const CATALOG: PluginMeta[] = [neonBarsMeta, pulseRingMeta];

export function findMeta(id: string): PluginMeta | undefined {
  return CATALOG.find((m) => m.id === id);
}
