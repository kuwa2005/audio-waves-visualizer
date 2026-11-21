import { BEAT_SENS_PARAM, type EffectMeta } from "./types";

/** エフェクトの一覧（メタ情報のみ）。描画コードは effects.ts（Worker 側） */

export const bloomMeta: EffectMeta = {
  id: "bloom",
  name: "ブルーム",
  description: "明るい部分から光があふれ出す。ビートで強まる",
  params: [
    { key: "strength", label: "強さ", type: "number", min: 0, max: 2, step: 0.05, default: 0.55 },
    { key: "radius", label: "広がり", type: "number", min: 1, max: 4, step: 1, default: 3 },
    { key: "beat", label: "ビートでの増幅", type: "number", min: 0, max: 2, step: 0.05, default: 0.8 },
  ],
};

export const rgbShiftMeta: EffectMeta = {
  id: "rgb-shift",
  name: "色収差（RGB ずれ）",
  description: "赤と青がずれて画面がにじむ。キックで大きくずれる",
  params: [
    { key: "amount", label: "ずれ幅", type: "number", min: 0, max: 40, step: 1, default: 14, unit: "px" },
    { key: "base", label: "常時のずれ", type: "number", min: 0, max: 1, step: 0.05, default: 0.1 },
    { key: "angle", label: "方向", type: "number", min: 0, max: 360, step: 5, default: 0, unit: "°" },
  ],
};

export const zoomBlurMeta: EffectMeta = {
  id: "zoom-blur",
  name: "ズームブラー",
  description: "中心から外へ放射状に流れる。キックで突き抜ける",
  params: [
    { key: "strength", label: "強さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "samples", label: "なめらかさ", type: "number", min: 2, max: 8, step: 1, default: 5 },
  ],
};

export const glitchMeta: EffectMeta = {
  id: "glitch",
  name: "グリッチ",
  description: "強い音で画面が横にずれて崩れる",
  params: [
    { key: "threshold", label: "反応のしきい値", type: "number", min: 0.1, max: 0.95, step: 0.05, default: 0.6 },
    { key: "intensity", label: "崩れ具合", type: "number", min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: "slices", label: "ずれる帯の数", type: "number", min: 2, max: 24, step: 1, default: 9 },
  ],
};

export const shakeMeta: EffectMeta = {
  id: "shake",
  name: "カメラシェイク",
  description: "キックで画面が揺れる",
  params: [
    { key: "amount", label: "揺れ幅", type: "number", min: 0, max: 60, step: 1, default: 18, unit: "px" },
    { key: "rotate", label: "回転の揺れ", type: "number", min: 0, max: 3, step: 0.1, default: 0.6, unit: "°" },
    { key: "zoom", label: "ズームの揺れ", type: "number", min: 0, max: 0.1, step: 0.005, default: 0.03 },
  ],
};

export const flashMeta: EffectMeta = {
  id: "flash",
  name: "フラッシュ",
  description: "ビートで画面が光る（光過敏に配慮し 1 秒に 3 回未満）",
  params: [
    { key: "strength", label: "明るさ", type: "number", min: 0, max: 0.8, step: 0.05, default: 0.35 },
    { key: "every", label: "何拍ごと", type: "number", min: 1, max: 8, step: 1, default: 4 },
    { key: "color", label: "色", type: "color", default: "#ffffff" },
  ],
};

export const vignetteMeta: EffectMeta = {
  id: "vignette",
  name: "ビネット",
  description: "画面の周辺を暗くして中央に視線を集める。低音で脈打つ",
  params: [
    { key: "strength", label: "強さ", type: "number", min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: "size", label: "明るい範囲", type: "number", min: 0.2, max: 1, step: 0.05, default: 0.55 },
    { key: "pulse", label: "低音で脈打つ", type: "number", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "color", label: "色", type: "color", default: "#000000" },
  ],
};

export const vhsMeta: EffectMeta = {
  id: "vhs",
  name: "VHS",
  description: "ビデオテープ風。走査線・ノイズ・色のにじみ・トラッキングの乱れ",
  params: [
    { key: "scanlines", label: "走査線", type: "number", min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: "noise", label: "ノイズ", type: "number", min: 0, max: 1, step: 0.05, default: 0.25 },
    { key: "bleed", label: "色のにじみ", type: "number", min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: "tracking", label: "トラッキングの乱れ", type: "number", min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: "osd", label: "「▶ PLAY」表示", type: "boolean", default: true },
  ],
};

export const kaleidoscopeMeta: EffectMeta = {
  id: "kaleidoscope",
  name: "万華鏡",
  description: "画面を鏡のように分割して並べる。ゆっくり回り、キックで回転が加速",
  params: [
    { key: "segments", label: "分割数", type: "number", min: 3, max: 16, step: 1, default: 8 },
    { key: "spin", label: "回転速度", type: "number", min: -1, max: 1, step: 0.05, default: 0.1 },
    { key: "zoom", label: "ズーム", type: "number", min: 1, max: 3, step: 0.05, default: 1 },
    { key: "mix", label: "元の映像との混ざり具合", type: "number", min: 0, max: 1, step: 0.05, default: 1 },
  ],
};

export const EFFECT_CATALOG: EffectMeta[] = [bloomMeta, rgbShiftMeta, zoomBlurMeta, glitchMeta, shakeMeta, flashMeta, vignetteMeta, vhsMeta, kaleidoscopeMeta];

// エフェクトには共通の「ビートへの感度」を先頭に付ける
for (const m of EFFECT_CATALOG) if (!m.params.some((d) => d.key === BEAT_SENS_PARAM.key)) m.params.unshift(BEAT_SENS_PARAM);

export function findEffectMeta(id: string): EffectMeta | undefined {
  return EFFECT_CATALOG.find((m) => m.id === id);
}

/** フラッシュの最小間隔（秒）。光過敏性発作の目安「1 秒に 3 回以下」を守る */
export const FLASH_MIN_INTERVAL = 0.34;
