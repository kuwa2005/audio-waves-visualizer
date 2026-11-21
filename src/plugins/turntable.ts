import { turntableMeta, turntableLayout } from "./catalog";
import { mulberry32 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

type C2D = OffscreenCanvasRenderingContext2D;

/** 金属の質感（明暗の帯を重ねたグラデーション） */
function metalGradient(g: C2D, x0: number, y0: number, x1: number, y1: number, base: number): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  const c = (l: number) => `hsl(220 6% ${Math.max(0, Math.min(100, base + l))}%)`;
  gr.addColorStop(0, c(8));
  gr.addColorStop(0.18, c(-6));
  gr.addColorStop(0.35, c(14));
  gr.addColorStop(0.5, c(-2));
  gr.addColorStop(0.68, c(10));
  gr.addColorStop(0.85, c(-8));
  gr.addColorStop(1, c(4));
  return gr;
}

function roundRect(g: C2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

type Finish = "aluminum" | "black" | "walnut";

/** 本体（動かない部分）を描く */
function drawPlinth(g: C2D, w: number, h: number, finish: Finish, s: number, seed: number): void {
  const r = 18 * s;
  // 落ち影（本体の下）
  g.save();
  g.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(g, 10 * s, 18 * s, w - 10 * s, h - 10 * s, r);
  g.fill();
  g.restore();

  roundRect(g, 0, 0, w - 14 * s, h - 22 * s, r);
  g.save();
  g.clip();
  const pw = w - 14 * s;
  const ph = h - 22 * s;
  if (finish === "walnut") {
    const gr = g.createLinearGradient(0, 0, pw, ph);
    gr.addColorStop(0, "#5a3520");
    gr.addColorStop(0.5, "#40230f");
    gr.addColorStop(1, "#2c170a");
    g.fillStyle = gr;
    g.fillRect(0, 0, pw, ph);
    // 木目
    const rnd = mulberry32(seed);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 70; i++) {
      const y = rnd() * ph;
      g.strokeStyle = rnd() < 0.5 ? "#1a0c04" : "#7a4a2a";
      g.lineWidth = (0.6 + rnd() * 2.2) * s;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= pw; x += pw / 12) g.lineTo(x, y + Math.sin(x * 0.01 / s + i) * 6 * s + (rnd() - 0.5) * 3 * s);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (finish === "black") {
    const gr = g.createLinearGradient(0, 0, 0, ph);
    gr.addColorStop(0, "#1c1d22");
    gr.addColorStop(0.5, "#0a0a0d");
    gr.addColorStop(1, "#050507");
    g.fillStyle = gr;
    g.fillRect(0, 0, pw, ph);
    // ピアノブラックの映り込み（斜めの帯）
    const refl = g.createLinearGradient(0, 0, pw, ph);
    refl.addColorStop(0.2, "rgba(255,255,255,0)");
    refl.addColorStop(0.32, "rgba(255,255,255,0.07)");
    refl.addColorStop(0.36, "rgba(255,255,255,0.02)");
    refl.addColorStop(0.55, "rgba(255,255,255,0)");
    g.fillStyle = refl;
    g.fillRect(0, 0, pw, ph);
  } else {
    g.fillStyle = metalGradient(g, 0, 0, pw, ph * 0.3, 62);
    g.fillRect(0, 0, pw, ph);
    // ヘアライン（細い横線）
    const rnd = mulberry32(seed);
    for (let i = 0; i < ph; i += 1.5 * s) {
      g.globalAlpha = 0.04 + rnd() * 0.06;
      g.fillStyle = rnd() < 0.5 ? "#ffffff" : "#000000";
      g.fillRect(0, i, pw, 0.8 * s);
    }
    g.globalAlpha = 1;
  }
  // 面取りのハイライトと影
  g.lineWidth = 3 * s;
  g.strokeStyle = finish === "walnut" ? "rgba(255,210,170,0.25)" : "rgba(255,255,255,0.35)";
  roundRect(g, 1.5 * s, 1.5 * s, pw - 3 * s, ph - 3 * s, r);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 2 * s;
  roundRect(g, 0, 0, pw, ph, r);
  g.stroke();
  g.restore();
}

/** 画像を中心 (c,c)・半径 r の円に切り抜いて敷き詰める */
function drawArtCircle(g: C2D, c: number, r: number, art: ImageBitmap): void {
  g.save();
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.clip();
  const sc = Math.max((r * 2) / art.width, (r * 2) / art.height);
  g.drawImage(art, c - (art.width * sc) / 2, c - (art.height * sc) / 2, art.width * sc, art.height * sc);
  g.restore();
}

/** 回転する部分（プラッターの縁・ストロボドット・レコード・ラベル）を描く。中心 (R,R) */
function drawDisc(g: C2D, R: number, art: ImageBitmap | undefined, seed: number, picture: "label" | "full"): void {
  const c = R;
  // プラッターの縁（金属）
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fillStyle = metalGradient(g, 0, 0, 2 * R, 2 * R, 58);
  g.fill();
  // ストロボドット 4 列（50/60Hz × 33/45 回転を想定した本数）
  const rows = [180, 167, 135, 122];
  rows.forEach((n, k) => {
    const rr = R * (0.985 - k * 0.012);
    g.fillStyle = "rgba(20,22,28,0.85)";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.save();
      g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      g.rotate(a);
      g.fillRect(-R * 0.004, -R * 0.0045, R * 0.008, R * 0.009);
      g.restore();
    }
  });
  // ゴムマット
  const vinylR = R * 0.93;
  g.beginPath();
  g.arc(c, c, R * 0.935, 0, Math.PI * 2);
  g.fillStyle = "#111215";
  g.fill();
  // レコード盤
  g.beginPath();
  g.arc(c, c, vinylR, 0, Math.PI * 2);
  g.fillStyle = "#08080a";
  g.fill();
  const labelR = R * 0.33;
  const full = picture === "full" && !!art;
  if (full) {
    // ピクチャーレコード: 盤面全体に画像。透明な盤の質感として周辺を少し暗くする
    drawArtCircle(g, c, vinylR, art!);
    const vg = g.createRadialGradient(c, c, labelR, c, c, vinylR);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(0.85, "rgba(0,0,0,0.12)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vg;
    g.beginPath();
    g.arc(c, c, vinylR, 0, Math.PI * 2);
    g.fill();
  }
  // 溝（細い同心円を明るさを変えて重ねる）と曲間の隙間
  const rnd = mulberry32(seed);
  const gaps = [0.88, 0.76, 0.64, 0.53].map((x) => x + (rnd() - 0.5) * 0.04);
  for (let rr = vinylR * 0.985; rr > labelR * 1.18; rr -= Math.max(0.6, R * 0.0028)) {
    const f = rr / vinylR;
    const inGap = gaps.some((gp) => Math.abs(f - gp) < 0.006);
    // ピクチャーレコードでは溝をごく薄くして画像を見せる
    g.strokeStyle = inGap ? `rgba(0,0,0,${full ? 0.35 : 0.9})` : `rgba(200,205,220,${(0.025 + rnd() * 0.05) * (full ? 0.5 : 1)})`;
    g.lineWidth = inGap ? R * (full ? 0.003 : 0.006) : 0.7;
    g.beginPath();
    g.arc(c, c, rr, 0, Math.PI * 2);
    g.stroke();
  }
  // ラベル（背景画像を丸く切り抜く）。ピクチャーレコードでは盤面の画像をそのまま見せる
  g.save();
  g.beginPath();
  g.arc(c, c, labelR, 0, Math.PI * 2);
  g.clip();
  if (full) {
    /* 盤面全体の画像が見えているので何も描かない */
  } else if (art) {
    const sc = Math.max((labelR * 2) / art.width, (labelR * 2) / art.height);
    g.drawImage(art, c - (art.width * sc) / 2, c - (art.height * sc) / 2, art.width * sc, art.height * sc);
  } else {
    const lg = g.createRadialGradient(c, c, 0, c, c, labelR);
    lg.addColorStop(0, "#d9363e");
    lg.addColorStop(1, "#7a1218");
    g.fillStyle = lg;
    g.fillRect(c - labelR, c - labelR, labelR * 2, labelR * 2);
  }
  g.restore();
  if (!full) {
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = R * 0.006;
    g.beginPath();
    g.arc(c, c, labelR, 0, Math.PI * 2);
    g.stroke();
  }
  // 回転が分かる目印（ラベル上の小さな刻印）
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.beginPath();
  g.arc(c + labelR * 0.78, c, R * 0.008, 0, Math.PI * 2);
  g.fill();
}

/** 回転しない光（レコードの光の筋・ストロボランプの照り返し・スピンドル） */
function drawSheen(g: C2D, R: number): void {
  const c = R;
  const vinylR = R * 0.93;
  const labelR = R * 0.33;
  g.save();
  g.beginPath();
  g.arc(c, c, vinylR, 0, Math.PI * 2);
  g.arc(c, c, labelR * 1.02, 0, Math.PI * 2, true);
  g.clip();
  const cg = g.createConicGradient(-Math.PI / 4, c, c);
  const peaks = [0, 0.5];
  cg.addColorStop(0, "rgba(255,255,255,0.0)");
  for (const p of peaks) {
    cg.addColorStop(p + 0.05, "rgba(255,255,255,0.0)");
    cg.addColorStop(p + 0.11, "rgba(220,230,255,0.22)");
    cg.addColorStop(p + 0.13, "rgba(255,255,255,0.34)");
    cg.addColorStop(p + 0.16, "rgba(220,230,255,0.16)");
    cg.addColorStop(p + 0.24, "rgba(255,255,255,0.0)");
  }
  cg.addColorStop(1, "rgba(255,255,255,0.0)");
  g.fillStyle = cg;
  g.fillRect(0, 0, 2 * R, 2 * R);
  g.restore();
  // プラッター縁の金属の映り込み
  g.save();
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.arc(c, c, R * 0.94, 0, Math.PI * 2, true);
  g.clip();
  const rim = g.createConicGradient(Math.PI * 0.15, c, c);
  rim.addColorStop(0, "rgba(255,255,255,0.35)");
  rim.addColorStop(0.15, "rgba(0,0,0,0.25)");
  rim.addColorStop(0.45, "rgba(255,255,255,0.25)");
  rim.addColorStop(0.62, "rgba(0,0,0,0.3)");
  rim.addColorStop(0.85, "rgba(255,255,255,0.15)");
  rim.addColorStop(1, "rgba(255,255,255,0.35)");
  g.fillStyle = rim;
  g.fillRect(0, 0, 2 * R, 2 * R);
  g.restore();
  // スピンドル
  const sp = g.createRadialGradient(c - R * 0.006, c - R * 0.006, 0, c, c, R * 0.022);
  sp.addColorStop(0, "#ffffff");
  sp.addColorStop(0.5, "#a7acb8");
  sp.addColorStop(1, "#3a3d45");
  g.fillStyle = sp;
  g.beginPath();
  g.arc(c, c, R * 0.02, 0, Math.PI * 2);
  g.fill();
}

/** 円 (P, L) と円 (C, r) の交点のうち、左下側を返す（アームの針先位置） */
export function stylusPoint(px: number, py: number, L: number, cx: number, cy: number, r: number): [number, number] | null {
  const dx = cx - px;
  const dy = cy - py;
  const d = Math.hypot(dx, dy);
  if (d > L + r || d < Math.abs(L - r) || d === 0) return null;
  const a = (L * L - r * r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L * L - a * a));
  const mx = px + (a * dx) / d;
  const my = py + (a * dy) / d;
  const p1: [number, number] = [mx + (h * dy) / d, my - (h * dx) / d];
  const p2: [number, number] = [mx - (h * dy) / d, my + (h * dx) / d];
  // 右上の支点から見て、より右下（プラッター外周の手前側）を選ぶ
  return p1[0] + p1[1] > p2[0] + p2[1] ? p1 : p2;
}

