import { CATALOG, findMeta } from "../plugins/catalog";
import { EFFECT_CATALOG, findEffectMeta } from "../plugins/effectCatalog";
import { useStore } from "../state/store";

type CardProps = {
  testId: string;
  icon: string;
  name: string;
  description: string;
  /** 使用中の数 */
  used: number;
  compact?: boolean;
  onToggle(): void;
  onAddAnother(): void;
};

/**
 * ギャラリーのカード。押すと追加、もう一度押すと外す（試しに付けて、その場で外せる）。
 * 同じ種類を重ねたいときは右上の「＋」で追加する。
 */
function GalleryCard({ testId, icon, name, description, used, compact, onToggle, onAddAnother }: CardProps) {
  const on = used > 0;
  return (
    <div className="relative">
      <button
        data-testid={testId}
        aria-pressed={on}
        onClick={onToggle}
        title={on ? `${description}\n（もう一度押すと外します）` : description}
        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
          on ? "border-accent-to bg-accent-to/10 ring-1 ring-accent-to/50" : "border-line bg-raised/40 hover:border-accent-from hover:bg-raised"
        }`}
      >
        <span className="flex items-center gap-1.5 pr-6 text-sm font-medium">
          <span aria-hidden>{on ? "✓" : icon}</span>
          <span className="truncate">{name}</span>
          {used > 1 && <span className="rounded bg-accent-to/20 px-1 text-[10px]">×{used}</span>}
        </span>
        {!compact && <span className="mt-0.5 block text-xs text-ink-muted">{on ? "使用中 ・ 押すと外す" : description}</span>}
        {compact && on && <span className="block text-[10px] text-accent-to">使用中 ・ 押すと外す</span>}
      </button>
      {on && (
        <button
          data-testid={`${testId}-another`}
          onClick={onAddAnother}
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-raised text-xs text-ink-muted hover:text-ink"
          title="同じものをもう 1 つ追加"
          aria-label={`${name}をもう 1 つ追加`}
        >
          ＋
        </button>
      )}
    </div>
  );
}

/** 手順2: ビジュアル。使用中のレイヤー一覧と、押すたびに追加・削除できるギャラリー */
export function VisualPanel() {
  const layers = useStore((s) => s.scene.visualizers);
  const effects = useStore((s) => s.scene.effects);
  const selected = useStore((s) => s.selectedLayerId);
  const { selectLayer, toggleVisualizer, removeVisualizer, addVisualizer, addEffect, removeEffect, toggleEffect } = useStore.getState();

  const visCount = (id: string) => layers.filter((l) => l.pluginId === id).length;
  const fxCount = (id: string) => effects.filter((l) => l.pluginId === id).length;
  /** 押したら追加、使用中なら最後に追加したものを外す */
  const toggleVis = (id: string) => {
    const last = [...layers].reverse().find((l) => l.pluginId === id);
    if (last) removeVisualizer(last.id);
    else addVisualizer(id);
  };
  const toggleFx = (id: string) => {
    const last = [...effects].reverse().find((l) => l.pluginId === id);
    if (last) removeEffect(last.id);
    else addEffect(id);
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">使用中のレイヤー（上ほど手前）</h3>
        {layers.length === 0 && effects.length === 0 && <p className="text-sm text-ink-muted">下のギャラリーから選んでください。</p>}
        <ul className="space-y-1" data-testid="layer-list">
          {[...layers].reverse().map((l) => (
            <li
              key={l.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected === l.id ? "bg-raised ring-1 ring-accent-from" : "hover:bg-raised/60"}`}
            >
              <input type="checkbox" checked={l.enabled} onChange={() => toggleVisualizer(l.id)} aria-label="表示" />
              <button className="flex-1 truncate text-left" onClick={() => selectLayer(l.id)}>
                {findMeta(l.pluginId)?.name ?? l.pluginId}
              </button>
              <button className="text-xs text-ink-muted hover:text-bad" onClick={() => removeVisualizer(l.id)} aria-label="削除">
                ✕
              </button>
            </li>
          ))}
        </ul>
        <ul className={`space-y-1 ${effects.length ? "mt-2 border-t border-line pt-2" : ""}`} data-testid="effect-list">
          {effects.map((l) => (
            <li
              key={l.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected === l.id ? "bg-raised ring-1 ring-accent-to" : "hover:bg-raised/60"}`}
            >
              <input type="checkbox" checked={l.enabled} onChange={() => toggleEffect(l.id)} aria-label="有効" />
              <button className="flex-1 truncate text-left" onClick={() => selectLayer(l.id)}>
                ✦ {findEffectMeta(l.pluginId)?.name ?? l.pluginId}
              </button>
              <button className="text-xs text-ink-muted hover:text-bad" onClick={() => removeEffect(l.id)} aria-label="削除">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-lg bg-raised/60 px-3 py-2 text-xs leading-5 text-ink-muted">
        カードを押すと追加、もう一度押すと外れます。気軽に試してください。設定はこのブラウザに自動で保存され、次に開いたときに復元されます。
      </p>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">スペクトラム</h3>
        <div className="grid gap-2">
          {CATALOG.filter((m) => m.category !== "ambient").map((m) => (
            <GalleryCard
              key={m.id}
              testId={`add-${m.id}`}
              icon="＋"
              name={m.name}
              description={m.description}
              used={visCount(m.id)}
              onToggle={() => toggleVis(m.id)}
              onAddAnother={() => addVisualizer(m.id)}
            />
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">環境演出</h3>
        <div className="grid grid-cols-2 gap-2">
          {CATALOG.filter((m) => m.category === "ambient").map((m) => (
            <GalleryCard
              key={m.id}
              testId={`add-${m.id}`}
              icon="☁"
              name={m.name}
              description={m.description}
              used={visCount(m.id)}
              compact
              onToggle={() => toggleVis(m.id)}
              onAddAnother={() => addVisualizer(m.id)}
            />
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">エフェクト（画面全体）</h3>
        <div className="grid grid-cols-2 gap-2">
          {EFFECT_CATALOG.map((m) => (
            <GalleryCard
              key={m.id}
              testId={`add-fx-${m.id}`}
              icon="✦"
              name={m.name}
              description={m.description}
              used={fxCount(m.id)}
              compact
              onToggle={() => toggleFx(m.id)}
              onAddAnother={() => addEffect(m.id)}
            />
          ))}
        </div>
      </section>
      <button
        data-testid="reset-settings"
        onClick={() => {
          if (confirm("スペアナ・環境演出・エフェクトと、素材の調整（暗さ・ズーム・フェード）を初期状態に戻します。よろしいですか？")) useStore.getState().resetSettings();
        }}
        className="w-full rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-bad hover:text-bad"
      >
        設定を初期状態に戻す
      </button>
    </div>
  );
}
