import { describe, expect, it } from "vitest";
import { loadSettings, sanitizeSettings, saveSettings, serializeSettings, STORAGE_KEY } from "./persist";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("設定の保存と復元", () => {
  it("round-trips background, layers and effects", () => {
    const store = memory();
    saveSettings(
      {
        background: { dim: 0.6, zoomPunch: 0.2, fadeIn: 1.5, fadeOut: 2 },
        visualizers: [
          { id: "a", kind: "visualizer", pluginId: "neon-bars", enabled: false, opacity: 1, transform: { x: 0.1, y: -0.2, scale: 1.5 }, params: { bars: 64, mirror: false } },
        ],
        effects: [{ id: "b", kind: "effect", pluginId: "bloom", enabled: true, params: { strength: 1.2, beatSens: 1.8 } }],
      },
      store,
    );
    const s = loadSettings(store)!;
    expect(s.background).toEqual({ dim: 0.6, zoomPunch: 0.2, fadeIn: 1.5, fadeOut: 2 });
    expect(s.visualizers[0]).toMatchObject({ id: "a", pluginId: "neon-bars", enabled: false, transform: { x: 0.1, y: -0.2, scale: 1.5 } });
    expect(s.visualizers[0].params).toMatchObject({ bars: 64, mirror: false, height: 0.55 }); // 無い値は既定値
    expect(s.effects[0].params).toMatchObject({ strength: 1.2, beatSens: 1.8 });
  });

  it("drops unknown plugins, clamps values and fixes wrong types", () => {
    const s = sanitizeSettings({
      version: 1,
      background: { dim: 5, zoomPunch: "x", fadeIn: -3 },
      visualizers: [
        { id: "x", pluginId: "no-such-plugin", params: {} },
        { id: "y", pluginId: "pulse-ring", params: { radius: 99, color: "red", spikes: "many" }, transform: { scale: 100 } },
        { id: "y", pluginId: "pulse-ring", params: {} },
      ],
      effects: [{ pluginId: "flash", params: { every: 0, color: "#123456", beatSens: 9 } }, "garbage"],
    })!;
    expect(s.background).toEqual({ dim: 0.9, zoomPunch: 0.4, fadeIn: 0, fadeOut: 0 });
    expect(s.visualizers.map((v) => v.pluginId)).toEqual(["pulse-ring", "pulse-ring"]);
    expect(s.visualizers[0].params).toMatchObject({ radius: 0.45, color: "#22d3ee", spikes: 128 });
    expect(s.visualizers[0].transform.scale).toBe(4);
    expect(new Set(s.visualizers.map((v) => v.id)).size).toBe(2); // ID の重複を解消
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0].params).toMatchObject({ every: 1, color: "#123456", beatSens: 2 });
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
      background: { dim: 0.3, zoomPunch: 0.4, fadeIn: 0, fadeOut: 0 },
      visualizers: [],
      effects: [],
    });
    expect(json).not.toContain("images");
  });
});
