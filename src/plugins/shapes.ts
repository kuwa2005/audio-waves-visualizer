/** 図形のパス（中心 0,0・大きさ 1 の単位図形。描くときに translate / scale する） */

/** ハート（上のくぼみが y≈-0.35、下の先端が y=0.6） */
export function heartPath(p: Path2D | OffscreenCanvasRenderingContext2D): void {
  p.moveTo(0, 0.6);
  p.bezierCurveTo(-0.15, 0.45, -0.75, 0.1, -0.75, -0.25);
  p.bezierCurveTo(-0.75, -0.6, -0.3, -0.75, 0, -0.38);
  p.bezierCurveTo(0.3, -0.75, 0.75, -0.6, 0.75, -0.25);
  p.bezierCurveTo(0.75, 0.1, 0.15, 0.45, 0, 0.6);
  p.closePath();
}

/** 星（points 個の頂点、内側の半径比 inner） */
export function starPath(p: Path2D | OffscreenCanvasRenderingContext2D, points = 5, inner = 0.45): void {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
}

/** 猫の手（肉球）: 大きな掌球 1 つと指球 4 つ */
export function pawPath(p: Path2D | OffscreenCanvasRenderingContext2D): void {
  // 掌球（下がふくらんだ丸い三角）
  p.moveTo(0, -0.02);
  p.bezierCurveTo(0.28, -0.02, 0.5, 0.25, 0.42, 0.48);
  p.bezierCurveTo(0.36, 0.66, 0.15, 0.62, 0, 0.6);
  p.bezierCurveTo(-0.15, 0.62, -0.36, 0.66, -0.42, 0.48);
  p.bezierCurveTo(-0.5, 0.25, -0.28, -0.02, 0, -0.02);
  p.closePath();
  // 指球（外側ほど低い位置に、少し外向きの楕円）
  const toes: [number, number, number][] = [
    [-0.52, -0.2, -0.5],
    [-0.19, -0.45, -0.15],
    [0.19, -0.45, 0.15],
    [0.52, -0.2, 0.5],
  ];
  for (const [x, y, rot] of toes) {
    p.moveTo(x + Math.cos(rot) * 0.15, y + Math.sin(rot) * 0.15);
    p.ellipse(x, y, 0.15, 0.2, rot, 0, Math.PI * 2);
  }
}
