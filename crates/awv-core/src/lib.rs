//! Audio Waves Visualizer の高速処理コア。
//!
//! 方針: JS とのやり取りは「WASM メモリ上のバッファを JS 側から直接ビューで読む」ゼロコピー方式。
//! 毎フレームの配列コピーや確保をしない。

pub mod features;

use realfft::{RealFftPlanner, RealToComplex};
use std::sync::Arc;
use wasm_bindgen::prelude::*;

pub use features::{Bands, band_energies, hann_window};

/// FFT 解析器。入力・出力バッファを内部に持ち、毎フレームの確保をしない。
#[wasm_bindgen]
pub struct Analyzer {
    fft: Arc<dyn RealToComplex<f32>>,
    window: Vec<f32>,
    input: Vec<f32>,
    scratch_in: Vec<f32>,
    spectrum: Vec<realfft::num_complex::Complex<f32>>,
    fft_scratch: Vec<realfft::num_complex::Complex<f32>>,
    magnitudes: Vec<f32>,
    sample_rate: f32,
    bands: Bands,
}

#[wasm_bindgen]
impl Analyzer {
    /// `fft_size` は 2 のべき乗（例: 2048）。
    #[wasm_bindgen(constructor)]
    pub fn new(fft_size: usize, sample_rate: f32) -> Analyzer {
        assert!(fft_size.is_power_of_two() && fft_size >= 64, "fft_size must be a power of two >= 64");
        let mut planner = RealFftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(fft_size);
        let spectrum = fft.make_output_vec();
        let fft_scratch = fft.make_scratch_vec();
        let bins = spectrum.len();
        Analyzer {
            fft,
            window: hann_window(fft_size),
            input: vec![0.0; fft_size],
            scratch_in: vec![0.0; fft_size],
            spectrum,
            fft_scratch,
            magnitudes: vec![0.0; bins],
            sample_rate,
            bands: Bands::default(),
        }
    }

    pub fn fft_size(&self) -> usize {
        self.input.len()
    }

    pub fn bin_count(&self) -> usize {
        self.magnitudes.len()
    }

    /// JS 側が時間領域サンプルを書き込む先（長さ fft_size）。
    pub fn input_ptr(&mut self) -> *mut f32 {
        self.input.as_mut_ptr()
    }

    /// 解析結果の振幅スペクトル（長さ bin_count、0..1 目安に正規化済み）。
    pub fn magnitudes_ptr(&self) -> *const f32 {
        self.magnitudes.as_ptr()
    }

    /// input バッファの内容を解析する。
    pub fn analyze(&mut self) {
        for ((dst, &src), &w) in self.scratch_in.iter_mut().zip(&self.input).zip(&self.window) {
            *dst = src * w;
        }
        self.fft
            .process_with_scratch(&mut self.scratch_in, &mut self.spectrum, &mut self.fft_scratch)
            .expect("fft buffer sizes are fixed at construction");
        // Hann 窓のコヒーレントゲイン（0.5）と FFT サイズで正規化
        let norm = 2.0 / (self.input.len() as f32 * 0.5);
        for (m, c) in self.magnitudes.iter_mut().zip(&self.spectrum) {
            *m = (c.norm() * norm).min(1.0);
        }
        self.bands = band_energies(&self.magnitudes, self.sample_rate, self.input.len());
    }

    pub fn sub(&self) -> f32 {
        self.bands.sub
    }
    pub fn bass(&self) -> f32 {
        self.bands.bass
    }
    pub fn mid(&self) -> f32 {
        self.bands.mid
    }
    pub fn high(&self) -> f32 {
        self.bands.high
    }
}
