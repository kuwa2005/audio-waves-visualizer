//! 曲全体の事前解析（読み込み時に1回だけ実行）。
//!
//! - フレームごと（hop 512 サンプル）の帯域エネルギー・RMS・オンセット強度
//! - テンポ推定（オンセット包絡の自己相関）
//! - ビート位置（動的計画法によるビートトラッキング: Ellis 2007 の簡易版）
//!
//! 値はすべて曲内で正規化（0..1）するので、ミックスの音量差に左右されず演出がはっきり出る。

use crate::features::{band_energies, hann_window};
use realfft::RealFftPlanner;

pub const HOP: usize = 512;
pub const FFT_SIZE: usize = 2048;
pub const BAND_COUNT: usize = 4;

#[derive(Debug, Default, Clone)]
pub struct TrackAnalysis {
    pub sample_rate: f32,
    pub hop: usize,
    pub frames: usize,
    /// フレームごとの RMS（正規化済み 0..1）
    pub rms: Vec<f32>,
    /// オンセット強度（正規化済み 0..1）
    pub onset: Vec<f32>,
    /// フレームごとの帯域エネルギー [sub, bass, mid, high] × frames（正規化済み 0..1）
    pub bands: Vec<f32>,
    pub bpm: f32,
    /// ビート位置（秒）
    pub beats: Vec<f32>,
}

impl TrackAnalysis {
    pub fn frame_rate(&self) -> f32 {
        self.sample_rate / self.hop as f32
    }
}

/// 値の q 分位点（0..1）。空なら 0。
fn quantile(values: &[f32], q: f32) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let mut v: Vec<f32> = values.to_vec();
    let k = ((v.len() - 1) as f32 * q).round() as usize;
    let (_, nth, _) = v.select_nth_unstable_by(k, |a, b| a.total_cmp(b));
    *nth
}

/// 分位点で割って 0..1 に収める（上位の数%は 1 に張り付く＝ピークがはっきり出る）
fn normalize_by_quantile(values: &mut [f32], q: f32) {
    let ref_v = quantile(values, q);
    if ref_v > 1e-9 {
        for v in values.iter_mut() {
            *v = (*v / ref_v).min(1.0);
        }
    }
}

pub fn analyze_track(pcm: &[f32], sample_rate: f32) -> TrackAnalysis {
    let frames = if pcm.len() >= FFT_SIZE { (pcm.len() - FFT_SIZE) / HOP + 1 } else { 0 };
    let mut out = TrackAnalysis {
        sample_rate,
        hop: HOP,
        frames,
        rms: vec![0.0; frames],
        onset: vec![0.0; frames],
        bands: vec![0.0; frames * BAND_COUNT],
        bpm: 0.0,
        beats: Vec::new(),
    };
    if frames == 0 {
        return out;
    }

    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let window = hann_window(FFT_SIZE);
    let mut buf = vec![0.0f32; FFT_SIZE];
    let mut spec = fft.make_output_vec();
    let mut scratch = fft.make_scratch_vec();
    let bins = spec.len();
    let mut mags = vec![0.0f32; bins];
    let mut prev_log = vec![0.0f32; bins];
    let mut flux = vec![0.0f32; frames];
    let norm = 2.0 / (FFT_SIZE as f32 * 0.5);

    for f in 0..frames {
        let start = f * HOP;
        let frame = &pcm[start..start + FFT_SIZE];
        let mut sq = 0.0f32;
        for i in 0..FFT_SIZE {
            sq += frame[i] * frame[i];
            buf[i] = frame[i] * window[i];
        }
        out.rms[f] = (sq / FFT_SIZE as f32).sqrt();
        fft.process_with_scratch(&mut buf, &mut spec, &mut scratch).expect("fixed sizes");
        let mut fl = 0.0f32;
        for k in 0..bins {
            let m = spec[k].norm() * norm;
            mags[k] = m;
            let lg = (1.0 + 1000.0 * m).ln();
            let d = lg - prev_log[k];
            if d > 0.0 {
                fl += d;
            }
            prev_log[k] = lg;
        }
        flux[f] = if f == 0 { 0.0 } else { fl };
        let b = band_energies(&mags, sample_rate, FFT_SIZE);
        let o = f * BAND_COUNT;
        out.bands[o] = b.sub;
        out.bands[o + 1] = b.bass;
        out.bands[o + 2] = b.mid;
        out.bands[o + 3] = b.high;
    }

    // オンセット包絡: フラックスから局所平均を引いて正の部分だけ残す
    let w = 8usize;
    let mut prefix = vec![0.0f64; frames + 1];
    for i in 0..frames {
        prefix[i + 1] = prefix[i] + flux[i] as f64;
    }
    for i in 0..frames {
        let a = i.saturating_sub(w);
        let b = (i + w + 1).min(frames);
        let mean = ((prefix[b] - prefix[a]) / (b - a) as f64) as f32;
        out.onset[i] = (flux[i] - mean).max(0.0);
    }

    // 先に正規化する（ビート追跡の減点とオンセット値の尺度を揃えるため）
    normalize_by_quantile(&mut out.onset, 0.98);
    let fps = out.frame_rate();
    out.bpm = estimate_bpm(&out.onset, fps);
    out.beats = track_beats(&out.onset, fps, out.bpm);

    normalize_by_quantile(&mut out.rms, 0.98);
    for band in 0..BAND_COUNT {
        let mut col: Vec<f32> = (0..frames).map(|f| out.bands[f * BAND_COUNT + band]).collect();
        normalize_by_quantile(&mut col, 0.98);
        for f in 0..frames {
            out.bands[f * BAND_COUNT + band] = col[f];
        }
    }
    out
}