/**
 * 高級ターンテーブル。静止部分（本体・回転しない光）はキャッシュし、
 * 毎フレームは「回転する円盤の drawImage 1 回」と「トーンアーム」だけを描く。
 * 回転角は時刻から決まる（33⅓ / 45 回転）ので、書き出しでも同じ見た目になる。
 */
export const turntable: VisualizerPlugin = {
  ...turntableMeta,
  create() {
    let plinth: OffscreenCanvas | null = null;
    let disc: OffscreenCanvas | null = null;
    let sheen: OffscreenCanvas | null = null;
    let key = "";

    return {
      render(ctx, frame, params) {
        const { width: W, height: H, t, features: f, duration } = frame;
        const finish = str(params, "finish", "aluminum") as Finish;
        const L = turntableLayout(params, W, H);
        const s = L.w / 1000; // 基準幅 1000px に対する倍率
        const R = L.platterR;
        const picture = str(params, "picture", "label") === "full" ? "full" : "label";
        const k = `${finish}:${picture}:${Math.round(L.w)}:${frame.artworkId ?? "-"}`;
        if (k !== key) {
          key = k;
          plinth = new OffscreenCanvas(Math.ceil(L.w), Math.ceil(L.h));
          const pg = plinth.getContext("2d")!;
          drawPlinth(pg, L.w, L.h, finish, s, 42);
          // プラッターの落ち込み（影）
          pg.fillStyle = "rgba(0,0,0,0.55)";
          pg.beginPath();
          pg.arc(L.px - L.x + 6 * s, L.py - L.y + 10 * s, R * 1.02, 0, Math.PI * 2);
          pg.fill();
          // 操作部（スタート/ストップ・回転数ボタン・ピッチスライダー・電源ランプ）
          const bx = 40 * s;
          const by = L.h - 95 * s;
          pg.fillStyle = metalGradient(pg, bx, by, bx + 90 * s, by + 50 * s, 45);
          roundRect(pg, bx, by, 90 * s, 46 * s, 8 * s);
          pg.fill();
          pg.fillStyle = "rgba(255,255,255,0.75)";
          pg.font = `${12 * s}px sans-serif`;
          pg.fillText("START·STOP", bx + 10 * s, by + 28 * s);
          ["33", "45"].forEach((label, i) => {
            const x = bx + 110 * s + i * 52 * s;
            pg.fillStyle = metalGradient(pg, x, by, x + 44 * s, by + 46 * s, 50);
            roundRect(pg, x, by + 10 * s, 44 * s, 26 * s, 6 * s);
            pg.fill();
            pg.fillStyle = "#1a1c22";
            pg.font = `bold ${13 * s}px sans-serif`;
            pg.fillText(label, x + 14 * s, by + 28 * s);
          });
          // ピッチスライダー（右下）
          const sx = L.w - 95 * s;
          const sy = L.h * 0.5;
          pg.fillStyle = "rgba(0,0,0,0.6)";
          roundRect(pg, sx, sy, 14 * s, L.h * 0.36, 7 * s);
          pg.fill();
          pg.fillStyle = metalGradient(pg, sx - 14 * s, 0, sx + 28 * s, 0, 60);
          roundRect(pg, sx - 14 * s, sy + L.h * 0.16, 42 * s, 22 * s, 4 * s);
          pg.fill();
          // トーンアームの台座
          const ax = L.pivotX - L.x;
          const ay = L.pivotY - L.y;
          pg.fillStyle = "rgba(0,0,0,0.5)";
          pg.beginPath();
          pg.arc(ax + 5 * s, ay + 8 * s, 62 * s, 0, Math.PI * 2);
          pg.fill();
          pg.fillStyle = metalGradient(pg, ax - 60 * s, ay - 60 * s, ax + 60 * s, ay + 60 * s, 40);
          pg.beginPath();
          pg.arc(ax, ay, 58 * s, 0, Math.PI * 2);
          pg.fill();
          // アームレスト
          pg.fillStyle = metalGradient(pg, ax - 10 * s, 0, ax + 10 * s, 0, 55);
          pg.fillRect(ax - 8 * s, ay + L.armLen * 0.62, 16 * s, 34 * s);

          disc = new OffscreenCanvas(Math.ceil(R * 2), Math.ceil(R * 2));
          drawDisc(disc.getContext("2d")!, R, frame.artwork, 7, picture);
          sheen = new OffscreenCanvas(Math.ceil(R * 2), Math.ceil(R * 2));
          drawSheen(sheen.getContext("2d")!, R);
        }

        // ---- 毎フレーム ----
        const rpm = Number(str(params, "rpm", "33")) === 45 ? 45 : 100 / 3;
        // 曲の頭 1 秒で回り始める（角度 = 速度の積分）
        // 回転速度の倍率（0.1〜1）。角度は時刻から決まるので、書き出しでも同じ回転になる
        const spin = (rpm / 60) * Math.PI * 2 * Math.min(1, Math.max(0.1, num(params, "spinScale", 1)));
        const ang = t < 1 ? (spin * t * t) / 2 : spin * (t - 0.5);
        const vib = f.kick * num(params, "vibration", 0.4) * 2 * s;

        ctx.save();
        ctx.translate(0, vib * 0.5);
        ctx.drawImage(plinth!, L.x, L.y);
        ctx.save();
        ctx.translate(L.px, L.py);
        ctx.rotate(ang);
        ctx.drawImage(disc!, -R, -R);
        ctx.restore();
        ctx.drawImage(sheen!, L.px - R, L.py - R);

        // ストロボランプの照り返し（左下）と電源ランプ
        const lampA = Math.PI * 0.75;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55;
        const lamp = frame.sprites.tintedGlow("#ff7a2e");
        const lr = R * 0.22;
        ctx.drawImage(lamp, L.px + Math.cos(lampA) * R - lr, L.py + Math.sin(lampA) * R - lr, lr * 2, lr * 2);
        const led = str(params, "led", "#4cc3ff");
        ctx.globalAlpha = 0.6 + f.rms * 0.4;
        const lx = L.x + 60 * s;
        const ly = L.y + 40 * s;
        ctx.drawImage(frame.sprites.tintedGlow(led), lx - 16 * s, ly - 16 * s, 32 * s, 32 * s);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;

        // ---- トーンアーム（再生位置に合わせて外周→内周） ----
        const progress = duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0.1;
        const rOuter = R * 0.9;
        const rInner = R * 0.42;
        const rr = rOuter + (rInner - rOuter) * progress;
        const tip = stylusPoint(L.pivotX, L.pivotY, L.armLen, L.px, L.py, rr) ?? [L.pivotX - L.armLen * 0.3, L.pivotY + L.armLen * 0.95];
        const dirX = (tip[0] - L.pivotX) / L.armLen;
        const dirY = (tip[1] - L.pivotY) / L.armLen;
        const jitter = f.bass * 0.6 * s;
        const drawArm = (ox: number, oy: number, shadow: boolean) => {
          const P = [L.pivotX + ox, L.pivotY + oy];
          const T = [tip[0] + ox + jitter, tip[1] + oy];
          // カウンターウェイト（支点の反対側）
          const cw = [P[0] - dirX * 70 * s, P[1] - dirY * 70 * s];
          ctx.lineCap = "round";
          ctx.strokeStyle = shadow ? "rgba(0,0,0,0.35)" : metalGradient(ctx, cw[0] - 20 * s, cw[1] - 20 * s, cw[0] + 20 * s, cw[1] + 20 * s, 35);
          ctx.lineWidth = 46 * s;
          ctx.beginPath();
          ctx.moveTo(cw[0] - dirX * 22 * s, cw[1] - dirY * 22 * s);
          ctx.lineTo(cw[0] + dirX * 22 * s, cw[1] + dirY * 22 * s);
          ctx.stroke();
          // アームパイプ
          ctx.strokeStyle = shadow ? "rgba(0,0,0,0.35)" : metalGradient(ctx, P[0] - dirY * 10 * s, P[1] + dirX * 10 * s, P[0] + dirY * 10 * s, P[1] - dirX * 10 * s, 70);
          ctx.lineWidth = 11 * s;
          ctx.beginPath();
          ctx.moveTo(cw[0], cw[1]);
          ctx.lineTo(T[0] - dirX * 40 * s, T[1] - dirY * 40 * s);
          ctx.stroke();
          // ヘッドシェル（少し角度を付ける）
          const off = -0.38;
          const hx = Math.cos(Math.atan2(dirY, dirX) + off);
          const hy = Math.sin(Math.atan2(dirY, dirX) + off);
          const hs = [T[0] - dirX * 40 * s, T[1] - dirY * 40 * s];
          ctx.lineWidth = 24 * s;
          ctx.strokeStyle = shadow ? "rgba(0,0,0,0.35)" : "#2a2c33";
          ctx.beginPath();
          ctx.moveTo(hs[0], hs[1]);
          ctx.lineTo(hs[0] + hx * 52 * s, hs[1] + hy * 52 * s);
          ctx.stroke();
          if (!shadow) {
            // 指かけ
            ctx.lineWidth = 4 * s;
            ctx.strokeStyle = "#c9ccd4";
            ctx.beginPath();
            ctx.moveTo(hs[0] + hx * 30 * s, hs[1] + hy * 30 * s);
            ctx.lineTo(hs[0] + hx * 30 * s - hy * 26 * s, hs[1] + hy * 30 * s + hx * 26 * s);
            ctx.stroke();
          }
          // 支点（ジンバル）
          if (!shadow) {
            ctx.fillStyle = metalGradient(ctx, P[0] - 26 * s, P[1] - 26 * s, P[0] + 26 * s, P[1] + 26 * s, 62);
            ctx.beginPath();
            ctx.arc(P[0], P[1], 26 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#1b1d22";
            ctx.beginPath();
            ctx.arc(P[0], P[1], 9 * s, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        drawArm(14 * s, 22 * s, true);
        drawArm(0, 0, false);
        ctx.restore();
      },
    };
  },
};
