import { CATALOG, findMeta } from "../plugins/catalog";
import { EFFECT_CATALOG, findEffectMeta } from "../plugins/effectCatalog";
import { useState } from "react";
import { useStore } from "../state/store";

const DRAG_TYPE = "application/x-awv-layer";

type RowProps = {
  id: string;
  group: "vis" | "fx";
  label: string;
  enabled: boolean;
  locked: boolean;
  selected: boolean;
  ring: string;
  canUp: boolean;
  canDown: boolean;
  upLabel: string;
  downLabel: string;
  dropHint: "above" | "below" | null;
  onToggle(): void;
  onLock(): void;
  onSelect(): void;
  onRemove(): void;
  onUp(): void;
  onDown(): void;
  onDragStart(): void;
  onDragOverRow(pos: "above" | "below"): void;
  onDropRow(pos: "above" | "below"): void;
  onDragEnd(): void;
};

/** 使用中のレイヤーの 1 行。左のつまみをドラッグするか、▲▼ で並べ替える */
function LayerRow(p: RowProps) {
  const posOf = (e: React.DragEvent<HTMLLIElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "above" : "below";
  };
  const own = (e: React.DragEvent) => e.dataTransfer.types.includes(`${DRAG_TYPE}-${p.group}`);
  return (
    <li
      data-testid={`layer-row-${p.id}`}
      onDragOver={(e) => {
        if (!own(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        p.onDragOverRow(posOf(e));
      }}
      onDrop={(e) => {
        if (!own(e)) return;
        e.preventDefault();
        p.onDropRow(posOf(e));
      }}
      className={`relative flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm ${p.selected ? `bg-raised ring-1 ${p.ring}` : "hover:bg-raised/60"}`}
    >
      {p.dropHint && <span className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent-to ${p.dropHint === "above" ? "-top-px" : "-bottom-px"}`} />}
      <span
        draggable
        data-testid={`layer-handle-${p.id}`}
        onDragStart={(e) => {
          e.dataTransfer.setData(`${DRAG_TYPE}-${p.group}`, p.id);
          e.dataTransfer.effectAllowed = "move";
          p.onDragStart();
        }}
        onDragEnd={p.onDragEnd}
        className="cursor-grab select-none px-0.5 text-ink-muted active:cursor-grabbing"
        title="ドラッグして並べ替え"
        aria-hidden
      >
        ⠿
      </span>
      <input type="checkbox" checked={p.enabled} onChange={p.onToggle} aria-label="表示" />
      <button className="flex-1 truncate text-left" onClick={p.onSelect}>
        {p.label}
      </button>
      <button data-testid={`layer-up-${p.id}`} disabled={!p.canUp} onClick={p.onUp} className="rounded px-1 text-[10px] text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-25" aria-label={p.upLabel} title={p.upLabel}>
        ▲
      </button>
      <button data-testid={`layer-down-${p.id}`} disabled={!p.canDown} onClick={p.onDown} className="rounded px-1 text-[10px] text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-25" aria-label={p.downLabel} title={p.downLabel}>
        ▼
      </button>
      <button
        data-testid={`layer-lock-${p.id}`}
        aria-pressed={p.locked}
        onClick={p.onLock}
        className={`rounded px-0.5 text-xs ${p.locked ? "text-warn" : "text-ink-muted opacity-60 hover:opacity-100"}`}
        aria-label={p.locked ? "固定を解除" : "固定する"}
        title={p.locked ? "固定中（削除・プレビュー上での選択や移動ができません）。押すと解除" : "固定する（削除・プレビュー上での選択や移動ができなくなります）"}
      >
        {p.locked ? "🔒" : "🔓"}
      </button>
      <button
        data-testid={`layer-remove-${p.id}`}
        disabled={p.locked}
        className="px-0.5 text-xs text-ink-muted hover:text-bad disabled:opacity-25 disabled:hover:text-ink-muted"
        onClick={p.onRemove}
        aria-label="削除"
        title={p.locked ? "固定中は削除できません" : "削除"}
      >
        ✕
      </button>
    </li>
  );
}

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
  const { toggleLock, selectLayer, toggleVisualizer, removeVisualizer, addVisualizer, addEffect, removeEffect, toggleEffect, moveVisualizer, moveEffect } = useStore.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ id: string; pos: "above" | "below" } | null>(null);
  const endDrag = () => {
    setDragId(null);
    setHint(null);
  };
  /**
   * 並べ替えの移動先（scene の配列の添字）。表示上で target 行の上下どちらに落としたかから求める。
   * reversed = 表示が配列の逆順（スペアナ等は上ほど手前 = 配列の後ろ）
   */
  const dropIndex = (list: { id: string }[], target: string, pos: "above" | "below", reversed: boolean) => {
    const from = list.findIndex((x) => x.id === dragId);
    const t = list.findIndex((x) => x.id === target);
    if (from < 0 || t < 0) return -1;
    // 配列上で target の前に入れるか後に入れるか
    const after = reversed ? pos === "above" : pos === "below";
    let to = after ? t + 1 : t;
    if (from < to) to -= 1;
    return to;
  };

  const visCount = (id: string) => layers.filter((l) => l.pluginId === id).length;
  const fxCount = (id: string) => effects.filter((l) => l.pluginId === id).length;
  /** 押したら追加、使用中なら最後に追加したもの（固定中を除く）を外す。全部固定中なら何もしない */
  const toggleVis = (id: string) => {
    const last = [...layers].reverse().find((l) => l.pluginId === id && !l.locked);
    if (last) removeVisualizer(last.id);
    else if (visCount(id) === 0) addVisualizer(id);
  };
  const toggleFx = (id: string) => {
    const last = [...effects].reverse().find((l) => l.pluginId === id && !l.locked);
    if (last) removeEffect(last.id);
    else if (fxCount(id) === 0) addEffect(id);
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">使用中のレイヤー（上ほど手前・⠿ をドラッグで並べ替え）</h3>
        {layers.length === 0 && effects.length === 0 && <p className="text-sm text-ink-muted">下のギャラリーから選んでください。</p>}
        <ul className="space-y-1" data-testid="layer-list">
          {[...layers].reverse().map((l) => {
            const idx = layers.indexOf(l);
            return (
              <LayerRow
                key={l.id}
                id={l.id}
                group="vis"
                label={findMeta(l.pluginId)?.name ?? l.pluginId}
                enabled={l.enabled}
                locked={!!l.locked}
                onLock={() => toggleLock(l.id)}
                selected={selected === l.id}
                ring="ring-accent-from"
                canUp={idx < layers.length - 1}
                canDown={idx > 0}
                upLabel="手前へ"
                downLabel="奥へ"
                dropHint={dragId && dragId !== l.id && hint?.id === l.id ? hint.pos : null}
                onToggle={() => toggleVisualizer(l.id)}
                onSelect={() => selectLayer(l.id)}
                onRemove={() => removeVisualizer(l.id)}
                onUp={() => moveVisualizer(l.id, idx + 1)}
                onDown={() => moveVisualizer(l.id, idx - 1)}
                onDragStart={() => setDragId(l.id)}
                onDragOverRow={(pos) => setHint({ id: l.id, pos })}
                onDropRow={(pos) => {
                  const to = dropIndex(layers, l.id, pos, true);
                  if (dragId && to >= 0) moveVisualizer(dragId, to);
                  endDrag();
                }}
                onDragEnd={endDrag}
              />
            );
          })}
        </ul>
        <ul className={`space-y-1 ${effects.length ? "mt-2 border-t border-line pt-2" : ""}`} data-testid="effect-list">
          {effects.map((l, idx) => (
            <LayerRow
              key={l.id}
              id={l.id}
              group="fx"
              label={`✦ ${findEffectMeta(l.pluginId)?.name ?? l.pluginId}`}
              enabled={l.enabled}
              locked={!!l.locked}
              onLock={() => toggleLock(l.id)}
              selected={selected === l.id}
              ring="ring-accent-to"
              canUp={idx > 0}
              canDown={idx < effects.length - 1}
              upLabel="先にかける"
              downLabel="後にかける"
              dropHint={dragId && dragId !== l.id && hint?.id === l.id ? hint.pos : null}
              onToggle={() => toggleEffect(l.id)}
              onSelect={() => selectLayer(l.id)}
              onRemove={() => removeEffect(l.id)}
              onUp={() => moveEffect(l.id, idx - 1)}
              onDown={() => moveEffect(l.id, idx + 1)}
              onDragStart={() => setDragId(l.id)}
              onDragOverRow={(pos) => setHint({ id: l.id, pos })}
              onDropRow={(pos) => {
                const to = dropIndex(effects, l.id, pos, false);
                if (dragId && to >= 0) moveEffect(dragId, to);
                endDrag();
              }}
              onDragEnd={endDrag}
            />
          ))}
        </ul>
      </section>

      <p className="rounded-lg bg-raised/60 px-3 py-2 text-xs leading-5 text-ink-muted">
        カードを押すと追加、もう一度押すと外れます。気軽に試してください。調整した設定値と位置・大きさは種類ごとにこのブラウザに保存され、外して付け直したときや、次に開いて追加したときに復元されます（開いた直後のレイヤーは空です）。🔒 で固定すると、削除やプレビュー上での選択・移動ができなくなります。
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
          if (confirm("スペアナ・環境演出・エフェクトと、素材の調整（暗さ・ズーム・背景の倍率と位置・フェード）、種類ごとに覚えている設定値を初期状態に戻します。よろしいですか？")) useStore.getState().resetSettings();
        }}
        className="w-full rounded-lg border border-line px-3 py-1.5 text-xs text-ink-muted hover:border-bad hover:text-bad"
      >
        設定を初期状態に戻す
      </button>
    </div>
  );
}
