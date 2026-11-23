/**
 * 設定の保存と復元（ブラウザのローカルストレージ。端末の中だけに保存され、サーバーへは送らない）。
 *
 * 保存するもの: 画面比率、素材の調整（暗さ・ビートでズーム・背景の倍率と位置・フェードイン・フェードアウト）、
 *               スペアナ・環境演出・エフェクトの種類ごとの最後の設定値と位置・大きさ（次に追加したときに使う）
 * 再読み込みしたときのレイヤーは空から始める（レイヤーの一覧そのものは復元しない）
 * 保存しないもの: 音声・画像・字幕などの素材そのもの
 *
 * 読み込み時は中身を検証し、知らない種類は捨て、値は範囲内に収める（壊れたデータでも画面が壊れない）。
 */
import {
  IDENTITY_TRANSFORM,
  SCALE_MAX,
  SCALE_MIN,
  type Aspect,
  type BackgroundLayer,
  type EffectLayer,
  type LayerTransform,
  type ParamValues,
  type VisualizerLayer,
} from "../engine/scene";
import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import { defaultParams, type ParamDef } from "../plugins/types";

export const STORAGE_KEY = "awv.settings.v1";
const VERSION = 1;
/**
 * 既定値の改訂番号。2 で「暗さ」と「ビートでズーム」の既定を 0 にした。
 * それより前の保存データで旧既定値のままの項目は、新しい既定値に置き換える（利用者が変えた値は残す）。
 */
const DEFAULTS_REV = 2;
const OLD_DEFAULTS = { dim: 0.35, zoomPunch: 0.4 };

/** 種類ごとの最後の設定値のキー（スペアナ等は "v:ID"、エフェクトは "fx:ID"） */
export const memoryKey = (kind: "visualizer" | "effect", pluginId: string) => `${kind === "effect" ? "fx" : "v"}:${pluginId}`;

export type SavedSettings = {
  aspect?: Aspect;
  /** 種類ごとの最後の設定値 */
  lastParams?: Record<string, ParamValues>;
  /** 種類ごとの最後の位置・大きさ（スペアナ・環境演出のみ） */
  lastTransforms?: Record<string, LayerTransform>;
  /** 種類ごとの最後の不透明度 */
  lastOpacity?: Record<string, number>;
  background: Pick<BackgroundLayer, "dim" | "zoomPunch" | "scale" | "panX" | "panY" | "fadeIn" | "fadeOut">;
  visualizers: VisualizerLayer[];
  effects: EffectLayer[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOr = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);

/** パラメータ定義に合う値だけを残し、範囲に収める（無い・型違いは既定値） */
export function sanitizeParams(defs: ParamDef[], raw: unknown): ParamValues {
  const out = defaultParams({ params: defs });
  if (!isObj(raw)) return out;
  for (const d of defs) {
    const v = raw[d.key];
    switch (d.type) {
      case "number":
        if (typeof v === "number" && Number.isFinite(v)) out[d.key] = clamp(v, d.min, d.max);
        break;
      case "boolean":
        if (typeof v === "boolean") out[d.key] = v;
        break;
      case "color":
        if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) out[d.key] = v;
        break;
      case "select":
        if (typeof v === "string" && d.options.some((o) => o.value === v)) out[d.key] = v;
        break;
      case "text":
        if (typeof v === "string") out[d.key] = v.slice(0, 500);
        break;
    }
  }
  return out;
}

function sanitizeTransform(raw: unknown): LayerTransform {
  if (!isObj(raw)) return { ...IDENTITY_TRANSFORM };
  return {
    x: numOr(raw.x, 0, -1, 1),
    y: numOr(raw.y, 0, -1, 1),
    scale: numOr(raw.scale, 1, SCALE_MIN, SCALE_MAX),
  };
}

