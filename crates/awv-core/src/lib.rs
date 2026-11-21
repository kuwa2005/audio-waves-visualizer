//! Audio Waves Visualizer の高速処理コア。
//!
//! 方針: JS とのやり取りは「WASM メモリ上のバッファを JS 側から直接ビューで読む」ゼロコピー方式。
//! 毎フレームの配列コピーや確保をしない。

pub mod features;
pub mod particles;
pub mod track;
pub mod wav;

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

/// 読み込んだ曲（モノラル PCM）と、その事前解析結果を WASM メモリ上に保持する。
/// 描画時は `spectrum_at(秒)` でその時刻のスペクトルを求める（時刻だけで結果が決まる＝決定的）。
#[wasm_bindgen]
pub struct Track {
    pcm: Vec<f32>,
    analysis: track::TrackAnalysis,
    analyzer: Analyzer,
}

#[wasm_bindgen]
impl Track {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32, length: usize) -> Track {
        Track {
            pcm: vec![0.0; length],
            analysis: track::TrackAnalysis { sample_rate, hop: track::HOP, ..Default::default() },
            analyzer: Analyzer::new(track::FFT_SIZE, sample_rate),
        }
    }

    /// JS 側がモノラル PCM を書き込む先（長さ length）
    pub fn pcm_ptr(&mut self) -> *mut f32 {
        self.pcm.as_mut_ptr()
    }

    pub fn analyze(&mut self) {
        self.analysis = track::analyze_track(&self.pcm, self.analysis.sample_rate);
    }

    pub fn duration(&self) -> f32 {
        self.pcm.len() as f32 / self.analysis.sample_rate
    }
    pub fn frames(&self) -> usize {
        self.analysis.frames
    }
    pub fn frame_rate(&self) -> f32 {
        self.analysis.frame_rate()
    }
    /// フレーム i の中心時刻 = i / frame_rate + center_offset
    pub fn center_offset(&self) -> f32 {
        (track::FFT_SIZE as f32 / 2.0) / self.analysis.sample_rate
    }
    pub fn bpm(&self) -> f32 {
        self.analysis.bpm
    }
    pub fn beat_count(&self) -> usize {
        self.analysis.beats.len()
    }
    pub fn beats_ptr(&self) -> *const f32 {
        self.analysis.beats.as_ptr()
    }
    pub fn rms_ptr(&self) -> *const f32 {
        self.analysis.rms.as_ptr()
    }
    pub fn onset_ptr(&self) -> *const f32 {
        self.analysis.onset.as_ptr()
    }
    /// [sub, bass, mid, high] × frames
    pub fn bands_ptr(&self) -> *const f32 {
        self.analysis.bands.as_ptr()
    }

    /// 時刻 t（秒）を中心とした窓でスペクトルを計算する。結果は magnitudes_ptr から読む。
    pub fn spectrum_at(&mut self, t: f32) {
        let n = track::FFT_SIZE as isize;
        let center = (t * self.analysis.sample_rate) as isize;
        let start = center - n / 2;
        let len = self.pcm.len() as isize;
        for i in 0..n {
            let s = start + i;
            self.analyzer.input[i as usize] = if s >= 0 && s < len { self.pcm[s as usize] } else { 0.0 };
        }
        self.analyzer.analyze();
    }
    pub fn magnitudes_ptr(&self) -> *const f32 {
        self.analyzer.magnitudes_ptr()
    }
    pub fn bin_count(&self) -> usize {
        self.analyzer.bin_count()
    }
}
