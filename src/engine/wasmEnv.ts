/** WASM のメモリ参照（描画 Worker が初期化時に設定）。WASM を直接使うプラグインが参照する */
let memory: WebAssembly.Memory | null = null;

export function setWasmMemory(m: WebAssembly.Memory): void {
  memory = m;
}

export function wasmMemory(): WebAssembly.Memory {
  if (!memory) throw new Error("WASM が初期化されていません");
  return memory;
}
