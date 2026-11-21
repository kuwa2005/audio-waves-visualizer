/**
 * 決定的な乱数。プレビューと書き出しで同じ結果にするため、Math.random は使わず
 * 「拍の番号」などから種を作ってこの関数で乱数列を得る。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 整数から 0..1 の値（1 回だけ使うハッシュ） */
export function hash01(n: number): number {
  return mulberry32(n * 2654435761)();
}

/** 滑らかなノイズ（-1..1）。カメラシェイク等に使う */
export function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash01(i * 7919 + seed) * 2 - 1;
  const b = hash01((i + 1) * 7919 + seed) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
