from pathlib import Path

import numpy as np
import soundfile as sf

root = Path(__file__).resolve().parent.parent
source = root / 'audio/bigbeatloop_sergequadrado.mp3'
audio, rate = sf.read(source, always_2d=True)
# The first downbeat is 50 ms in; the recording contains 32 beats at 113 BPM.
start = round(0.05 * rate)
frames = round(32 * 60 / 113 * rate)
if start + frames > len(audio):
    raise ValueError('The source is shorter than the measured loop region')
loop = audio[start:start + frames].copy()
# Match the seam over the last 2 ms without shortening a beat or fading to silence.
tail = round(0.002 * rate)
loop[-tail:] -= np.linspace(0, 1, tail)[:, None] ** 2 * (loop[-1] - loop[0])
destination = root / 'audio/bigbeatloop_sergequadrado.wav'
sf.write(destination, loop, rate, subtype='PCM_16')
print(f'{destination.name}: {frames} frames, {frames / rate:.6f}s, {rate} Hz')
