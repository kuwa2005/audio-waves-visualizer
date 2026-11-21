// ffmpeg.wasm のコア（約 32MB）を public/ffmpeg/ にコピーする（ビルド時に実行。リポジトリには入れない）
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "@ffmpeg", "core", "dist", "esm");
const dst = join("public", "ffmpeg");
mkdirSync(dst, { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const from = join(src, f);
  const to = join(dst, f);
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}
console.log("ffmpeg core -> public/ffmpeg/");
