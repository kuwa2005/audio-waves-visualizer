//! テスト用の最小 WAV デコーダ（PCM 16bit のみ、モノラルに混合）。
//! ブラウザでは decodeAudioData を使うので、本番経路では使わない。

pub fn decode_pcm16_mono(bytes: &[u8]) -> Option<(f32, Vec<f32>)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut pos = 12;
    let (mut channels, mut sr, mut bits) = (0u16, 0u32, 0u16);
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = pos + 8;
        if id == b"fmt " {
            channels = u16::from_le_bytes(bytes[body + 2..body + 4].try_into().ok()?);
            sr = u32::from_le_bytes(bytes[body + 4..body + 8].try_into().ok()?);
            bits = u16::from_le_bytes(bytes[body + 14..body + 16].try_into().ok()?);
        } else if id == b"data" {
            if bits != 16 || channels == 0 {
                return None;
            }
            let end = (body + size).min(bytes.len());
            let ch = channels as usize;
            let data = &bytes[body..end];
            let frames = data.len() / (2 * ch);
            let mut out = Vec::with_capacity(frames);
            for f in 0..frames {
                let mut s = 0.0f32;
                for c in 0..ch {
                    let o = (f * ch + c) * 2;
                    s += i16::from_le_bytes([data[o], data[o + 1]]) as f32 / 32768.0;
                }
                out.push(s / ch as f32);
            }
            return Some((sr as f32, out));
        }
        pos = body + size + (size & 1);
    }
    None
}
