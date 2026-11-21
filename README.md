# Audio Waves Visualizer

音楽と画像から、音に反応するド派手なビジュアライザー動画を作る Web アプリです。
[Music Waves Visualizer](https://github.com/kuwa2005/music-waves-visualizer) の後継として、0 から作り直しています。

公開先: https://lil.la/visualizer/

## 設計の柱

- **描画は Canvas 2D に一本化**（WebGL は使わない）
- **描画は Web Worker + OffscreenCanvas**: UI 操作で描画がカクつかない
- **重い処理は Rust → WebAssembly（SIMD 有効）**: FFT・音声特徴量・パーティクル・画素処理
- **決定的な描画**: `render(状態, 音声特徴量, 時刻)`。プレビューと書き出しが必ず一致する
- **性能目標**: 内蔵 GPU のノート PC で 1080p / 60fps をコマ落ちなしで描画

## 開発

必要なもの: Node.js 24 以上、Rust（stable、`wasm32-unknown-unknown` ターゲット）、[wasm-pack](https://github.com/rustwasm/wasm-pack)

```bash
npm install
npm run dev          # WASM をビルドして開発サーバーを起動 → http://localhost:5173/visualizer/
npm run build        # 本番ビルド（dist/）
npm test             # TypeScript のユニットテスト
npm run test:rust    # Rust のユニットテスト
npx playwright test  # E2E（ローカルのビルドに対して実行）
AWV_URL=https://lil.la/visualizer/ npx playwright test  # 本番に対して実行
```

プレビュー右上の HUD に FPS・描画時間（p50/p95）・コマ落ち数が表示されます。

## デプロイ

`deploy.env.example` を `deploy.env` にコピーして接続先を記入し（コミットしないこと）、`scripts/deploy.sh` を実行します。
SSH + rsync で `<公開先>.new` に転送したあと、既存の公開フォルダを `<公開先>.NNN` に退避して切り替えます（`--dry-run` で確認のみ）。

- 本番では `.htaccess` で COOP/COEP ヘッダーを付け、SharedArrayBuffer を有効にしています。
- サイトは Cloudflare 経由で配信されており、404 も一定時間キャッシュされます。**デプロイ前に新しいアセットの URL へアクセスしない**でください（ファイル名のハッシュが変われば解消します）。
- 旧版（Music Waves Visualizer 最終版）は https://lil.la/visualizer-classic/ に残しています。

## 構成

```
src/
  engine/   描画 Worker・メインスレッドとの通信・性能計測
  ui/       React の画面
  wasm/pkg/ wasm-pack の出力（ビルド時に生成、コミットしない）
crates/awv-core/  Rust の高速処理コア
e2e/      Playwright テスト
```

## ロードマップ

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | 土台（Vite・Rust/WASM・Worker 描画・性能 HUD・CI） | ✅ |
| 2 | エンジン（音声入力・曲解析・BPM/ビート・特徴量・プラグイン） | ✅ |
| 3 | 書き出し（WebCodecs で映像＋音声の MP4） | ✅ |
| 4 | 新 UI（3 ペイン・インスペクター・タイムライン） | |
| 5 | 新しいスペアナ・エフェクト、高級ターンテーブル | |
| 6 | 旧版の全機能の移植 | |
| 7 | 仕上げ・公開 | |

## ライセンス

MIT