/** 保存データを検証して、使える形に直す。使えなければ null */
export function sanitizeSettings(raw: unknown): SavedSettings | null {
  if (!isObj(raw) || raw.version !== VERSION) return null;
  const bg = isObj(raw.background) ? raw.background : {};
  const ids = new Set<string>();
  const uniqueId = (v: unknown, prefix: string) => {
    let id = typeof v === "string" && v ? v.slice(0, 64) : "";
    while (!id || ids.has(id)) id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    ids.add(id);
    return id;
  };

  const visualizers: VisualizerLayer[] = [];
  for (const v of Array.isArray(raw.visualizers) ? raw.visualizers.slice(0, 64) : []) {
    if (!isObj(v) || typeof v.pluginId !== "string") continue;
    const meta = findMeta(v.pluginId);
    if (!meta) continue; // 知らない種類（将来・過去の版のもの）は捨てる
    visualizers.push({
      id: uniqueId(v.id, "layer"),
      kind: "visualizer",
      pluginId: meta.id,
      enabled: v.enabled !== false,
      opacity: numOr(v.opacity, 1, 0, 1),
      transform: sanitizeTransform(v.transform),
      params: sanitizeParams(meta.params, v.params),
    });
  }

  const effects: EffectLayer[] = [];
  for (const e of Array.isArray(raw.effects) ? raw.effects.slice(0, 32) : []) {
    if (!isObj(e) || typeof e.pluginId !== "string") continue;
    const meta = findEffectMeta(e.pluginId);
    if (!meta) continue;
    effects.push({ id: uniqueId(e.id, "layer"), kind: "effect", pluginId: meta.id, enabled: e.enabled !== false, params: sanitizeParams(meta.params, e.params) });
  }

  const lastParams: Record<string, ParamValues> = {};
  if (isObj(raw.lastParams)) {
    for (const [key, val] of Object.entries(raw.lastParams).slice(0, 128)) {
      const [kind, id] = key.split(":", 2);
      const m = kind === "fx" ? findEffectMeta(id ?? "") : kind === "v" ? findMeta(id ?? "") : undefined;
      if (m) lastParams[key] = sanitizeParams(m.params, val);
    }
  }
  const lastTransforms: Record<string, LayerTransform> = {};
  if (isObj(raw.lastTransforms)) {
    for (const [key, val] of Object.entries(raw.lastTransforms).slice(0, 128)) {
      const [kind, id] = key.split(":", 2);
      if (kind === "v" && findMeta(id ?? "")) lastTransforms[key] = sanitizeTransform(val);
    }
  }
  const lastOpacity: Record<string, number> = {};
  if (isObj(raw.lastOpacity)) {
    for (const [key, val] of Object.entries(raw.lastOpacity).slice(0, 128)) {
      const [kind, id] = key.split(":", 2);
      const known = kind === "fx" ? findEffectMeta(id ?? "") : kind === "v" ? findMeta(id ?? "") : undefined;
      if (known && typeof val === "number" && Number.isFinite(val)) lastOpacity[key] = clamp(val, 0, 1);
    }
  }
  const oldDefaults = raw.defaultsRev !== DEFAULTS_REV;
  const migrate = (v: unknown, key: keyof typeof OLD_DEFAULTS) => (oldDefaults && v === OLD_DEFAULTS[key] ? 0 : v);
  const aspect = (["16:9", "9:16", "1:1"] as const).find((a) => a === raw.aspect);

  return {
    ...(aspect ? { aspect } : {}),
    lastParams,
    lastTransforms,
    lastOpacity,
    background: {
      dim: numOr(migrate(bg.dim, "dim"), 0, 0, 0.9),
      zoomPunch: numOr(migrate(bg.zoomPunch, "zoomPunch"), 0, -1, 1),
      scale: numOr(bg.scale, 1, 0.5, 3),
      panX: numOr(bg.panX, 0, -1, 1),
      panY: numOr(bg.panY, 0, -1, 1),
      fadeIn: numOr(bg.fadeIn, 0, 0, 5),
      fadeOut: numOr(bg.fadeOut, 0, 0, 5),
    },
    visualizers,
    effects,
  };
}

/** ローカルストレージから読み込む（無い・壊れている・使えない環境なら null） */
export function loadSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): SavedSettings | null {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? sanitizeSettings(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function serializeSettings(s: SavedSettings): string {
  return JSON.stringify({
    version: VERSION,
    aspect: s.aspect,
    lastParams: s.lastParams ?? {},
    lastTransforms: s.lastTransforms ?? {},
    lastOpacity: s.lastOpacity ?? {},
    defaultsRev: DEFAULTS_REV,
    background: {
      dim: s.background.dim,
      zoomPunch: s.background.zoomPunch,
      scale: s.background.scale,
      panX: s.background.panX,
      panY: s.background.panY,
      fadeIn: s.background.fadeIn,
      fadeOut: s.background.fadeOut,
    },
    visualizers: s.visualizers.map(({ id, pluginId, enabled, opacity, transform, params }) => ({ id, pluginId, enabled, opacity, transform, params })),
    effects: s.effects.map(({ id, pluginId, enabled, params }) => ({ id, pluginId, enabled, params })),
  });
}

export function saveSettings(s: SavedSettings, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, serializeSettings(s));
  } catch {
    /* 容量超過・プライベートモード等では保存しない */
  }
}

export function clearSettings(storage: Pick<Storage, "removeItem"> | null = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* 無視 */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const AUTO_DOWNLOAD_KEY = "awv.autoDownload";

/** 書き出し後の自動ダウンロード（既定は「はい」） */
export function loadAutoDownload(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(AUTO_DOWNLOAD_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveAutoDownload(on: boolean, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(AUTO_DOWNLOAD_KEY, on ? "1" : "0");
  } catch {
    /* 保存できなくても動作は続ける */
  }
}

const THEME_KEY = "awv.theme";
export type Theme = "dark" | "light";

/** 画面の配色（既定はダーク） */
export function loadTheme(storage: Pick<Storage, "getItem"> | null = safeStorage()): Theme {
  try {
    return storage?.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: Theme, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    /* 保存できなくても切り替えは効く */
  }
}

const HUD_KEY = "awv.perfOpen";

/** 性能表示（FPS など）を開いているか（既定は閉じる） */
export function loadPerfOpen(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(HUD_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePerfOpen(open: boolean, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(HUD_KEY, open ? "1" : "0");
  } catch {
    /* 無視 */
  }
}

const REPEAT_KEY = "awv.repeat";

/** リピート再生（既定はしない） */
export function loadRepeat(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(REPEAT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveRepeat(on: boolean, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(REPEAT_KEY, on ? "1" : "0");
  } catch {
    /* 無視 */
  }
}
