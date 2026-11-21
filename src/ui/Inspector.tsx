import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import type { ParamDef } from "../plugins/types";
import { IDENTITY_TRANSFORM, SCALE_MAX, SCALE_MIN, type ParamValue } from "../engine/scene";
import { useStore } from "../state/store";

function Field({ def, value, onChange }: { def: ParamDef; value: ParamValue | undefined; onChange: (v: ParamValue) => void }) {
  switch (def.type) {
    case "number": {
      const v = typeof value === "number" ? value : def.default;
      return (
        <label className="block text-sm">
          <span className="flex justify-between">
            {def.label}
            <span className="font-mono text-xs text-ink-muted">
              {Number.isInteger(def.step) ? v : v.toFixed(2)}
              {def.unit ?? ""}
            </span>
          </span>
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[var(--color-accent-from)]"
          />
        </label>
      );
    }
    case "color":
      return (
        <label className="flex items-center justify-between text-sm">
          {def.label}
          <input type="color" value={typeof value === "string" ? value : def.default} onChange={(e) => onChange(e.target.value)} className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent" />
        </label>
      );
    case "boolean":
      return (
        <label className="flex items-center justify-between text-sm">
          {def.label}
          <input type="checkbox" checked={typeof value === "boolean" ? value : def.default} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
    case "select":
      return (
        <label className="flex items-center justify-between text-sm">
          {def.label}
          <select value={typeof value === "string" ? value : def.default} onChange={(e) => onChange(e.target.value)} className="rounded border border-line bg-raised px-2 py-1">
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}

/** 選択中のレイヤーの設定。項目はプラグインのパラメータ定義から自動生成する */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedLayerId);
  const layer = useStore((s) => s.scene.visualizers.find((v) => v.id === selectedId));
  const setParam = useStore((s) => s.setParam);
  const setTransform = useStore((s) => s.setTransform);
  const effect = useStore((s) => s.scene.effects.find((e) => e.id === selectedId));
  const setEffectParam = useStore((s) => s.setEffectParam);
  const meta = layer ? findMeta(layer.pluginId) : undefined;

  if (effect) {
    const em = findEffectMeta(effect.pluginId);
    if (!em) return null;
    return (
      <div className="space-y-4" data-testid="inspector">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">✦ {em.name}</h3>
          <p className="text-xs text-ink-muted">{em.description}</p>
        </div>
        {em.params.map((def) => (
          <Field key={def.key} def={def} value={effect.params[def.key]} onChange={(v) => setEffectParam(effect.id, def.key, v)} />
        ))}
      </div>
    );
  }

  if (!layer || !meta) {
    return <p className="text-sm text-ink-muted">「ビジュアル」でレイヤーを選ぶと、ここで調整できます。</p>;
  }
  return (
    <div className="space-y-4" data-testid="inspector">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{meta.name}</h3>
        <p className="text-xs text-ink-muted">{meta.description}</p>
      </div>
      <section className="space-y-2 rounded-xl border border-line p-3" data-testid="transform-controls">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">位置・大きさ</h4>
          <button
            data-testid="transform-reset"
            onClick={() => setTransform(layer.id, { ...IDENTITY_TRANSFORM })}
            className="rounded px-2 py-0.5 text-xs text-ink-muted hover:bg-raised hover:text-ink"
          >
            リセット
          </button>
        </div>
        <p className="text-[11px] leading-4 text-ink-muted">プレビュー上でドラッグして移動、ホイールで拡大縮小、ダブルクリックで元に戻ります。</p>
        <Field
          def={{ key: "scale", label: "大きさ", type: "number", min: SCALE_MIN, max: SCALE_MAX, step: 0.01, default: 1 }}
          value={layer.transform.scale}
          onChange={(v) => setTransform(layer.id, { scale: Number(v) })}
        />
        <Field def={{ key: "x", label: "横位置", type: "number", min: -1, max: 1, step: 0.01, default: 0 }} value={layer.transform.x} onChange={(v) => setTransform(layer.id, { x: Number(v) })} />
        <Field def={{ key: "y", label: "縦位置", type: "number", min: -1, max: 1, step: 0.01, default: 0 }} value={layer.transform.y} onChange={(v) => setTransform(layer.id, { y: Number(v) })} />
      </section>
      {meta.params.map((def) => (
        <Field key={def.key} def={def} value={layer.params[def.key]} onChange={(v) => setParam(layer.id, def.key, v)} />
      ))}
    </div>
  );
}
