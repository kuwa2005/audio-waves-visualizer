/**
 * スライダー（input[type=range]）のつまみをダブルクリックすると初期値に戻す。
 * 各スライダーに data-default="初期値" を付けておけば、画面全体でこの 1 か所が処理する。
 * React の onChange を通すため、値を書き換えてから input イベントを送る（通常の操作と同じ経路で反映・保存される）。
 */
const RESET_TITLE = "ダブルクリックで初期値に戻す";

export function resetSliderToDefault(el: HTMLInputElement): boolean {
  const def = el.dataset.default;
  if (def === undefined || el.value === def) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, def);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function installSliderReset(root: Document = document): () => void {
  const onDbl = (e: MouseEvent) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === "range" && el.dataset.default !== undefined) {
      e.preventDefault();
      resetSliderToDefault(el);
    }
  };
  // マウスを乗せたときの説明（title が無いスライダーにだけ付ける）
  const onOver = (e: MouseEvent) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === "range" && el.dataset.default !== undefined && !el.title) el.title = RESET_TITLE;
  };
  root.addEventListener("dblclick", onDbl);
  root.addEventListener("mouseover", onOver);
  return () => {
    root.removeEventListener("dblclick", onDbl);
    root.removeEventListener("mouseover", onOver);
  };
}
