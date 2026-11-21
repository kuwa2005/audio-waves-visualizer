import { num, type PluginMeta } from "./types";
import type { ParamValues } from "../engine/scene";

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

/** ターンテーブルの各部の位置（出力ピクセル座標）。描画と当たり判定で共通 */
export function turntableLayout(p: ParamValues, W: number, H: number) {
  const w = Math.min(W * 0.92, H * 1.25) * num(p, "size", 0.8);
  const h = w * 0.74;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const bodyH = h - (22 * w) / 1000;
  const px = x + w * 0.4;
  const py = y + bodyH * 0.5;
  const platterR = bodyH * 0.42;
  const pivotX = x + w * 0.83;
  const pivotY = y + bodyH * 0.2;
  const armLen = Math.hypot(px - pivotX, py - pivotY) * 1.02;
  return { x, y, w, h, px, py, platterR, pivotX, pivotY, armLen };
}

export const turntableMeta: PluginMeta = {
  id: "turntable",
  name: "ターンテーブル",
  description: "高級レコードプレーヤー。ラベルに背景画像、針は曲の進行に合わせて内側へ",
  params: [
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 1, step: 0.01, default: 0.8 },
    {
      key: "finish",
      label: "仕上げ",
      type: "select",
      default: "aluminum",
      options: [
        { value: "aluminum", label: "ヘアラインアルミ" },
        { value: "black", label: "ピアノブラック" },
        { value: "walnut", label: "ウォールナット" },
      ],
    },
    { key: "rpm", label: "回転数", type: "select", default: "33", options: [{ value: "33", label: "33⅓ 回転" }, { value: "45", label: "45 回転" }] },
    { key: "spinScale", label: "回転速度（倍率）", type: "number", min: 0.1, max: 1, step: 0.05, default: 1, unit: "×" },
    {
      key: "picture",
      label: "画像の表示",
      type: "select",
      default: "label",
      options: [
        { value: "label", label: "中央のラベルだけ" },
        { value: "full", label: "盤面全体（ピクチャーレコード）" },
      ],
    },
    { key: "led", label: "ランプの色", type: "color", default: "#4cc3ff" },
    { key: "vibration", label: "低音での振動", type: "number", min: 0, max: 1, step: 0.05, default: 0.4 },
  ],
  bounds(p, W, H) {
    const l = turntableLayout(p, W, H);
    return { x: l.x, y: l.y, w: l.w, h: l.h };
  },
};

