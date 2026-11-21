import { num, type PluginMeta } from "./types";

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
  bounds(p, W, H) {
    const baseY = H * num(p, "y", 0.82);
    const h = H * num(p, "height", 0.55);
    const below = p.mirror !== false ? h * 0.35 * 1.05 : H * 0.02;
    return { x: 0, y: baseY - h, w: W, h: h + below };
  },
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
  bounds(p, W, H) {
    const m = Math.min(W, H);
    const r = m * (num(p, "radius", 0.2) * 1.18 + num(p, "length", 0.22));
    return { x: W / 2 - r, y: H / 2 - r, w: r * 2, h: r * 2 };
  },
};

const full = (_p: unknown, W: number, H: number) => ({ x: 0, y: 0, w: W, h: H });

export const warpTunnelMeta: PluginMeta = {
  id: "warp-tunnel",
  name: "ワープトンネル",
  description: "奥から手前へ飛んでくる光のリング。低音で加速、ビートで閃光",
  params: [
    { key: "rings", label: "リングの数", type: "number", min: 12, max: 64, step: 1, default: 36 },
    { key: "speed", label: "速さ", type: "number", min: 0.1, max: 3, step: 0.05, default: 1 },
    { key: "sides", label: "形（角の数、0=円）", type: "number", min: 0, max: 12, step: 1, default: 6 },
    { key: "twist", label: "ねじれ", type: "number", min: -1, max: 1, step: 0.05, default: 0.35 },
    { key: "hue", label: "色相", type: "number", min: 0, max: 360, step: 1, default: 200, unit: "°" },
    { key: "hueShift", label: "色の変化", type: "number", min: 0, max: 180, step: 1, default: 90, unit: "°" },
  ],
  bounds: full,
};

export const galaxyMeta: PluginMeta = {
  id: "particle-galaxy",
  name: "パーティクル・ギャラクシー",
  description: "数万の光の粒が渦を巻き、キックで爆発する（WASM で計算）",
  params: [
    { key: "count", label: "粒の数", type: "select", default: "40000", options: [
      { value: "15000", label: "15,000（軽い）" },
      { value: "40000", label: "40,000" },
      { value: "80000", label: "80,000（重い）" },
    ] },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 1.6, step: 0.05, default: 0.9 },
    { key: "swirl", label: "回転", type: "number", min: 0, max: 3, step: 0.05, default: 1 },
    { key: "explode", label: "爆発の強さ", type: "number", min: 0, max: 2, step: 0.05, default: 1 },
    { key: "trail", label: "残像", type: "number", min: 0, max: 0.95, step: 0.05, default: 0.6 },
    { key: "brightness", label: "明るさ", type: "number", min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: "inner", label: "内側の色", type: "color", default: "#ff6ad5" },
    { key: "outer", label: "外側の色", type: "color", default: "#3cc8ff" },
  ],
  bounds(p, W, H) {
    const r = Math.min(W, H) * 0.5 * num(p, "size", 0.9) * 1.15;
    return { x: W / 2 - r, y: H / 2 - r, w: r * 2, h: r * 2 };
  },
};

export const lightningMeta: PluginMeta = {
  id: "lightning",
  name: "ライトニング",
  description: "音の立ち上がりで稲妻が走る。強い音ほど太く枝分かれする",
  params: [
    { key: "threshold", label: "反応のしきい値", type: "number", min: 0.1, max: 0.95, step: 0.05, default: 0.55 },
    { key: "bolts", label: "同時に出る数", type: "number", min: 1, max: 6, step: 1, default: 2 },
    { key: "branches", label: "枝分かれ", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "color", label: "色", type: "color", default: "#9bd7ff" },
    { key: "flash", label: "空の光り", type: "number", min: 0, max: 0.6, step: 0.05, default: 0.18 },
  ],
  bounds: full,
};

export const lineScapeMeta: PluginMeta = {
  id: "line-scape",
  name: "3D ラインスケープ",
  description: "スペクトルの履歴が奥から流れてくる立体的な地形",
  params: [
    { key: "lines", label: "線の数", type: "number", min: 16, max: 72, step: 2, default: 44 },
    { key: "history", label: "履歴の長さ（秒）", type: "number", min: 0.5, max: 6, step: 0.1, default: 2.4 },
    { key: "height", label: "山の高さ", type: "number", min: 0.05, max: 0.6, step: 0.01, default: 0.26 },
    { key: "horizon", label: "地平線の高さ", type: "number", min: 0.1, max: 0.7, step: 0.01, default: 0.36 },
    { key: "color", label: "線の色", type: "color", default: "#7cf7ff" },
    { key: "far", label: "奥の色", type: "color", default: "#b56bff" },
  ],
  bounds(p, W, H) {
    const top = H * num(p, "horizon", 0.36) - H * num(p, "height", 0.26) * 0.5;
    return { x: 0, y: top, w: W, h: H - top };
  },
};

export const CATALOG: PluginMeta[] = [neonBarsMeta, pulseRingMeta, warpTunnelMeta, galaxyMeta, lightningMeta, lineScapeMeta];

export function findMeta(id: string): PluginMeta | undefined {
  return CATALOG.find((m) => m.id === id);
}
