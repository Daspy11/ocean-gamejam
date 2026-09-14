from pathlib import Path
import argparse
import json
import string

import numpy as np
import soundfile as sf
from scipy.ndimage import binary_closing
from scipy.signal import butter, resample_poly, sosfiltfilt

# Rebuild from the author's recording: python -m pip install numpy scipy soundfile
root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('speaker', choices=['mich', 'etarp', 'harry', 'antoine', 'tarq', 'walter', 'seahorse'], nargs='?', default='mich')
speaker = parser.parse_args().speaker
if speaker == 'mich':
    source = root / '2026_09_12_16_23_00_1.mp3'
elif speaker == 'walter':
    source = root / '2026_09_12_16_30_26_1.mp3'
elif speaker == 'seahorse':
    source = root / '2026_09_13_18_47_51_1.mp3'
else:
    recording = {'etarp': 3, 'harry': 4, 'antoine': 5, 'tarq': 6}[speaker]
    source = root / f'Record (online-voice-recorder.com) ({recording}).mp3'
out = root / 'audio'
out.mkdir(exist_ok=True)
raw, rate = sf.read(source)
assert raw.ndim == 1, 'Expected the original mono recording'
assert rate in (44100, 48000), 'Expected a 44.1 or 48 kHz recording'
if speaker in ('mich', 'harry', 'antoine', 'walter'):
    from librosa.effects import pitch_shift

# Remove rumble and high hiss without spectral gating the quiet consonants.
filtered = sosfiltfilt(butter(3, [80, 8000], fs=rate, btype='bandpass', output='sos'), raw)
hop = rate // 100
frames = filtered[:len(filtered) // hop * hop].reshape(-1, hop)
energy = np.sqrt(np.mean(frames ** 2, axis=1))
threshold = 0.008 if speaker in ('mich', 'walter') else 0.002  # The newer recordings have more background noise.
if speaker == 'seahorse':
    threshold = 0.016  # Separate the closely spaced U and V despite the background noise.
gap = 8 if speaker == 'seahorse' else 12 if speaker in ('etarp', 'walter') else 22
active = binary_closing(energy > threshold, structure=np.ones(gap))
edges = np.diff(np.r_[False, active, False].astype(int))
spans = [(a, b) for a, b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)) if b - a >= 8]
assert len(spans) == 26, f'Expected 26 letters, found {len(spans)}; inspect cuts before rebuilding'

clips = {}
chunks = []
cursor = 0
for letter, (a, b) in zip(string.ascii_lowercase, spans):
    # Keep a little lead-in for unvoiced consonants and a tail for the natural release.
    start, end = max(0, (a - 3) * hop), min(len(raw), (b + 4) * hop)
    clip = resample_poly(filtered[start:end], 24000, rate)
    if speaker in ('mich', 'harry', 'antoine', 'walter'):
        # Offset 1.8x playback so Harry and Antoine end 10% below their original pitch.
        length = len(clip)
        steps = -12
        if speaker == 'mich':
            steps = 12 * np.log2(0.9)  # Lower her current pitch by 10% without changing speed.
        elif speaker == 'walter':
            steps = 12 * np.log2(1.32 / 2)  # At 2x playback, 10% above the previous 1.2x pitch.
        clip = pitch_shift(clip, sr=24000, n_steps=steps)
        assert len(clip) == length, 'Pitch adjustment must preserve the letter boundaries'
    rms = np.sqrt(np.mean(clip ** 2))
    clip *= min(0.1 / max(rms, 1e-6), 0.8 / max(np.max(np.abs(clip)), 1e-6))
    clip[:96] *= np.linspace(0, 1, 96)
    clip[-192:] *= np.linspace(1, 0, 192)
    clips[letter] = [round(cursor / 24000, 6), round(len(clip) / 24000, 6)]
    chunks.extend([clip, np.zeros(1200)])
    cursor += len(clip) + 1200
    print(f'{letter}: source {start / rate:.2f}..{end / rate:.2f}s, peak {np.max(np.abs(clip)):.3f}')

bank = np.concatenate(chunks)
sf.write(out / f'{speaker}.wav', bank, 24000, subtype='PCM_16')
(out / f'{speaker}.json').write_text(
    '{\n' + ',\n'.join(f'  "{k}": {json.dumps(v)}' for k, v in clips.items()) + '\n}\n',
    encoding='utf-8',
)
print(f'Wrote {len(clips)} letters, {len(bank) / 24000:.2f}s, peak {np.max(np.abs(bank)):.3f}')