export const lineSpectrumMeta: PluginMeta = {
  id: "line-spectrum",
  name: "ライン",
  description: "なめらかな曲線のスペクトル。発光・塗りつぶし・上下鏡像",
  params: [
    { key: "points", label: "細かさ", type: "number", min: 32, max: 256, step: 8, default: 128 },
    { key: "height", label: "高さ", type: "number", min: 0.05, max: 0.8, step: 0.01, default: 0.35 },
    { key: "y", label: "位置（縦）", type: "number", min: 0.1, max: 1, step: 0.01, default: 0.7 },
    { key: "thickness", label: "線の太さ", type: "number", min: 1, max: 12, step: 0.5, default: 4 },
    { key: "colorA", label: "色（低音側）", type: "color", default: "#ff4fd8" },
    { key: "colorB", label: "色（高音側）", type: "color", default: "#3ef2ff" },
    { key: "fill", label: "下を塗る", type: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "mirror", label: "上下鏡像", type: "boolean", default: false },
    { key: "glow", label: "発光", type: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  ],
  bounds(p, W, H) {
    const base = H * num(p, "y", 0.7);
    const h = H * num(p, "height", 0.35);
    const below = p.mirror === true ? h : H * 0.02;
    return { x: 0, y: base - h, w: W, h: h + below };
  },
};

export const graphicEqMeta: PluginMeta = {
  id: "graphic-eq",
  name: "グライコ",
  description: "グラフィックイコライザー風の LED 表示。ピークホールドと周波数目盛り付き",
  params: [
    { key: "bands", label: "バンド数", type: "select", default: "31", options: [{ value: "16", label: "16 バンド" }, { value: "31", label: "31 バンド（1/3 オクターブ）" }] },
    { key: "segments", label: "段数", type: "number", min: 8, max: 40, step: 1, default: 24 },
    { key: "width", label: "幅", type: "number", min: 0.2, max: 1, step: 0.01, default: 0.7 },
    { key: "height", label: "高さ", type: "number", min: 0.1, max: 0.8, step: 0.01, default: 0.38 },
    { key: "y", label: "位置（縦・下端）", type: "number", min: 0.2, max: 1, step: 0.01, default: 0.9 },
    { key: "low", label: "色（下段）", type: "color", default: "#2dff9a" },
    { key: "mid", label: "色（中段）", type: "color", default: "#ffd23f" },
    { key: "high", label: "色（上段）", type: "color", default: "#ff3b5c" },
    { key: "panel", label: "パネル背景", type: "number", min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: "labels", label: "周波数の目盛り", type: "boolean", default: true },
  ],
  bounds(p, W, H) {
    const w = W * num(p, "width", 0.7);
    const h = H * num(p, "height", 0.38);
    const bottom = H * num(p, "y", 0.9);
    const pad = H * 0.03;
    return { x: (W - w) / 2 - pad, y: bottom - h - pad, w: w + pad * 2, h: h + pad * 2 + (p.labels !== false ? H * 0.03 : 0) };
  },
};

export const radialBarsMeta: PluginMeta = {
  id: "radial-bars",
  name: "サークルバー",
  description: "円の周りに放射状のバー。中央で背景画像が回り、低音で脈打つ",
  params: [
    { key: "bars", label: "本数", type: "number", min: 32, max: 240, step: 4, default: 120 },
    { key: "radius", label: "半径", type: "number", min: 0.08, max: 0.4, step: 0.01, default: 0.2 },
    { key: "length", label: "バーの長さ", type: "number", min: 0.05, max: 0.5, step: 0.01, default: 0.2 },
    { key: "hue", label: "色相", type: "number", min: 0, max: 360, step: 1, default: 190, unit: "°" },
    { key: "hueRange", label: "色の幅", type: "number", min: 0, max: 360, step: 1, default: 140, unit: "°" },
    { key: "art", label: "中央に背景画像", type: "boolean", default: true },
    { key: "spin", label: "画像の回転", type: "number", min: -1, max: 1, step: 0.05, default: 0.15 },
  ],
  bounds(p, W, H) {
    const m = Math.min(W, H);
    const r = m * (num(p, "radius", 0.2) + num(p, "length", 0.2) * 1.1);
    return { x: W / 2 - r, y: H / 2 - r, w: r * 2, h: r * 2 };
  },
};

export const oscilloscopeMeta: PluginMeta = {
  id: "oscilloscope",
  name: "オシロスコープ",
  description: "音の波形そのものを表示。蛍光の残像と目盛り付きの計測器風",
  params: [
    { key: "height", label: "振れ幅", type: "number", min: 0.05, max: 0.5, step: 0.01, default: 0.22 },
    { key: "y", label: "位置（縦）", type: "number", min: 0.1, max: 0.9, step: 0.01, default: 0.5 },
    { key: "window", label: "表示する長さ（ms）", type: "number", min: 5, max: 100, step: 1, default: 30 },
    { key: "thickness", label: "線の太さ", type: "number", min: 1, max: 8, step: 0.5, default: 2.5 },
    { key: "color", label: "色", type: "color", default: "#5dff8f" },
    { key: "ghosts", label: "残像", type: "number", min: 0, max: 6, step: 1, default: 3 },
    { key: "grid", label: "目盛り", type: "boolean", default: true },
  ],
  bounds(p, W, H) {
    const cy = H * num(p, "y", 0.5);
    const h = H * num(p, "height", 0.22) * 1.2;
    return { x: 0, y: cy - h, w: W, h: h * 2 };
  },
};

export const spectrogramMeta: PluginMeta = {
  id: "spectrogram",
  name: "スペクトログラム",
  description: "時間（横）と周波数（縦）を色で表す。右から左へ流れる",
  params: [
    { key: "history", label: "表示する長さ（秒）", type: "number", min: 1, max: 12, step: 0.5, default: 5 },
    { key: "top", label: "上端", type: "number", min: 0, max: 0.9, step: 0.01, default: 0.6 },
    { key: "bottom", label: "下端", type: "number", min: 0.1, max: 1, step: 0.01, default: 1 },
    {
      key: "palette",
      label: "配色",
      type: "select",
      default: "inferno",
      options: [
        { value: "inferno", label: "インフェルノ（黒→赤→黄）" },
        { value: "ocean", label: "オーシャン（黒→青→白）" },
        { value: "neon", label: "ネオン（紫→ピンク→シアン）" },
      ],
    },
    { key: "opacity", label: "不透明度", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.85 },
  ],
  bounds(p, W, H) {
    const top = H * num(p, "top", 0.6);
    return { x: 0, y: top, w: W, h: H * num(p, "bottom", 1) - top };
  },
};

// ---- 環境演出（画面全体に重ねる雰囲気づくり） ----

export const spaceMeta: PluginMeta = {
  id: "space",
  name: "宇宙空間",
  description: "宇宙船で星の海を進むように、奥から星が光の筋になって流れてくる。ビートでワープ",
  category: "ambient",
  params: [
    { key: "darken", label: "背景を暗くする", type: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
    { key: "stars", label: "星の数", type: "number", min: 200, max: 3000, step: 50, default: 1400 },
    { key: "speed", label: "進む速さ", type: "number", min: 0.1, max: 4, step: 0.05, default: 1 },
    { key: "warp", label: "ビートでワープ", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "streak", label: "光の筋の長さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "cx", label: "進む方向（横）", type: "number", min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: "cy", label: "進む方向（縦）", type: "number", min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: "nebula", label: "遠くの星雲", type: "number", min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: "hueA", label: "星雲の色 1", type: "color", default: "#5b2cff" },
    { key: "hueB", label: "星雲の色 2", type: "color", default: "#1f8fff" },
  ],
  bounds: full,
};

export const starrySkyMeta: PluginMeta = {
  id: "starry-sky",
  name: "星空",
  description: "またたく星々と星雲の夜空。低音で星雲が脈打ち、ときどき流れ星",
  category: "ambient",
  params: [
    { key: "darken", label: "背景を暗くする", type: "number", min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: "stars", label: "星の数", type: "number", min: 100, max: 2000, step: 50, default: 900 },
    { key: "starSize", label: "星の大きさ", type: "number", min: 0.3, max: 4, step: 0.05, default: 1, unit: "×" },
    { key: "nebula", label: "星雲の濃さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "hueA", label: "星雲の色 1", type: "color", default: "#7b3cff" },
    { key: "hueB", label: "星雲の色 2", type: "color", default: "#1fa8ff" },
    { key: "drift", label: "流れる速さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.25 },
    { key: "meteors", label: "流れ星", type: "boolean", default: true },
  ],
  bounds: full,
};

export const dropsMeta: PluginMeta = {
  id: "drops",
  name: "描画",
  description: "画面に落ちて広がる水滴の波紋。ハート・花火・星型・猫の手にも変えられる。ビートでまとめて発生",
  category: "ambient",
  params: [
    {
      key: "variant",
      label: "種類",
      type: "select",
      default: "ripple",
      options: [
        { value: "ripple", label: "水滴" },
        { value: "heart", label: "ハート" },
        { value: "firework", label: "花火" },
        { value: "star", label: "星型" },
        { value: "paw", label: "猫の手" },
      ],
    },
    { key: "rate", label: "落ちる量（1 秒あたり）", type: "number", min: 0, max: 40, step: 0.5, default: 3 },
    { key: "audio", label: "音への反応（ビートで発生）", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "life", label: "消えるまで（秒）", type: "number", min: 0.4, max: 4, step: 0.1, default: 1.6 },
    { key: "color", label: "色", type: "color", default: "#8fd8ff" },
    { key: "colorful", label: "色のばらつき", type: "number", min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: "glow", label: "発光", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  bounds: full,
};

export const sparkleMeta: PluginMeta = {
  id: "sparkle",
  name: "きらきら",
  description: "光の粒がまたたく。ビートごとにきらめきがはじける",
  category: "ambient",
  params: [
    { key: "count", label: "粒の数", type: "number", min: 20, max: 400, step: 10, default: 140 },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "burst", label: "ビートではじける数", type: "number", min: 0, max: 60, step: 1, default: 18 },
    { key: "color", label: "色", type: "color", default: "#fff3c4" },
    { key: "tint", label: "色の幅", type: "number", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "area", label: "範囲（下から）", type: "number", min: 0.2, max: 1, step: 0.05, default: 1 },
  ],
  bounds: full,
};

/** ミラーボールの位置（出力ピクセル座標）。描画と当たり判定で共通 */
export function mirrorBallLayout(p: ParamValues, W: number, H: number) {
  const R = Math.min(W, H) * num(p, "size", 0.1);
  const cx = W * num(p, "x", 0.5);
  const cy = H * num(p, "hang", 0.2);
  return { R, cx, cy };
}

export const mirrorBallMeta: PluginMeta = {
  id: "mirror-ball",
  name: "ミラーボール",
  description: "80 年代ディスコの天井で回るミラーボール。複数のスポットライトの光がタイルごとに反射し、壁・床・天井を流れる",
  category: "ambient",
  params: [
    { key: "lights", label: "光源の数", type: "number", min: 1, max: 4, step: 1, default: 3 },
    { key: "lightAngle", label: "光源の向き（回転）", type: "number", min: -180, max: 180, step: 1, default: 0, unit: "°" },
    { key: "lightHeight", label: "光源の高さ", type: "number", min: -1, max: 1, step: 0.05, default: -0.4 },
    {
      key: "colors",
      label: "光の色",
      type: "select",
      default: "white",
      options: [
        { value: "white", label: "白（クラシック）" },
        { value: "rainbow", label: "光源ごとに色を変える" },
        { value: "warm", label: "ゴールド" },
      ],
    },
    { key: "size", label: "ボールの大きさ", type: "number", min: 0.04, max: 0.3, step: 0.005, default: 0.1 },
    { key: "x", label: "位置（横）", type: "number", min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
    { key: "hang", label: "吊り下げの高さ", type: "number", min: 0.08, max: 0.6, step: 0.01, default: 0.2 },
    { key: "speed", label: "回転速度", type: "number", min: 0, max: 1, step: 0.01, default: 0.08 },
    { key: "wobble", label: "揺れ", type: "number", min: 0, max: 1, step: 0.05, default: 0.25 },
    { key: "tiles", label: "タイルの細かさ", type: "number", min: 8, max: 26, step: 1, default: 16 },
    { key: "amount", label: "光の粒の量", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.6 },
    { key: "spotSize", label: "光の粒の大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "room", label: "部屋の広さ", type: "number", min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: "beams", label: "光線", type: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "darken", label: "部屋を暗くする", type: "number", min: 0, max: 0.9, step: 0.05, default: 0.4 },
    { key: "flash", label: "ビートで輝く", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
  ],
  bounds(p, W, H) {
    const { R, cx, cy } = mirrorBallLayout(p, W, H);
    return { x: cx - R * 1.3, y: 0, w: R * 2.6, h: cy + R * 1.3 };
  },
};

export const atmosphereMeta: PluginMeta = {
  id: "atmosphere",
  name: "空気感",
  description: "差し込む光の筋、ただよう塵とボケ、ほのかなもや。音量で呼吸する",
  category: "ambient",
  params: [
    { key: "rays", label: "光の筋", type: "number", min: 0, max: 1, step: 0.05, default: 0.65 },
    { key: "dust", label: "塵の量", type: "number", min: 0, max: 300, step: 10, default: 120 },
    { key: "bokeh", label: "ボケ玉", type: "number", min: 0, max: 40, step: 1, default: 14 },
    { key: "haze", label: "もや", type: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "color", label: "光の色", type: "color", default: "#ffd9a0" },
    { key: "angle", label: "光の角度", type: "number", min: -60, max: 60, step: 1, default: 25, unit: "°" },
  ],
  bounds: full,
};

export const rainMeta: PluginMeta = {
  id: "rain",
  name: "雨",
  description: "奥行きのある雨と、地面ではねるしぶき。低音で雨脚が強まる",
  category: "ambient",
  params: [
    { key: "amount", label: "雨の量", type: "number", min: 50, max: 1500, step: 50, default: 800 },
    { key: "speed", label: "落ちる速さ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "wind", label: "風（傾き）", type: "number", min: -45, max: 45, step: 1, default: 12, unit: "°" },
    { key: "splash", label: "しぶき", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "gloom", label: "空の暗さ", type: "number", min: 0, max: 0.8, step: 0.05, default: 0.3 },
    { key: "color", label: "色", type: "color", default: "#bcd6ff" },
  ],
  bounds: full,
};

export const snowMeta: PluginMeta = {
  id: "snow",
  name: "雪",
  description: "ひらひらと舞う雪。手前の大きな雪はぼけて見える",
  category: "ambient",
  params: [
    { key: "amount", label: "雪の量", type: "number", min: 30, max: 1200, step: 10, default: 350 },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "speed", label: "落ちる速さ", type: "number", min: 0.1, max: 2, step: 0.05, default: 0.5 },
    { key: "wind", label: "風", type: "number", min: -1, max: 1, step: 0.05, default: 0.15 },
    { key: "sway", label: "揺れ", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "color", label: "色", type: "color", default: "#ffffff" },
  ],
  bounds: full,
};

export const sakuraMeta: PluginMeta = {
  id: "sakura",
  name: "桜吹雪",
  description: "花びらがくるくると回りながら舞い散る",
  category: "ambient",
  params: [
    { key: "amount", label: "花びらの量", type: "number", min: 10, max: 500, step: 10, default: 220 },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "speed", label: "落ちる速さ", type: "number", min: 0.1, max: 2, step: 0.05, default: 0.5 },
    { key: "wind", label: "風", type: "number", min: -1, max: 1, step: 0.05, default: 0.35 },
    { key: "color", label: "色", type: "color", default: "#ffc4d6" },
  ],
  bounds: full,
};

export const bubblesMeta: PluginMeta = {
  id: "bubbles",
  name: "シャボン玉",
  description: "虹色に光るシャボン玉がゆらゆらと昇っていく。低音でふくらむ",
  category: "ambient",
  params: [
    { key: "amount", label: "数", type: "number", min: 5, max: 150, step: 5, default: 40 },
    { key: "size", label: "大きさ", type: "number", min: 0.3, max: 3, step: 0.05, default: 1 },
    { key: "speed", label: "昇る速さ", type: "number", min: 0.1, max: 2, step: 0.05, default: 0.4 },
    { key: "shine", label: "虹色の強さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.7 },
  ],
  bounds: full,
};

export const laserMeta: PluginMeta = {
  id: "laser",
  name: "レーザーショー",
  description: "画面下から伸びるレーザー光線。ビートごとに扇形・交差・スキャンへ切り替わる",
  category: "ambient",
  params: [
    { key: "count", label: "本数", type: "number", min: 2, max: 24, step: 1, default: 10 },
    {
      key: "colors",
      label: "色",
      type: "select",
      default: "green",
      options: [
        { value: "green", label: "グリーン" },
        { value: "red", label: "レッド" },
        { value: "blue", label: "ブルー" },
        { value: "rainbow", label: "レインボー" },
      ],
    },
    { key: "speed", label: "動きの速さ", type: "number", min: 0, max: 3, step: 0.05, default: 1 },
    { key: "spread", label: "広がり", type: "number", min: 0.1, max: 1, step: 0.05, default: 0.7 },
    { key: "every", label: "パターンが変わる拍数", type: "number", min: 1, max: 16, step: 1, default: 8 },
    { key: "haze", label: "スモーク（光の筋の太さ）", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
  ],
  bounds: full,
};

export const CATALOG: PluginMeta[] = [
  neonBarsMeta,
  lineSpectrumMeta,
  graphicEqMeta,
  pulseRingMeta,
  warpTunnelMeta,
  galaxyMeta,
  lightningMeta,
  lineScapeMeta,
  turntableMeta,
  radialBarsMeta,
  oscilloscopeMeta,
  spectrogramMeta,
  spaceMeta,
  starrySkyMeta,
  sparkleMeta,
  dropsMeta,
  mirrorBallMeta,
  atmosphereMeta,
  rainMeta,
  snowMeta,
  sakuraMeta,
  bubblesMeta,
  laserMeta,
];

export function findMeta(id: string): PluginMeta | undefined {
  return CATALOG.find((m) => m.id === id);
}