/// オンセット包絡の自己相関からテンポを推定する（70〜180 BPM、120 BPM 付近をやや優先）。
pub fn estimate_bpm(onset: &[f32], fps: f32) -> f32 {
    let min_lag = (60.0 * fps / 180.0).floor() as usize;
    let max_lag = (60.0 * fps / 70.0).ceil() as usize;
    if onset.len() < max_lag * 4 || min_lag < 1 {
        return 0.0;
    }
    // ガウス平滑化（σ≈2 フレーム）: 拍間隔がフレームの整数倍でなくても相関のピークが崩れないようにする
    let kernel: Vec<f32> = (-6i32..=6).map(|k| (-0.5 * (k as f32 / 2.0).powi(2)).exp()).collect();
    let ksum: f32 = kernel.iter().sum();
    let n = onset.len();
    let mut x = vec![0.0f32; n];
    for i in 0..n {
        let mut s = 0.0f32;
        for (j, &w) in kernel.iter().enumerate() {
            let idx = i as isize + j as isize - 6;
            if idx >= 0 && (idx as usize) < n {
                s += onset[idx as usize] * w;
            }
        }
        x[i] = s / ksum;
    }
    let mean = x.iter().sum::<f32>() / n as f32;
    for v in x.iter_mut() {
        *v -= mean;
    }
    let acf_max = (2 * max_lag + 2).min(n - 1);
    let acf: Vec<f32> = (0..=acf_max)
        .map(|lag| {
            let mut s = 0.0f32;
            for i in lag..n {
                s += x[i] * x[i - lag];
            }
            s / (n - lag) as f32
        })
        .collect();
    // 小数ラグの相関（線形補間）
    let acf_at = |lag: f32| -> f32 {
        let i = lag.floor() as usize;
        if i + 1 > acf_max {
            return 0.0;
        }
        let fr = lag - i as f32;
        acf[i] * (1.0 - fr) + acf[i + 1] * fr
    };
    // 0.25 フレーム刻みで候補を走査。倍周期の相関も加点し、120 BPM 付近をやや優先（倍・半分の取り違え対策）
    let mut best_lag = min_lag as f32;
    let mut best_score = f32::MIN;
    let mut lag = min_lag as f32;
    while lag <= max_lag as f32 {
        let bpm = 60.0 * fps / lag;
        let wgt = (-0.5 * ((bpm / 120.0).log2() / 0.9).powi(2)).exp();
        let sc = (acf_at(lag) + 0.5 * acf_at(2.0 * lag)) * wgt;
        if sc > best_score {
            best_score = sc;
            best_lag = lag;
        }
        lag += 0.25;
    }
    60.0 * fps / best_lag
}

