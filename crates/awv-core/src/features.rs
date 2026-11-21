//! 音声特徴量の純粋関数群（WASM / ネイティブ両方でテスト可能）。

/// 帯域エネルギー（各帯域の RMS 振幅）。
#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub struct Bands {
    pub sub: f32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
}

/// 帯域の境界（Hz）。
pub const SUB_MAX_HZ: f32 = 60.0;
pub const BASS_MAX_HZ: f32 = 250.0;
pub const MID_MAX_HZ: f32 = 4000.0;
pub const HIGH_MAX_HZ: f32 = 16000.0;

pub fn hann_window(n: usize) -> Vec<f32> {
    if n == 1 {
        return vec![1.0];
    }
    (0..n)
        .map(|i| {
            let x = std::f32::consts::TAU * i as f32 / (n as f32 - 1.0);
            0.5 - 0.5 * x.cos()
        })
        .collect()
}

fn rms(slice: &[f32]) -> f32 {
    if slice.is_empty() {
        return 0.0;
    }
    (slice.iter().map(|v| v * v).sum::<f32>() / slice.len() as f32).sqrt()
}

/// 振幅スペクトルから帯域エネルギーを求める。
pub fn band_energies(magnitudes: &[f32], sample_rate: f32, fft_size: usize) -> Bands {
    let hz_per_bin = sample_rate / fft_size as f32;
    let last = magnitudes.len();
    let bin = |hz: f32| ((hz / hz_per_bin).round() as usize).clamp(1, last);
    let (s, b, m, h) = (bin(SUB_MAX_HZ), bin(BASS_MAX_HZ), bin(MID_MAX_HZ), bin(HIGH_MAX_HZ));
    Bands {
        sub: rms(&magnitudes[1.min(s)..s]),
        bass: rms(&magnitudes[s..b.max(s)]),
        mid: rms(&magnitudes[b..m.max(b)]),
        high: rms(&magnitudes[m..h.max(m)]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Analyzer;

    fn sine(freq: f32, sr: f32, n: usize) -> Vec<f32> {
        (0..n).map(|i| (std::f32::consts::TAU * freq * i as f32 / sr).sin()).collect()
    }

    fn analyze(signal: &[f32], sr: f32) -> Analyzer {
        let mut a = Analyzer::new(signal.len(), sr);
        a.input.copy_from_slice(signal);
        a.analyze();
        a
    }

    #[test]
    fn hann_endpoints_are_zero() {
        let w = hann_window(8);
        assert!(w[0].abs() < 1e-6 && w[7].abs() < 1e-6);
    }

    #[test]
    fn full_scale_sine_peaks_near_one() {
        let sr = 48000.0;
        let n = 2048;
        // ビンの中心に乗る周波数
        let freq = 40.0 * sr / n as f32;
        let a = analyze(&sine(freq, sr, n), sr);
        let peak = a.magnitudes.iter().cloned().fold(0.0, f32::max);
        assert!((peak - 1.0).abs() < 0.05, "peak={peak}");
    }

    #[test]
    fn bass_tone_lands_in_bass_band() {
        let sr = 48000.0;
        let a = analyze(&sine(120.0, sr, 4096), sr);
        assert!(a.bass() > a.mid() * 5.0 && a.bass() > a.high() * 5.0, "{:?}", a.bands);
    }

    #[test]
    fn high_tone_lands_in_high_band() {
        let sr = 48000.0;
        let a = analyze(&sine(8000.0, sr, 4096), sr);
        assert!(a.high() > a.bass() * 5.0 && a.high() > a.mid() * 5.0, "{:?}", a.bands);
    }

    #[test]
    fn silence_is_zero() {
        let a = analyze(&vec![0.0; 1024], 44100.0);
        assert_eq!(a.bands, Bands::default());
    }
}
