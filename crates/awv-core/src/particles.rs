//! パーティクル・ギャラクシー（数万粒）のシミュレーションとラスタライズ。
//!
//! Canvas 2D で数万回 drawImage すると重いので、WASM で低解像度の RGBA バッファに加算描画し、
//! JS 側は putImageData 1 回 + 拡大 drawImage 1 回で済ませる。拡大時のぼけが自然な発光になる。

use wasm_bindgen::prelude::*;

/// 決定的な乱数（xorshift32）
struct Rng(u32);
impl Rng {
    fn next_f32(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x >> 8) as f32 / (1u32 << 24) as f32
    }
}

#[wasm_bindgen]
pub struct Galaxy {
    n: usize,
    /// 位置（中心原点、単位は短辺の半分 = 1.0）
    x: Vec<f32>,
    y: Vec<f32>,
    vx: Vec<f32>,
    vy: Vec<f32>,
    /// 本来の軌道半径（ここへ引き戻される）
    home: Vec<f32>,
    /// 0..1 の色位置（内側→外側）
    tone: Vec<f32>,
    w: usize,
    h: usize,
    buf: Vec<u8>,
}

#[wasm_bindgen]
impl Galaxy {
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize, w: usize, h: usize, seed: u32) -> Galaxy {
        let mut rng = Rng(seed.max(1));
        let mut g = Galaxy {
            n,
            x: vec![0.0; n],
            y: vec![0.0; n],
            vx: vec![0.0; n],
            vy: vec![0.0; n],
            home: vec![0.0; n],
            tone: vec![0.0; n],
            w,
            h,
            buf: vec![0; w * h * 4],
        };
        let arms = 3.0f32;
        for i in 0..n {
            // 渦巻き腕に沿って配置（中心ほど密）
            let r = (0.03 + rng.next_f32().powf(1.4) * 0.97 + (rng.next_f32() - 0.5) * 0.08).clamp(0.02, 1.05);
            let arm = (rng.next_f32() * arms).floor() / arms * std::f32::consts::TAU;
            // 腕の幅: ガウス風に散らす（2 つの一様乱数の和）。一部は腕の外にばらまいて「ハロー」にする
            let spread = if rng.next_f32() < 0.2 { 1.6 } else { 0.42 };
            let jitter = (rng.next_f32() + rng.next_f32() - 1.0) * spread;
            let a = arm + r * 3.4 + jitter * (1.0 - r * 0.4);
            g.x[i] = a.cos() * r;
            g.y[i] = a.sin() * r;
            g.home[i] = r;
            g.tone[i] = (r + (rng.next_f32() - 0.5) * 0.15).clamp(0.0, 1.0);
        }
        g
    }

    pub fn width(&self) -> usize {
        self.w
    }
    pub fn height(&self) -> usize {
        self.h
    }
    pub fn buf_ptr(&self) -> *const u8 {
        self.buf.as_ptr()
    }

    /// 1 ステップ進める。kick（0..1）で外向きに爆発、bass で回転が速くなる。
    pub fn step(&mut self, dt: f32, bass: f32, kick: f32, swirl: f32, explode: f32) {
        let dt = dt.clamp(0.0, 0.05);
        let spin = swirl * (0.35 + bass * 1.2);
        // 強いキックの瞬間だけ大きく膨らむ（3 乗で弱い拍は抑える）
        let burst = explode * kick * kick * kick * 1.6;
        for i in 0..self.n {
            let (px, py) = (self.x[i], self.y[i]);
            let r = (px * px + py * py).sqrt().max(1e-4);
            let (ux, uy) = (px / r, py / r);
            // 公転（内側ほど速い）
            let w = spin / r.sqrt();
            let tx = -uy * w * r;
            let ty = ux * w * r;
            // 本来の半径へ引き戻すバネ + 爆発
            let pull = (self.home[i] - r) * 5.0 + burst * (0.3 + self.home[i]);
            self.vx[i] += (ux * pull) * dt * 6.0;
            self.vy[i] += (uy * pull) * dt * 6.0;
            // 減衰
            let damp = (-4.0 * dt).exp();
            self.vx[i] *= damp;
            self.vy[i] *= damp;
            self.x[i] = px + (tx + self.vx[i]) * dt;
            self.y[i] = py + (ty + self.vy[i]) * dt;
        }
    }

    /// バッファへ加算描画する。trail（0..1）で前フレームを残す（残像）。
    /// 色は内側 (r0,g0,b0) → 外側 (r1,g1,b1) のグラデーション、gain は 1 粒の明るさ。
    #[allow(clippy::too_many_arguments)]
    pub fn render(&mut self, trail: f32, zoom: f32, r0: u8, g0: u8, b0: u8, r1: u8, g1: u8, b1: u8, gain: f32) {
        let keep = (trail.clamp(0.0, 0.98) * 256.0) as u32;
        if keep == 0 {
            self.buf.fill(0);
        } else {
            for v in self.buf.iter_mut() {
                *v = ((*v as u32 * keep) >> 8) as u8;
            }
        }
        let (w, h) = (self.w as f32, self.h as f32);
        let s = w.min(h) * 0.5 * zoom;
        let (cx, cy) = (w * 0.5, h * 0.5);
        let g = gain.clamp(0.0, 8.0);
        for i in 0..self.n {
            let sx = cx + self.x[i] * s;
            let sy = cy + self.y[i] * s;
            if sx < 0.0 || sy < 0.0 || sx >= w - 1.0 || sy >= h - 1.0 {
                continue;
            }
            let t = self.tone[i];
            let cr = (r0 as f32 + (r1 as f32 - r0 as f32) * t) * g;
            let cg = (g0 as f32 + (g1 as f32 - g0 as f32) * t) * g;
            let cb = (b0 as f32 + (b1 as f32 - b0 as f32) * t) * g;
            // バイリニアで 4 画素に分配（ちらつき防止）
            let (ix, iy) = (sx as usize, sy as usize);
            let (fx, fy) = (sx - ix as f32, sy - iy as f32);
            let ws = [(1.0 - fx) * (1.0 - fy), fx * (1.0 - fy), (1.0 - fx) * fy, fx * fy];
            let offs = [0usize, 1, self.w, self.w + 1];
            for k in 0..4 {
                let o = ((iy * self.w + ix) + offs[k]) * 4;
                let wk = ws[k];
                self.buf[o] = (self.buf[o] as f32 + cr * wk).min(255.0) as u8;
                self.buf[o + 1] = (self.buf[o + 1] as f32 + cg * wk).min(255.0) as u8;
                self.buf[o + 2] = (self.buf[o + 2] as f32 + cb * wk).min(255.0) as u8;
                self.buf[o + 3] = 255;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_and_draws_something() {
        let mut a = Galaxy::new(5000, 160, 90, 7);
        let mut b = Galaxy::new(5000, 160, 90, 7);
        for i in 0..30 {
            let k = if i % 10 == 0 { 1.0 } else { 0.2 };
            a.step(1.0 / 60.0, 0.5, k, 1.0, 1.0);
            b.step(1.0 / 60.0, 0.5, k, 1.0, 1.0);
        }
        a.render(0.0, 1.0, 255, 120, 220, 60, 200, 255, 1.0);
        b.render(0.0, 1.0, 255, 120, 220, 60, 200, 255, 1.0);
        assert_eq!(a.buf, b.buf);
        let lit = a.buf.chunks(4).filter(|p| p[0] > 0 || p[2] > 0).count();
        assert!(lit > 500, "lit={lit}");
    }

    #[test]
    fn particles_stay_bounded_under_repeated_kicks() {
        let mut g = Galaxy::new(2000, 64, 64, 3);
        for _ in 0..600 {
            g.step(1.0 / 60.0, 1.0, 1.0, 1.0, 1.0);
        }
        let max_r = (0..g.n).map(|i| (g.x[i] * g.x[i] + g.y[i] * g.y[i]).sqrt()).fold(0.0, f32::max);
        assert!(max_r.is_finite() && max_r < 10.0, "max_r={max_r}");
    }
}
