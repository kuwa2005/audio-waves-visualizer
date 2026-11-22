/**
 * 配色プリセット。複数の色を使うプラグインは、メタ情報の paletteKeys に
 * 「プリセットの何番目の色をどの色の項目に入れるか」の順で色の項目を並べる。
 */
export type ColorPreset = { id: string; name: string; colors: [string, string, string] };

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "neon", name: "ネオン", colors: ["#9b5cff", "#22e1ff", "#ff4fd8"] },
  { id: "cyber", name: "サイバー", colors: ["#00f0ff", "#ff2a6d", "#7b2cff"] },
  { id: "vapor", name: "ヴェイパーウェイブ", colors: ["#ff71ce", "#01cdfe", "#b967ff"] },
  { id: "sunset", name: "サンセット", colors: ["#ff6b35", "#ff3d7f", "#ffd23f"] },
  { id: "fire", name: "ファイア", colors: ["#ff2a00", "#ffb000", "#fff07a"] },
  { id: "ocean", name: "オーシャン", colors: ["#0077b6", "#00d4ff", "#90e0ef"] },
  { id: "forest", name: "フォレスト", colors: ["#2dc653", "#c7f464", "#00a19d"] },
  { id: "sakura", name: "桜", colors: ["#ff8fab", "#ffd1dc", "#fff0f5"] },
  { id: "gold", name: "ゴールド", colors: ["#ffb300", "#fff3c4", "#ff8a3d"] },
  { id: "mono", name: "モノクロ", colors: ["#ffffff", "#9aa1b4", "#d6d9e0"] },
];

/** プリセットを、プラグインの色の項目（paletteKeys の順）に割り当てた値 */
export function presetParams(preset: ColorPreset, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  keys.forEach((k, i) => (out[k] = preset.colors[i % preset.colors.length]));
  return out;
}

/** 今の値がどのプリセットと一致するか（一致しなければ null） */
export function matchingPreset(params: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const p of COLOR_PRESETS) {
    const want = presetParams(p, keys);
    if (keys.every((k) => typeof params[k] === "string" && (params[k] as string).toLowerCase() === want[k])) return p.id;
  }
  return null;
}
