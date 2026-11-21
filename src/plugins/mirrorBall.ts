import { mirrorBallLayout, mirrorBallMeta } from "./catalog";
import { hash01 } from "./rng";
import { num, str, type VisualizerPlugin } from "./types";

/**
 * ミラーボール（光学的な反射の計算つき）。
 *
 * 座標系: ボールの中心が原点、半径 1。+x 右、+y 上、+z カメラ側。
 * - タイルの法線 n をボールの回転（鉛直軸）と揺れ（傾き）で回す
 * - 光源ごとに、ボールへ入る光の向き d に対する反射 r = d − 2(d·n)n を求める
 * - 反射光が部屋（箱）の壁・床・天井に当たる点を求め、カメラから見た画面座標へ透視投影する
 * そのため光の粒は光源ごと・タイルごとに別々の向きへ動く（奥の壁では横、床・天井では弧を描く）。
 * 回転角・揺れは時刻から決まる（状態なし、書き出しと一致）。
 */

export type Vec3 = [number, number, number];

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** 入射方向 d（光の進む向き）を法線 n の鏡で反射した向き */
export function reflect(d: Vec3, n: Vec3): Vec3 {
  const k = 2 * dot(d, n);
  return [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]];
}

/** 部屋（箱）の大きさ（ボール半径 = 1 の単位） */
export type Room = { halfW: number; ceil: number; floor: number; back: number; cam: number };

export function makeRoom(scale: number): Room {
  return { halfW: 13 * scale, ceil: 3.5 * scale, floor: -15 * scale, back: -14 * scale, cam: 18 * scale };
}

/** 原点から向き r に進んだ光が部屋の面に当たる点と、その面の法線。カメラ側（手前の壁）は null */
export function hitRoom(r: Vec3, room: Room): { p: Vec3; n: Vec3; dist: number } | null {
  let best = Infinity;
  let n: Vec3 = [0, 0, 1];
  const test = (t: number, nn: Vec3) => {
    if (t > 0 && t < best) {
      best = t;
      n = nn;
    }
  };
  if (r[0] > 1e-6) test(room.halfW / r[0], [-1, 0, 0]);
  if (r[0] < -1e-6) test(-room.halfW / r[0], [1, 0, 0]);
  if (r[1] > 1e-6) test(room.ceil / r[1], [0, -1, 0]);
  if (r[1] < -1e-6) test(room.floor / r[1], [0, 1, 0]);
  if (r[2] < -1e-6) test(room.back / r[2], [0, 0, 1]);
  if (r[2] > 1e-6 && room.cam / r[2] < best) return null; // カメラの後ろ（手前の壁）に当たる
  if (!Number.isFinite(best)) return null;
  return { p: [r[0] * best, r[1] * best, r[2] * best], n, dist: best };
}

/** ボールの回転（鉛直軸まわり θ）と揺れ（x 軸まわり tilt）を法線に適用 */
export function rotateNormal(n: Vec3, theta: number, tilt: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const x = n[0] * c + n[2] * s;
  const z = -n[0] * s + n[2] * c;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return [x, n[1] * ct - z * st, n[1] * st + z * ct];
}

/** 光源の基本配置（方位角・仰角, 度）。ボールから見た光源の向き。光源の向き・高さで回す */
const LIGHT_PRESETS: [number, number][] = [
  [-38, -20],
  [42, -10],
  [-4, -55],
  [150, 15],
];

export function lightDirections(count: number, angleDeg: number, height: number): Vec3[] {
  return LIGHT_PRESETS.slice(0, Math.max(1, Math.min(4, count))).map(([az, el]) => {
    const a = ((az + angleDeg) * Math.PI) / 180;
    const e = ((el + height * 35) * Math.PI) / 180;
    return norm([Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]);
  });
}

/** タイルの基本法線（緯度 rows 段、各段は周長に比例した枚数）＋製造誤差の微小な傾き */
export function tileNormals(rows: number): { n: Vec3; id: number }[] {
  const out: { n: Vec3; id: number }[] = [];
  for (let i = 0; i < rows; i++) {
    const phi = -Math.PI / 2 + ((i + 0.5) / rows) * Math.PI;
    const count = Math.max(6, Math.round(rows * 2 * Math.cos(phi)));
    for (let j = 0; j < count; j++) {
      const id = i * 1000 + j;
      const lam = (j / count) * Math.PI * 2 + (i % 2) * (Math.PI / count);
      const jp = (hash01(id * 3 + 1) - 0.5) * 0.05;
      const jl = (hash01(id * 3 + 2) - 0.5) * 0.05;
      const ph = phi + jp;
      const la = lam + jl;
      out.push({ n: [Math.cos(ph) * Math.sin(la), Math.sin(ph), Math.cos(ph) * Math.cos(la)], id });
    }
  }
  return out;
}

