import { findMeta } from "../plugins/catalog";
import { findEffectMeta } from "../plugins/effectCatalog";
import { matchingTextPreset, SUBTITLE_PARAMS, TEXT_COLOR_PRESETS, textPresetParams, TITLE_PARAMS } from "../text/textCatalog";
import { COLOR_PRESETS, matchingPreset, presetParams } from "../plugins/palettes";
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
            data-default={def.default}
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
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="shrink-0 whitespace-nowrap">{def.label}</span>
          <select value={typeof value === "string" ? value : def.default} onChange={(e) => onChange(e.target.value)} className="min-w-0 max-w-[65%] truncate rounded border border-line bg-raised px-2 py-1">
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


/** 配色プリセット: 押すと色の項目がまとめて切り替わる */
function PalettePicker({ layerId, keys, params }: { layerId: string; keys: string[]; params: Record<string, unknown> }) {
  const setParams = useStore((s) => s.setParams);
  const current = matchingPreset(params, keys);
  return (
    <section className="space-y-2 rounded-xl border border-line p-3" data-testid="palette-picker">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">配色プリセット</h4>
      <div className="grid grid-cols-5 gap-1.5">
        {COLOR_PRESETS.map((p) => {
          const cols = keys.map((_, i) => p.colors[i % p.colors.length]);
          const on = current === p.id;
          return (
            <button
              key={p.id}
              data-testid={`palette-${p.id}`}
              aria-pressed={on}
              title={p.name}
              aria-label={`配色: ${p.name}`}
              onClick={() => setParams(layerId, presetParams(p, keys))}
              className={`flex h-7 overflow-hidden rounded-md border transition ${on ? "border-accent-to ring-2 ring-accent-to/60" : "border-line hover:border-ink-muted"}`}
            >
              {cols.map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ background: c }} />
              ))}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-muted" data-testid="palette-name">
        {current ? `選択中: ${COLOR_PRESETS.find((p) => p.id === current)!.name}` : "下の色の項目で個別に変更することもできます"}
      </p>
    </section>
  );
}

/** 文字の配色プリセット: 見本の文字で、文字色・縁取り・光彩・カラオケの色をまとめて切り替える */
function TextPalettePicker({ id, defs, params }: { id: "title" | "subtitles"; defs: ParamDef[]; params: Record<string, ParamValue> }) {
  const setTextParams = useStore((s) => s.setTextParams);
  const current = matchingTextPreset(params, defs);
  return (
    <section className="space-y-2 rounded-xl border border-line p-3" data-testid="text-palette-picker">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">配色プリセット</h4>
      <div className="grid grid-cols-5 gap-1.5">
        {TEXT_COLOR_PRESETS.map((p) => {
          const on = current === p.id;
          const o = p.outlineColor;
          const shadow = [`-1px -1px 0 ${o}`, `1px -1px 0 ${o}`, `-1px 1px 0 ${o}`, `1px 1px 0 ${o}`, ...(p.glow > 0 ? [`0 0 6px ${p.glowColor}`, `0 0 10px ${p.glowColor}`] : [])].join(",");
          return (
            <button
              key={p.id}
              data-testid={`text-palette-${p.id}`}
              aria-pressed={on}
              title={p.name}
              aria-label={`文字の配色: ${p.name}`}
              onClick={() => setTextParams(id, textPresetParams(p, defs))}
              className={`flex h-8 items-center justify-center rounded-md border bg-[#3a3f4d] text-sm font-bold transition ${on ? "border-accent-to ring-2 ring-accent-to/60" : "border-line hover:border-ink-muted"}`}
              style={{ color: p.color, textShadow: shadow }}
            >
              あ<span style={{ color: id === "subtitles" ? p.highlight : p.color }}>A</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-muted" data-testid="text-palette-name">
        {current ? `選択中: ${TEXT_COLOR_PRESETS.find((p) => p.id === current)!.name}` : "下の色の項目で個別に変更することもできます"}
      </p>
    </section>
  );
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

/** 見出し（名前・説明）と「初期値に戻す」ボタン */
function Header({ layerId, title, description }: { layerId: string; title: string; description: string }) {
  const resetLayerParams = useStore((s) => s.resetLayerParams);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <button
          data-testid="params-reset"
          onClick={() => resetLayerParams(layerId)}
          className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-ink-muted hover:border-accent-from hover:text-ink"
          title="このレイヤーの設定値を初期値に戻します（位置・大きさはそのまま）"
        >
          ↺ 初期値に戻す
        </button>
      </div>
      <p className="text-xs text-ink-muted">{description}</p>
    </div>
  );
}

/**
 * 透明度（0% = そのまま、100% = 見えない）。内部は不透明度 opacity = 1 - 透明度。
 * エフェクトでは「かける前の絵」と混ぜる割合になる
 */
function OpacityField({ id, opacity, effect }: { id: string; opacity: number | undefined; effect?: boolean }) {
  const setOpacity = useStore((s) => s.setOpacity);
  const transparency = Math.round((1 - (opacity ?? 1)) * 100);
  return (
    <div data-testid="opacity-field">
      <Field
        def={{ key: "transparency", label: effect ? "透明度（効きを弱める）" : "透明度", type: "number", min: 0, max: 100, step: 1, default: 0, unit: "%" }}
        value={transparency}
        onChange={(v) => setOpacity(id, 1 - Number(v) / 100)}
      />
    </div>
  );
}

function LockedNote({ text }: { text: string }) {
  return (
    <p data-testid="locked-note" className="rounded-lg bg-warn/10 px-3 py-1.5 text-xs text-warn">
      🔒 固定中: {text}
    </p>
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
        <Header
          layerId={textLayer.id}
          title={textLayer.id === "title" ? "タイトル" : "字幕"}
          description="文字はいちばん手前に表示されます（エフェクトの影響を受けません）。初期値に戻しても、入力した文字はそのままです。"
        />
        {textLayer.locked && <LockedNote text={`プレビュー上でのクリック・移動・拡大縮小はできません${textLayer.id === "subtitles" ? "（字幕を外すこともできません）" : ""}。ここでの調整はできます。`} />}
        <OpacityField id={textLayer.id} opacity={textLayer.opacity} />
        <TextPalettePicker id={textLayer.id} defs={defs} params={textLayer.params} />
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
        <Header layerId={effect.id} title={`✦ ${em.name}`} description={em.description} />
        {effect.locked && <LockedNote text="削除できません（ここでの調整はできます）。" />}
        <OpacityField id={effect.id} opacity={effect.opacity} effect />
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
      <Header layerId={layer.id} title={meta.name} description={meta.description} />
      {layer.locked && <LockedNote text="削除と、プレビュー上でのクリック・移動・拡大縮小はできません（ここでの調整はできます）。" />}
      <OpacityField id={layer.id} opacity={layer.opacity} />
      {meta.paletteKeys && <PalettePicker layerId={layer.id} keys={meta.paletteKeys} params={layer.params} />}
      <TransformControls id={layer.id} transform={layer.transform} />
      {meta.params.map((def) => (
        <Field key={def.key} def={def} value={layer.params[def.key]} onChange={(v) => setParam(layer.id, def.key, v)} />
      ))}
    </div>
  );
}
