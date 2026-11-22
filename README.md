# Audio Waves Visualizer

音楽と画像から、音に反応するド派手なビジュアライザー動画を作る Web アプリです。
[Music Waves Visualizer](https://github.com/kuwa2005/music-waves-visualizer) の後継として、0 から作り直しています。

公開先: https://lil.la/visualizer/

## できること

- **素材**: 音源（wav / mp3 / m4a / aac / flac / ogg / opus）・背景画像（16:9・9:16・1:1 を自動判定）・字幕（srt / vtt）を 1 か所にまとめてドロップ。拡張子で振り分け
- **背景の調整**: 暗さ、ビートでズーム（−100〜+100%）、倍率（50〜300%）と位置、画面全体のフェードイン／アウト
- **スペアナ（12 種）**: ネオンバー、ライン、グライコ、パルスリング、ワープトンネル、パーティクル・ギャラクシー、ライトニング、3D ラインスケープ、ターンテーブル、サークルバー、オシロスコープ、スペクトログラム
- **環境演出（11 種）**: 宇宙空間、星空、きらきら、描画（水滴・ハート・花火・星型・猫の手）、ミラーボール、空気感、雨、雪、桜吹雪、シャボン玉、レーザーショー
- **エフェクト（9 種）**: ブルーム、色収差、ズームブラー、グリッチ、カメラシェイク、フラッシュ（光過敏に配慮）、ビネット、VHS、万華鏡
- **テキスト**: タイトル（登場の動き・ビートで脈打つ）と字幕（フェード・ポップ・カラオケ・タイプライター）
- **操作**: プレビュー上でドラッグ移動・ホイール拡大縮小、ギャラリーは押すと追加／もう一度押すと外す、スライダーはダブルクリックで初期値
- **配色プリセット（10 種）**: 複数の色を使うスペアナ・環境演出は、ネオン・サイバー・ヴェイパーウェイブ・サンセット・ファイア・オーシャン・フォレスト・桜・ゴールド・モノクロから選べる
- **ビートへの感度**（0〜2 倍）: 環境演出とエフェクトごとに調整
- **書き出し**: MP4（映像 H.264、GPU エンコード優先・失敗時は CPU でやり直し／音声 AAC、ブラウザが作れない場合は ffmpeg.wasm で変換）。開始位置＋長さ（15 秒〜3 分のプリセット）、音声フェード、自動ダウンロード
- **設定の保存**: 素材の調整・レイヤー・エフェクトの設定はブラウザ（ローカルストレージ）に保存し、次回復元

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

プレビュー右上の HUD に FPS・描画時間（p50/p95）・コマ落ち数が表示されます（スマホ幅では FPS のみ）。

E2E は描画・書き出しが重いため 1 つずつ実行します（`workers: 1`）。書き出した動画やスクリーンショットの検証に `ffmpeg` / `ffprobe` を使います（CI ではインストールしてから実行）。

起動時には何も読み込みません。URL に `?demo` を付けると、デモ素材（`public/sample/`：楽曲・背景画像・字幕）を読み込みます（動作確認・自動テスト用）。
テスト用の元素材は `sample/` にあります（作者の許可を得て同梱）。

## デプロイ

`deploy.env.example` を `deploy.env` にコピーして接続先を記入し（コミットしないこと）、`scripts/deploy.sh` を実行します。
SSH + rsync で `<公開先>.new` に転送したあと、既存の公開フォルダを `<公開先>.NNN` に退避して切り替えます（`--dry-run` で確認のみ）。

- 本番では `.htaccess` で COOP/COEP ヘッダーを付け、SharedArrayBuffer を有効にしています。
- サイトは Cloudflare 経由で配信されており、404 も一定時間キャッシュされます。**デプロイ前に新しいアセットの URL へアクセスしない**でください（ファイル名のハッシュが変われば解消します）。
- 旧版（Music Waves Visualizer 最終版）は https://lil.la/visualizer-classic/ に残しています。

## 構成

```
src/
  app/      画面と音声・描画 Worker をつなぐ司令塔（controller.ts）
  audio/    音声の再生（AudioEngine）、AAC の予備エンコード（ffmpeg.wasm）
  engine/   描画 Worker、シーン描画（SceneRenderer）、書き出し、コーデック選択、性能計測
  plugins/  スペアナ・環境演出・エフェクト（メタ情報は catalog.ts / effectCatalog.ts）
  text/     タイトル・字幕（SRT/VTT の読み込み、描画）
  state/    状態（zustand）と設定の保存・復元
  ui/       React の画面
  wasm/pkg/ wasm-pack の出力（ビルド時に生成、コミットしない）
crates/awv-core/  Rust の高速処理コア（FFT・曲解析・BPM/ビート・パーティクル）
public/ffmpeg/    ffmpeg.wasm のコア（ビルド時にコピー、コミットしない）
e2e/      Playwright テスト
```

### プラグインを追加するには

1. `src/plugins/catalog.ts`（エフェクトは `effectCatalog.ts`）にメタ情報（名前・パラメータ定義・描画範囲）を追加
2. 描画処理を作り、`src/plugins/registry.ts`（エフェクトは `effects.ts` の `EFFECT_REGISTRY`）に登録
3. 描画は時刻 `t`・音声特徴量・パラメータだけで決める（プレビューと書き出しを一致させるため。乱数は `rng.ts` の決定的なものを使う）
4. WASM などの資源を持つ場合は `dispose()` で解放する

## ロードマップ

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | 土台（Vite・Rust/WASM・Worker 描画・性能 HUD・CI） | ✅ |
| 2 | エンジン（音声入力・曲解析・BPM/ビート・特徴量・プラグイン） | ✅ |
| 3 | 書き出し（WebCodecs で映像＋音声の MP4） | ✅ |
| 4 | 新 UI（3 ペイン・インスペクター・タイムライン・マウスでのレイヤー移動／拡大縮小・テキスト・スマホ幅） | ✅ |
| 5 | 新しいスペアナ・環境演出・エフェクト、高級ターンテーブル | ✅ |
| 6 | 旧版の機能の移植（残り: 複数画像のスライドショー、動画背景、字幕の作成支援、設定ファイルの書き出し） | 一部 |
| 7 | 仕上げ・公開 | |

## ライセンス

MIT
