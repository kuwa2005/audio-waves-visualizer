import { findMeta } from "../plugins/catalog";
import type { ParamDef } from "../plugins/types";
import type { ParamValue } from "../engine/scene";
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
  const meta = layer ? findMeta(layer.pluginId) : undefined;

  if (!layer || !meta) {
    return <p className="text-sm text-ink-muted">「ビジュアル」でレイヤーを選ぶと、ここで調整できます。</p>;
  }
  return (
    <div className="space-y-4" data-testid="inspector">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{meta.name}</h3>
        <p className="text-xs text-ink-muted">{meta.description}</p>
      </div>
      {meta.params.map((def) => (
        <Field key={def.key} def={def} value={layer.params[def.key]} onChange={(v) => setParam(layer.id, def.key, v)} />
      ))}
    </div>
  );
}