/// 動的計画法によるビートトラッキング。拍間隔がテンポから大きく外れるほど減点する。
pub fn track_beats(onset: &[f32], fps: f32, bpm: f32) -> Vec<f32> {
    let n = onset.len();
    if bpm <= 0.0 || n == 0 {
        return Vec::new();
    }
    let period = 60.0 * fps / bpm;
    let tightness = 100.0f32;
    let mut score = vec![0.0f32; n];
    let mut back = vec![usize::MAX; n];
    let lo = (period * 0.5).round().max(1.0) as usize;
    let hi = (period * 2.0).round() as usize;
    for i in 0..n {
        let mut best = 0.0f32;
        let mut arg = usize::MAX;
        if i >= lo {
            let from = i.saturating_sub(hi);
            for p in from..=i - lo {
                let r = ((i - p) as f32 / period).ln();
                let s = score[p] - tightness * r * r;
                if arg == usize::MAX || s > best {
                    best = s;
                    arg = p;
                }
            }
        }
        score[i] = onset[i] + if arg == usize::MAX { 0.0 } else { best.max(0.0) };
        back[i] = if arg != usize::MAX && best > 0.0 { arg } else { usize::MAX };
    }
    // 最後の1周期内で最大スコアの位置から逆にたどる
    let tail_from = n.saturating_sub(period.ceil() as usize);
    let mut i = (tail_from..n).max_by(|&a, &b| score[a].total_cmp(&score[b])).unwrap_or(n - 1);
    let mut beats = vec![i];
    while back[i] != usize::MAX {
        i = back[i];
        beats.push(i);
    }
    beats.reverse();
    // フレーム中心の時刻（秒）に変換
    let center = (FFT_SIZE as f32 / 2.0) / (fps * HOP as f32);
    beats.into_iter().map(|f| f as f32 / fps + center).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 指定 BPM のクリック（減衰する 80Hz + ノイズ）
    fn click_track(bpm: f32, seconds: f32, sr: f32) -> Vec<f32> {
        let n = (seconds * sr) as usize;
        let period = (60.0 / bpm * sr) as usize;
        let mut seed = 12345u32;
        let mut out = vec![0.0f32; n];
        for i in 0..n {
            let ph = i % period;
            let env = (-(ph as f32) / (0.03 * sr)).exp();
            seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
            let noise = ((seed >> 16) as f32 / 32768.0 - 1.0) * 0.02;
            out[i] = env * (std::f32::consts::TAU * 80.0 * ph as f32 / sr).sin() + noise;
        }
        out
    }

    #[test]
    fn detects_tempo_of_click_track() {
        for bpm in [90.0, 120.0, 150.0] {
            let a = analyze_track(&click_track(bpm, 20.0, 48000.0), 48000.0);
            assert!((a.bpm - bpm).abs() < 2.0, "expected {bpm}, got {}", a.bpm);
        }
    }

    #[test]
    fn beats_are_evenly_spaced_and_cover_track() {
        let a = analyze_track(&click_track(120.0, 20.0, 48000.0), 48000.0);
        assert!(a.beats.len() >= 36 && a.beats.len() <= 42, "beats={}", a.beats.len());
        for w in a.beats.windows(2) {
            let d = w[1] - w[0];
            assert!((d - 0.5).abs() < 0.05, "interval {d}");
        }
    }

    #[test]
    fn normalized_values_are_in_unit_range() {
        let a = analyze_track(&click_track(120.0, 10.0, 48000.0), 48000.0);
        for v in a.rms.iter().chain(&a.onset).chain(&a.bands) {
            assert!((0.0..=1.0).contains(v));
        }
        // キックは低音域に出る
        let bass_peak = (0..a.frames).map(|f| a.bands[f * 4 + 1]).fold(0.0, f32::max);
        assert!(bass_peak > 0.9);
    }

    #[test]
    fn short_or_silent_input_is_safe() {
        let a = analyze_track(&[0.0; 100], 48000.0);
        assert_eq!(a.frames, 0);
        let b = analyze_track(&vec![0.0; 48000 * 5], 48000.0);
        assert!(b.beats.len() <= 1 || b.bpm >= 0.0);
    }

    /// sample/ のテスト素材があれば解析結果を表示する（無ければスキップ）
    #[test]
    fn analyze_sample_wav_if_present() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sample");
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) != Some("wav") {
                continue;
            }
            let bytes = std::fs::read(&p).unwrap();
            let Some((sr, mono)) = crate::wav::decode_pcm16_mono(&bytes) else { continue };
            let t0 = std::time::Instant::now();
            let a = analyze_track(&mono, sr);
            eprintln!(
                "{}: {:.1}s, bpm={:.2}, beats={}, frames={}, analyze={:?}",
                p.file_name().unwrap().to_string_lossy(),
                mono.len() as f32 / sr,
                a.bpm,
                a.beats.len(),
                a.frames,
                t0.elapsed()
            );
            assert!(a.bpm > 60.0 && a.bpm < 200.0);
            // ビート数が テンポ×長さ と大きく食い違わないこと（±15%）
            let expected = mono.len() as f32 / sr * a.bpm / 60.0;
            let ratio = a.beats.len() as f32 / expected;
            assert!((0.85..=1.15).contains(&ratio), "beats={} expected≈{expected:.0}", a.beats.len());
        }
    }
}
