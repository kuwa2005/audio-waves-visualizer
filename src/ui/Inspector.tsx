import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import { SUBTITLE_PARAMS, TITLE_PARAMS } from "../text/textCatalog";
import type { ParamDef } from "../plugins/types";
import { IDENTITY_TRANSFORM, SCALE_MAX, SCALE_MIN, type LayerTransform, type ParamValue } from "../engine/scene";
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
    case "text": {
      const v = typeof value === "string" ? value : def.default;
      const cls = "mt-1 w-full rounded-lg border border-line bg-raised px-2 py-1.5 text-sm";
      return (
        <label className="block text-sm">
          {def.label}
          {def.multiline ? (
            <textarea data-testid={`text-${def.key}`} rows={2} value={v} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
          ) : (
            <input data-testid={`text-${def.key}`} value={v} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
          )}
        </label>
      );
    }
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


/** 位置・大きさ（ビジュアライザー・タイトル・字幕で共通） */
function TransformControls({ id, transform }: { id: string; transform: LayerTransform }) {
  const setTransform = useStore((s) => s.setTransform);
  const layer = { id, transform };
  return (
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
  );
}

/** 選択中のレイヤーの設定。項目はプラグインのパラメータ定義から自動生成する */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedLayerId);
  const layer = useStore((s) => s.scene.visualizers.find((v) => v.id === selectedId));
  const setParam = useStore((s) => s.setParam);
  const effect = useStore((s) => s.scene.effects.find((e) => e.id === selectedId));
  const setEffectParam = useStore((s) => s.setEffectParam);
  const meta = layer ? findMeta(layer.pluginId) : undefined;

  const textLayer = useStore((s) => (s.selectedLayerId === "title" || s.selectedLayerId === "subtitles" ? s.scene[s.selectedLayerId] : null));
  const setTextParam = useStore((s) => s.setTextParam);
  if (textLayer) {
    const defs = textLayer.id === "title" ? TITLE_PARAMS : SUBTITLE_PARAMS;
    return (
      <div className="space-y-4" data-testid="inspector">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{textLayer.id === "title" ? "タイトル" : "字幕"}</h3>
          <p className="text-xs text-ink-muted">文字はいちばん手前に表示されます（エフェクトの影響を受けません）。</p>
        </div>
        <TransformControls id={textLayer.id} transform={textLayer.transform} />
        {defs.map((def) => (
          <Field key={def.key} def={def} value={textLayer.params[def.key]} onChange={(v) => setTextParam(textLayer.id, def.key, v)} />
        ))}
      </div>
    );
  }

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
      <TransformControls id={layer.id} transform={layer.transform} />
      {meta.params.map((def) => (
        <Field key={def.key} def={def} value={layer.params[def.key]} onChange={(v) => setParam(layer.id, def.key, v)} />
      ))}
    </div>
  );
}
