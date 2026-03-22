import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack('!I', len(data)) + tag + data + struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff)


def png_rgba(width: int, height: int, rgba=(42, 98, 244, 255)) -> bytes:
    r, g, b, a = rgba
    row = bytes([r, g, b, a]) * width
    raw = b''.join(b'\x00' + row for _ in range(height))
    ihdr = struct.pack('!IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main() -> None:
    out = Path('/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/extension/icons')
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 48, 128):
        (out / f'icon-{size}.png').write_bytes(png_rgba(size, size))


if __name__ == '__main__':
    main()
