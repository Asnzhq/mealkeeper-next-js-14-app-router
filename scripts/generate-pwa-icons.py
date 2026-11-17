from pathlib import Path
import struct
import zlib

OUT = Path("public/icons")
OUT.mkdir(parents=True, exist_ok=True)

def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

def draw(size):
    red = (232, 93, 78); cream = (250, 247, 242); green = (127, 166, 91); dark_green = (80, 120, 58)
    pixels = bytearray()
    cx = cy = (size - 1) / 2
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            dx, dy = x - cx, y - cy
            color = red
            # Rounded cream plate, warm tomato center and a small green leaf.
            if dx * dx + dy * dy < (size * .37) ** 2:
                color = cream
            if (dx / (size * .245)) ** 2 + ((dy + size * .01) / (size * .22)) ** 2 < 1:
                color = red
            leaf_x = (dx - size * .005) / (size * .085)
            leaf_y = (dy + size * .205) / (size * .15)
            if leaf_x * leaf_x + leaf_y * leaf_y < 1 and dy < -size * .09:
                color = green
            vein = abs((dy + size * .19) - 1.5 * (dx + size * .005)) < max(1, size * .009) and dy < -size * .12
            if vein:
                color = dark_green
            pixels.extend(color)
    header = struct.pack(">2I5B", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(bytes(pixels), 9)) + png_chunk(b"IEND", b"")

for edge in (192, 512):
    (OUT / f"icon-{edge}.png").write_bytes(draw(edge))
