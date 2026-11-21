/**
 * 設定の保存と復元（ブラウザのローカルストレージ。端末の中だけに保存され、サーバーへは送らない）。
 *
 * 保存するもの: 素材の調整（暗さ・ビートでズーム・フェードイン・フェードアウト）、
 *               スペアナ・環境演出のレイヤー、エフェクト（種類・設定値・表示・位置と大きさ・順番）
 * 保存しないもの: 音声・画像・字幕などの素材そのもの
 *
 * 読み込み時は中身を検証し、知らない種類は捨て、値は範囲内に収める（壊れたデータでも画面が壊れない）。
 */
import {
  IDENTITY_TRANSFORM,
  SCALE_MAX,
  SCALE_MIN,
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

export type SavedSettings = {
  background: Pick<BackgroundLayer, "dim" | "zoomPunch" | "fadeIn" | "fadeOut">;
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

  return {
    background: {
      dim: numOr(bg.dim, 0.35, 0, 0.9),
      zoomPunch: numOr(bg.zoomPunch, 0.4, -1, 1),
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
    background: { dim: s.background.dim, zoomPunch: s.background.zoomPunch, fadeIn: s.background.fadeIn, fadeOut: s.background.fadeOut },
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
