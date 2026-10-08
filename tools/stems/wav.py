"""Reading and writing PCM WAV files with numpy alone (no scipy, no soundfile)."""
import struct

import numpy as np


def read(path, mono=True):
    """Return (samples as float32 in [-1, 1], sample rate). 16- or 24-bit PCM."""
    with open(path, 'rb') as fh:
        if fh.read(12)[8:] != b'WAVE':
            raise ValueError(f'{path}: not a WAV file')
        fmt = None
        while True:
            head = fh.read(8)
            if len(head) < 8:
                raise ValueError(f'{path}: no data chunk')
            cid, size = struct.unpack('<4sI', head)
            if cid == b'fmt ':
                fmt = struct.unpack('<HHIIHH', fh.read(16))
                fh.seek(size - 16, 1)
            elif cid == b'data':
                raw = np.frombuffer(fh.read(size), dtype=np.uint8)
                break
            else:
                fh.seek(size + (size & 1), 1)
    tag, channels, rate, _, _, bits = fmt
    if tag != 1 or bits not in (16, 24):
        raise ValueError(f'{path}: only 16- and 24-bit PCM are supported, not format {tag}/{bits}-bit')
    if bits == 16:
        x = raw[: len(raw) // 2 * 2].view('<i2').astype(np.float32) / 32768
    else:
        b = raw[: len(raw) // 3 * 3].reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float32) / (1 << 23)
    x = x.reshape(-1, channels)
    return (x.mean(axis=1) if mono else x), rate


def write16(path, x, rate):
    """Write stereo float samples as 16-bit PCM."""
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    with open(path, 'wb') as fh:
        fh.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVE')
        fh.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 2, rate, rate * 4, 4, 16))
        fh.write(b'data' + struct.pack('<I', len(pcm)) + pcm)
