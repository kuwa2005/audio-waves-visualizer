import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

const st = () => useStore.getState();
const ids = () => st().scene.visualizers.map((v) => v.pluginId);

describe("レイヤーの並べ替え・初期値に戻す・種類ごとの記憶", () => {
  beforeEach(() => {
    st().resetSettings();
    expect(st().scene.visualizers).toEqual([]); // 初期状態のレイヤーは空
    st().addVisualizer("neon-bars");
  });

  it("moves a visualizer layer and clamps the destination", () => {
    st().addVisualizer("pulse-ring");
    st().addVisualizer("warp-tunnel");
    expect(ids()).toEqual(["neon-bars", "pulse-ring", "warp-tunnel"]);
    const galaxy = st().scene.visualizers[2].id;
    st().moveVisualizer(galaxy, 0);
    expect(ids()).toEqual(["warp-tunnel", "neon-bars", "pulse-ring"]);
    st().moveVisualizer(galaxy, 99);
    expect(ids()).toEqual(["neon-bars", "pulse-ring", "warp-tunnel"]);
  });

  it("a locked layer cannot be removed until unlocked", () => {
    const id = st().scene.visualizers[0].id;
    st().toggleLock(id);
    st().removeVisualizer(id);
    expect(st().scene.visualizers).toHaveLength(1);
    st().toggleLock(id);
    st().removeVisualizer(id);
    expect(st().scene.visualizers).toHaveLength(0);
  });

  it("re-adding remembers position and size per kind", () => {
    const id = st().scene.visualizers[0].id;
    st().setTransform(id, { x: 0.4, scale: 1.5 });
    st().removeVisualizer(id);
    st().addVisualizer("neon-bars");
    expect(st().scene.visualizers[0].transform).toMatchObject({ x: 0.4, scale: 1.5 });
  });

  it("opacity is clamped and remembered per kind; text layers can be locked", () => {
    const id = st().scene.visualizers[0].id;
    st().setOpacity(id, 0.3);
    st().removeVisualizer(id);
    st().addVisualizer("neon-bars");
    expect(st().scene.visualizers[0].opacity).toBeCloseTo(0.3);
    st().setOpacity("subtitles", 5);
    expect(st().scene.subtitles.opacity).toBe(1);
    st().toggleLock("title");
    expect(st().scene.title.locked).toBe(true);
    st().toggleLock("title");
  });

  it("moves an effect", () => {
    st().addEffect("bloom");
    st().addEffect("vignette");
    const [a, b] = st().scene.effects;
    st().moveEffect(b.id, 0);
    expect(st().scene.effects.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  it("resets params but keeps the transform", () => {
    const id = st().scene.visualizers[0].id;
    st().setParam(id, "bars", 30);
    st().setTransform(id, { x: 0.3 });
    st().resetLayerParams(id);
    const l = st().scene.visualizers[0];
    expect(l.params.bars).not.toBe(30);
    expect(l.transform.x).toBeCloseTo(0.3);
  });

  it("keeps the typed text when resetting a text layer", () => {
    st().setTextParam("title", "title", "My Song");
    st().setTextParam("title", "size", 0.15);
    st().resetLayerParams("title");
    expect(st().scene.title.params.title).toBe("My Song");
    expect(st().scene.title.params.size).not.toBe(0.15);
  });

  it("re-adding a plugin uses the last params of that kind", () => {
    st().addVisualizer("pulse-ring");
    const l = st().scene.visualizers.find((v) => v.pluginId === "pulse-ring")!;
    st().setParam(l.id, "light", 25);
    st().removeVisualizer(l.id);
    st().addVisualizer("pulse-ring");
    expect(st().scene.visualizers.find((v) => v.pluginId === "pulse-ring")!.params.light).toBe(25);

    st().addEffect("bloom");
    const e = st().scene.effects[0];
    st().setEffectParam(e.id, "beatSens", 1.6);
    st().removeEffect(e.id);
    st().addEffect("bloom");
    expect(st().scene.effects[0].params.beatSens).toBe(1.6);

    // 全体の初期化で記憶も消える
    st().resetSettings();
    st().addVisualizer("pulse-ring");
    expect(st().scene.visualizers.find((v) => v.pluginId === "pulse-ring")!.params.light).not.toBe(25);
  });
});
