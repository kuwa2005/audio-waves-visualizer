import { mirrorBallLayout, mirrorBallMeta } from "./catalog";
import { hash01 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

const LAT = 16; // 緯度方向のタイル列
const SHADES = 7; // タイルの明るさの段階（段階ごとに 1 パスで塗る）
const LIGHT_LON = -0.6; // 光源の方向（左上から照らす）

const PALETTES: Record<string, string[]> = {
  white: ["#ffffff", "#f2f6ff", "#e6efff"],
  rainbow: ["#ff4d6d", "#ffd23f", "#3ef2ff", "#7cff6b", "#b56bff", "#ff8a3d"],
  warm: ["#ffe2a8", "#ffd27a", "#fff1d0"],
};

/**
 * ミラーボール: 鏡のタイルで覆われた球が回り、反射した光の粒が部屋中を流れる。
 * 回転角 = 時刻 × 速さ（状態なし）。タイルは明るさの段階ごとに 1 回の fill でまとめて描く。
 */
export const mirrorBall: VisualizerPlugin = {
  ...mirrorBallMeta,
  create() {
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const { R, cx, cy } = mirrorBallLayout(p, W, H);
        const rot = t * num(p, "speed", 0.12) * Math.PI * 2;
        const palette = PALETTES[str(p, "colors", "white")] ?? PALETTES.white;
        const flash = num(p, "flash", 0.6);
        const boost = 1 + flash * (f.kick * 1.2 + f.bass * 0.3);
        const s = H / 1080;

        ctx.save();
        // 部屋を暗くする
        const darken = num(p, "darken", 0.35);
        if (darken > 0) {
          ctx.globalAlpha = darken;
          ctx.fillStyle = "#03030a";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }

        // ---- 部屋に映る光の粒（球の回転に合わせて横へ流れる） ----
        const nSpots = Math.round(num(p, "spots", 180));
        const spotSize = num(p, "spotSize", 1) * 20 * s;
        const beams = num(p, "beams", 0.35);
        ctx.globalCompositeOperation = "lighter";
        const beamPaths = palette.map(() => new Path2D());
        for (let k = 0; k < nSpots; k++) {
          const az = hash01(k * 3 + 1) * Math.PI * 2 + rot;
          const front = Math.cos(az);
          if (front < -0.15) continue; // 裏側（見えない壁）
          const el = (hash01(k * 3 + 2) - 0.25) * 1.3; // 主に球より下に散らばる
          const x = cx + Math.sin(az) * W * 0.8;
          const y = cy + el * H * 0.95;
          if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
          const vis = Math.max(0, front + 0.15) / 1.15;
          const tw = 0.65 + 0.35 * Math.sin(t * (2 + hash01(k * 3 + 3) * 5) + k);
          const col = palette[k % palette.length];
          const size = spotSize * (0.6 + hash01(k * 7 + 5) * 0.8) * (0.7 + vis * 0.5);
          // 斜めに当たる端の光は横に伸びる
          const stretch = 1 + (1 - vis) * 1.6;
          ctx.globalAlpha = Math.min(1, vis * tw * 0.9 * boost);
          ctx.drawImage(sprites.tintedGlow(col), x - size * stretch, y - size, size * 2 * stretch, size * 2);
          // くっきりした芯（鏡の反射らしい硬い光）
          ctx.globalAlpha = Math.min(1, vis * tw * boost);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(x, y, size * 0.32 * stretch, size * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          if (beams > 0 && k % 3 === 0) {
            beamPaths[k % palette.length].moveTo(cx, cy);
            beamPaths[k % palette.length].lineTo(x, y);
          }
        }
        // 光線（球から粒へ伸びる細い光）
        if (beams > 0) {
          ctx.globalAlpha = Math.min(1, beams * 0.3 * boost);
          ctx.lineWidth = 3 * s;
          palette.forEach((c, i) => {
            ctx.strokeStyle = c;
            ctx.stroke(beamPaths[i]);
          });
        }

        // ---- 吊り下げのワイヤー ----
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#5a5f6b";
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, cy - R);
        ctx.stroke();
        ctx.fillStyle = "#3a3e47";
        ctx.fillRect(cx - R * 0.08, cy - R - R * 0.12, R * 0.16, R * 0.14);

        // ---- 球（下地） ----
        ctx.globalAlpha = 1;
        const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
        body.addColorStop(0, "#6b7080");
        body.addColorStop(1, "#14161c");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // ---- 鏡のタイル（見えている半球だけ） ----
        const shadePaths = Array.from({ length: SHADES }, () => new Path2D());
        const glints: [number, number, number][] = [];
        const tileH = (Math.PI * R) / LAT;
        for (let i = 0; i < LAT; i++) {
          const phi = -Math.PI / 2 + ((i + 0.5) / LAT) * Math.PI;
          const ringR = R * Math.cos(phi);
          const y = cy + R * Math.sin(phi);
          const n = Math.max(6, Math.round(LAT * 2 * Math.cos(phi)));
          for (let j = 0; j < n; j++) {
            const lon = (j / n) * Math.PI * 2 + rot;
            const c = Math.cos(lon);
            if (c <= 0.02) continue;
            const x = cx + ringR * Math.sin(lon);
            const w = ((Math.PI * 2 * ringR) / n) * c;
            // 光源との向き + タイルごとのわずかな傾き（ランダム）で明るさが決まる
            const light = Math.max(0, Math.cos(lon - LIGHT_LON) * 0.6 + (-Math.sin(phi) + 0.2) * 0.5);
            const jitter = hash01(i * 131 + j * 7);
            let b = 0.25 + light * 0.5 + jitter * 0.3;
            // 回転に合わせて光源の正反射を通るタイルがきらっと光る
            const spec = Math.pow(Math.max(0, Math.cos((lon - LIGHT_LON) * 3 + jitter * 6)), 30);
            b += spec * 0.8;
            const lv = Math.min(SHADES - 1, Math.floor(Math.min(1, b) * SHADES));
            shadePaths[lv].rect(x - w / 2 + 0.5, y - tileH / 2 + 0.5, Math.max(0.5, w - 1.2), tileH - 1.2);
            if (spec > 0.85 && jitter < 0.35) glints.push([x, y, spec]);
          }
        }
        for (let lv = 0; lv < SHADES; lv++) {
          const l = 18 + (lv / (SHADES - 1)) * 80;
          ctx.fillStyle = `hsl(220 10% ${l}%)`;
          ctx.fill(shadePaths[lv]);
        }
        // 球の陰影（右下を暗く）
        const shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
        shade.addColorStop(0, "rgba(0,0,0,0)");
        shade.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // ---- きらめき（十字の光芒） ----
        ctx.globalCompositeOperation = "lighter";
        for (const [x, y, sp] of glints.slice(0, 10)) {
          const a = Math.min(1, sp * 0.8 * boost);
          const len = R * (0.35 + f.kick * 0.5 * flash);
          ctx.globalAlpha = a;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x - len, y - 0.8 * s, len * 2, 1.6 * s);
          ctx.fillRect(x - 0.8 * s, y - len, 1.6 * s, len * 2);
          const g = R * 0.25;
          ctx.drawImage(sprites.glow, x - g, y - g, g * 2, g * 2);
        }
        ctx.restore();
      },
    };
  },
};
