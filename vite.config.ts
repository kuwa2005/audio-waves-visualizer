import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// SharedArrayBuffer を使うため、開発サーバーでもクロスオリジン分離ヘッダーを付ける。
// 本番（lil.la/visualizer/）では public/.htaccess で同じヘッダーを付与する。
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  // デプロイ先は旧版と同じ https://lil.la/visualizer/
  base: "/visualizer/",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: { target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
