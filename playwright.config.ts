import { defineConfig, devices } from "@playwright/test";

// AWV_URL を指定すると本番などの既存サイトをテストする（例: AWV_URL=https://lil.la/visualizer/）
const remote = process.env.AWV_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: remote ?? "http://localhost:4173/visualizer/",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: remote
    ? undefined
    : { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173/visualizer/", reuseExistingServer: true },
});
