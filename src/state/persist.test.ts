import { describe, expect, it } from "vitest";
import { loadAutoDownload, loadSettings, loadTheme, sanitizeSettings, saveAutoDownload, saveSettings, saveTheme, serializeSettings, STORAGE_KEY } from "./persist";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("設定の保存と復元", () => {
  it("round-trips background, layers and effects", () => {
    const store = memory();
    saveSettings(
      {
        background: { dim: 0.6, zoomPunch: 0.2, scale: 1.8, panX: -0.4, panY: 0.3, fadeIn: 1.5, fadeOut: 2 },
        visualizers: [
          { id: "a", kind: "visualizer", pluginId: "neon-bars", enabled: false, opacity: 1, transform: { x: 0.1, y: -0.2, scale: 1.5 }, params: { bars: 64, mirror: false } },
        ],
        effects: [{ id: "b", kind: "effect", pluginId: "bloom", enabled: true, params: { strength: 1.2, beatSens: 1.8 } }],
      },
      store,
    );
    const s = loadSettings(store)!;
    expect(s.background).toEqual({ dim: 0.6, zoomPunch: 0.2, scale: 1.8, panX: -0.4, panY: 0.3, fadeIn: 1.5, fadeOut: 2 });
    expect(s.visualizers[0]).toMatchObject({ id: "a", pluginId: "neon-bars", enabled: false, transform: { x: 0.1, y: -0.2, scale: 1.5 } });
    expect(s.visualizers[0].params).toMatchObject({ bars: 64, mirror: false, height: 0.55 }); // 無い値は既定値
    expect(s.effects[0].params).toMatchObject({ strength: 1.2, beatSens: 1.8 });
  });

  it("drops unknown plugins, clamps values and fixes wrong types", () => {
    const s = sanitizeSettings({
      version: 1,
      background: { dim: 5, zoomPunch: "x", fadeIn: -3, scale: 10 },
      visualizers: [
        { id: "x", pluginId: "no-such-plugin", params: {} },
        { id: "y", pluginId: "pulse-ring", params: { radius: 99, color: "red", spikes: "many" }, transform: { scale: 100 } },
        { id: "y", pluginId: "pulse-ring", params: {} },
      ],
      effects: [{ pluginId: "flash", params: { every: 0, color: "#123456", beatSens: 9 } }, "garbage"],
    })!;
    expect(s.background).toEqual({ dim: 0.9, zoomPunch: 0, scale: 3, panX: 0, panY: 0, fadeIn: 0, fadeOut: 0 });
    expect(s.visualizers.map((v) => v.pluginId)).toEqual(["pulse-ring", "pulse-ring"]);
    expect(s.visualizers[0].params).toMatchObject({ radius: 0.45, color: "#22d3ee", spikes: 128 });
    expect(s.visualizers[0].transform.scale).toBe(4);
    expect(new Set(s.visualizers.map((v) => v.id)).size).toBe(2); // ID の重複を解消
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0].params).toMatchObject({ every: 1, color: "#123456", beatSens: 2 });
  });

  it("keeps negative zoom (zoom out) within -1..1", () => {
    const s = sanitizeSettings({ version: 1, background: { zoomPunch: -0.5 } })!;
    expect(s.background.zoomPunch).toBe(-0.5);
    expect(sanitizeSettings({ version: 1, background: { zoomPunch: -7 } })!.background.zoomPunch).toBe(-1);
  });

  it("ignores broken or foreign data", () => {
    const store = memory();
    store.setItem(STORAGE_KEY, "{not json");
    expect(loadSettings(store)).toBeNull();
    expect(sanitizeSettings({ version: 999 })).toBeNull();
    expect(sanitizeSettings(null)).toBeNull();
  });

  it("does not store media references", () => {
    const json = serializeSettings({
      background: { dim: 0.3, zoomPunch: 0.4, scale: 1, panX: 0, panY: 0, fadeIn: 0, fadeOut: 0 },
      visualizers: [],
      effects: [],
    });
    expect(json).not.toContain("images");
  });
});

describe("自動ダウンロードの設定", () => {
  it("defaults to yes and remembers no", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(loadAutoDownload(store)).toBe(true);
    saveAutoDownload(false, store);
    expect(loadAutoDownload(store)).toBe(false);
    saveAutoDownload(true, store);
    expect(loadAutoDownload(store)).toBe(true);
  });
});

describe("画面比率・種類ごとの設定値・配色", () => {
  it("round-trips aspect and per-plugin remembered params, dropping unknown kinds", () => {
    const store = memory();
    saveSettings(
      {
        aspect: "9:16",
        lastParams: { "v:neon-bars": { bars: 48 }, "fx:bloom": { strength: 99 }, "v:nope": { a: 1 }, "x:neon-bars": {} },
        background: { dim: 0.3, zoomPunch: 0, scale: 1, panX: 0, panY: 0, fadeIn: 0, fadeOut: 0 },
        visualizers: [],
        effects: [],
      },
      store,
    );
    const s = loadSettings(store)!;
    expect(s.aspect).toBe("9:16");
    expect(Object.keys(s.lastParams!).sort()).toEqual(["fx:bloom", "v:neon-bars"]);
    expect(s.lastParams!["v:neon-bars"].bars).toBe(48);
    // 範囲外は丸める
    expect(s.lastParams!["fx:bloom"].strength).toBeLessThan(99);
  });

  it("ignores an unknown aspect", () => {
    const s = sanitizeSettings({ version: 1, aspect: "4:3" })!;
    expect(s.aspect).toBeUndefined();
  });

  it("theme defaults to dark and remembers light", () => {
    const store = memory();
    expect(loadTheme(store)).toBe("dark");
    saveTheme("light", store);
    expect(loadTheme(store)).toBe("light");
  });
});

describe("既定値の改訂（暗さ・ビートでズームの既定を 0 に）", () => {
  it("replaces untouched old defaults but keeps user-changed values", () => {
    const old = sanitizeSettings({ version: 1, background: { dim: 0.35, zoomPunch: 0.4, scale: 1 } })!;
    expect(old.background.dim).toBe(0);
    expect(old.background.zoomPunch).toBe(0);
    const changed = sanitizeSettings({ version: 1, background: { dim: 0.5, zoomPunch: -0.3 } })!;
    expect(changed.background).toMatchObject({ dim: 0.5, zoomPunch: -0.3 });
    // 新しい形式で保存した 0.35 は利用者が選んだ値なので残す
    const kept = sanitizeSettings({ version: 1, defaultsRev: 2, background: { dim: 0.35, zoomPunch: 0.4 } })!;
    expect(kept.background).toMatchObject({ dim: 0.35, zoomPunch: 0.4 });
  });

  it("round-trips per-kind opacity", () => {
    const store = memory();
    saveSettings({ lastOpacity: { "v:neon-bars": 0.4, "fx:bloom": 2, "v:nope": 0.5 }, background: { dim: 0, zoomPunch: 0, scale: 1, panX: 0, panY: 0, fadeIn: 0, fadeOut: 0 }, visualizers: [], effects: [] }, store);
    expect(loadSettings(store)!.lastOpacity).toEqual({ "v:neon-bars": 0.4, "fx:bloom": 1 });
  });
});
