import { CATALOG, findMeta } from "../plugins/catalog";
import { useStore } from "../state/store";

/** 手順2: ビジュアル。使用中のレイヤー一覧と、追加できるビジュアライザーのギャラリー */
export function VisualPanel() {
  const layers = useStore((s) => s.scene.visualizers);
  const selected = useStore((s) => s.selectedLayerId);
  const { selectLayer, toggleVisualizer, removeVisualizer, addVisualizer } = useStore.getState();

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">使用中のレイヤー</h3>
        {layers.length === 0 && <p className="text-sm text-ink-muted">下から追加してください。</p>}
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
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">追加する</h3>
        <div className="grid gap-2">
          {CATALOG.map((m) => (
            <button
              key={m.id}
              data-testid={`add-${m.id}`}
              onClick={() => addVisualizer(m.id)}
              className="rounded-xl border border-line bg-raised/40 px-3 py-2 text-left transition hover:border-accent-from hover:bg-raised"
            >
              <span className="block text-sm font-medium">＋ {m.name}</span>
              <span className="block text-xs text-ink-muted">{m.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