const PALETTES: Record<string, string[]> = {
  white: ["#ffffff", "#f4f7ff", "#ffffff", "#eef3ff"],
  rainbow: ["#ff4d6d", "#3ef2ff", "#ffd23f", "#b56bff"],
  warm: ["#ffe2a8", "#ffd27a", "#fff1d0", "#ffc864"],
};

export const mirrorBall: VisualizerPlugin = {
  ...mirrorBallMeta,
  create() {
    let tiles: { n: Vec3; id: number }[] = [];
    let rowsKey = -1;
    return {
      render(ctx, frame, p) {
        const { width: W, height: H, t, features: f, sprites } = frame;
        const { R, cx, cy } = mirrorBallLayout(p, W, H);
        const rows = Math.round(num(p, "tiles", 16));
        if (rows !== rowsKey) {
          rowsKey = rows;
          tiles = tileNormals(rows);
        }
        const theta = t * num(p, "speed", 0.08) * Math.PI * 2;
        const wob = num(p, "wobble", 0.25);
        const tilt = wob * 0.12 * Math.sin(t * 0.7) + wob * 0.05 * Math.sin(t * 1.9 + 1);
        const lights = lightDirections(Math.round(num(p, "lights", 3)), num(p, "lightAngle", 0), num(p, "lightHeight", -0.4));
        const palette = PALETTES[str(p, "colors", "white")] ?? PALETTES.white;
        const flash = num(p, "flash", 0.6);
        const boost = 1 + flash * (f.kick * 1.2 + f.bass * 0.3);
        const room = makeRoom(num(p, "room", 1));
        const focal = R * room.cam; // ボール半径が画面で R px になる焦点距離
        const amount = num(p, "amount", 0.6);
        const spotScale = num(p, "spotSize", 1);
        const beams = num(p, "beams", 0.35);
        const s = H / 1080;

        /** 部屋の点を画面へ（カメラは z = room.cam から -z 方向を見る） */
        const project = (q: Vec3): [number, number, number] | null => {
          const depth = room.cam - q[2];
          if (depth <= 0.5) return null;
          return [cx + (focal * q[0]) / depth, cy - (focal * q[1]) / depth, depth];
        };

        ctx.save();
        const darken = num(p, "darken", 0.4);
        if (darken > 0) {
          ctx.globalAlpha = darken;
          ctx.fillStyle = "#03030a";
          ctx.fillRect(0, 0, W, H);
        }

        // ---- 光源からボールへの光（スポットライトの光束） ----
        ctx.globalCompositeOperation = "lighter";
        if (beams > 0) {
          lights.forEach((l, li) => {
            const src = project([l[0] * 30, l[1] * 30, l[2] * 30]);
            const from: [number, number] = src ? [src[0], src[1]] : [cx + l[0] * W, cy - l[1] * W];
            const gr = ctx.createLinearGradient(from[0], from[1], cx, cy);
            gr.addColorStop(0, "rgba(255,255,255,0)");
            gr.addColorStop(1, palette[li % palette.length]);
            ctx.globalAlpha = beams * 0.18;
            ctx.fillStyle = gr;
            const nx = -(cy - from[1]);
            const ny = cx - from[0];
            const nl = Math.hypot(nx, ny) || 1;
            const wFrom = R * 1.6;
            ctx.beginPath();
            ctx.moveTo(from[0] + (nx / nl) * wFrom, from[1] + (ny / nl) * wFrom);
            ctx.lineTo(cx + (nx / nl) * R * 0.9, cy + (ny / nl) * R * 0.9);
            ctx.lineTo(cx - (nx / nl) * R * 0.9, cy - (ny / nl) * R * 0.9);
            ctx.lineTo(from[0] - (nx / nl) * wFrom, from[1] - (ny / nl) * wFrom);
            ctx.closePath();
            ctx.fill();
          });
        }

        // ---- 反射光の粒（光源 × タイル） ----
        const beamPaths = lights.map(() => new Path2D());
        const glints: [number, number, number][] = [];
        const view: Vec3 = [0, 0, 1];
        for (const tile of tiles) {
          const n = rotateNormal(tile.n, theta, tilt);
          lights.forEach((l, li) => {
            const lambert = dot(n, l);
            if (lambert <= 0.05) return; // 光が当たっていない面
            const r = reflect([-l[0], -l[1], -l[2]], n);
            // ボール上のきらめき: 反射がカメラへ向かうタイル
            if (n[2] > 0) {
              const toCam = dot(r, view);
              if (toCam > 0.985) glints.push([cx + n[0] * R, cy - n[1] * R, (toCam - 0.985) / 0.015]);
            }
            if (hash01(tile.id * 7 + li * 13) > amount) return;
            const hit = hitRoom(r, room);
            if (!hit) return;
            const sp = project(hit.p);
            if (!sp) return;
            const [x, y, depth] = sp;
            if (x < -80 || x > W + 80 || y < -80 || y > H + 80) return;
            // 遠くへ飛んだ光ほど広がる。面を斜めから見ると潰れる
            const size = ((hit.dist * 0.03 * focal) / depth) * spotScale * (0.85 + hash01(tile.id) * 0.3);
            const toCamera = norm([0 - hit.p[0], 0 - hit.p[1], room.cam - hit.p[2]]);
            const squash = Math.max(0.25, Math.abs(dot(toCamera, hit.n)));
            const sx = hit.n[0] !== 0 ? size * squash : size;
            const sy = hit.n[1] !== 0 ? size * squash : size;
            const tw = 0.75 + 0.25 * Math.sin(t * 3 + tile.id);
            const a = Math.min(1, lambert * tw * boost * Math.min(1, 9 / hit.dist + 0.35));
            const col = palette[li % palette.length];
            ctx.globalAlpha = a * 0.5;
            ctx.drawImage(sprites.tintedGlow(col), x - sx * 1.4, y - sy * 1.4, sx * 2.8, sy * 2.8);
            ctx.globalAlpha = a;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(x, y, Math.max(0.8, sx * 0.45), Math.max(0.8, sy * 0.45), 0, 0, Math.PI * 2);
            ctx.fill();
            if (beams > 0 && hash01(tile.id * 5 + li) < 0.25) {
              beamPaths[li].moveTo(cx + n[0] * R, cy - n[1] * R);
              beamPaths[li].lineTo(x, y);
            }
          });
        }
        if (beams > 0) {
          ctx.lineWidth = 1.6 * s;
          ctx.globalAlpha = Math.min(1, beams * 0.22 * boost);
          lights.forEach((_, li) => {
            ctx.strokeStyle = palette[li % palette.length];
            ctx.stroke(beamPaths[li]);
          });
        }

        // ---- ワイヤーと球 ----
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#5a5f6b";
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, cy - R);
        ctx.stroke();
        ctx.fillStyle = "#3a3e47";
        ctx.fillRect(cx - R * 0.08, cy - R - R * 0.12, R * 0.16, R * 0.14);
        ctx.globalAlpha = 1;
        const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
        body.addColorStop(0, "#5c6170");
        body.addColorStop(1, "#111318");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // タイル（カメラ側だけ）。明るさ = 周囲の映り込み + 光源の当たり具合、段階ごとに 1 パス
        const SH = 7;
        const shadePaths = Array.from({ length: SH }, () => new Path2D());
        const tileH = (Math.PI * R) / rows;
        for (const tile of tiles) {
          const n = rotateNormal(tile.n, theta, tilt);
          if (n[2] <= 0.05) continue;
          let lit = 0;
          for (const l of lights) lit = Math.max(lit, dot(n, l));
          const b = 0.2 + Math.max(0, lit) * 0.45 + hash01(tile.id * 11) * 0.3 + Math.max(0, n[1]) * 0.1;
          const lv = Math.min(SH - 1, Math.floor(Math.min(0.999, b) * SH));
          // 球の縁ほどタイルは潰れて見える（横は経度方向、縦は緯度方向の傾き）
          const horiz = Math.hypot(n[0], n[2]);
          const w = tileH * Math.max(0.15, horiz > 0 ? n[2] / horiz : 1);
          const h = tileH * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - n[1] * n[1])));
          shadePaths[lv].rect(cx + n[0] * R - w / 2 + 0.5, cy - n[1] * R - h / 2 + 0.5, Math.max(0.5, w - 1), Math.max(0.5, h - 1));
        }
        for (let lv = 0; lv < SH; lv++) {
          ctx.fillStyle = `hsl(220 8% ${16 + (lv / (SH - 1)) * 78}%)`;
          ctx.fill(shadePaths[lv]);
        }
        const shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
        shade.addColorStop(0, "rgba(0,0,0,0)");
        shade.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // きらめき（光源の反射がちょうどカメラへ来たタイル）
        ctx.globalCompositeOperation = "lighter";
        glints.sort((a, b) => b[2] - a[2]);
        for (const [x, y, k] of glints.slice(0, 12)) {
          const a = Math.min(1, (0.4 + k * 0.6) * boost);
          const len = R * (0.3 + k * 0.4 + f.kick * 0.4 * flash);
          ctx.globalAlpha = a;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x - len, y - 0.8 * s, len * 2, 1.6 * s);
          ctx.fillRect(x - 0.8 * s, y - len, 1.6 * s, len * 2);
          const g = R * 0.22;
          ctx.drawImage(sprites.glow, x - g, y - g, g * 2, g * 2);
        }
        ctx.restore();
      },
    };
  },
};
