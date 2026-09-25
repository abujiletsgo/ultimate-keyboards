#!/usr/bin/env python3
"""Render the menu-bar template glyph (design/tray-template.svg geometry) to a
72×72 RGBA PNG with a transparent background: black where opaque, so macOS
tints it. Pure Python (no rasterizer dependency); 4× supersampled.

    python3 scripts/render-tray-icon.py
"""
import math, struct, zlib, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'src-tauri' / 'icons' / 'tray-template.png'
VIEW = 36           # SVG viewBox
SIZE = 72           # output px (2× for Retina menu bars)
SS = 4              # supersampling factor

# (x, y, w, h, rx, rotation_deg, pivot_x, pivot_y) in viewBox units
RECTS = []
for (x, y) in [(3, 12), (8, 10), (13, 8), (3, 17), (8, 15), (13, 13), (3, 22), (8, 20), (13, 18),
               (19, 8), (24, 10), (29, 12), (19, 13), (24, 15), (29, 17), (19, 18), (24, 20), (29, 22)]:
    RECTS.append((x, y, 4, 4, 1.0, 0, 0, 0))
RECTS.append((11, 26, 6, 4, 1.5, 12, 14, 28))
RECTS.append((19, 26, 6, 4, 1.5, -12, 22, 28))


def inside(px, py, r):
    x, y, w, h, rx, rot, cx, cy = r
    if rot:
        a = math.radians(-rot)
        dx, dy = px - cx, py - cy
        px = cx + dx * math.cos(a) - dy * math.sin(a)
        py = cy + dx * math.sin(a) + dy * math.cos(a)
    if px < x or px > x + w or py < y or py > y + h:
        return False
    # rounded corners
    qx = min(max(px, x + rx), x + w - rx)
    qy = min(max(py, y + rx), y + h - rx)
    return (px - qx) ** 2 + (py - qy) ** 2 <= rx * rx


def render():
    scale = VIEW / (SIZE * SS)
    rows = []
    for j in range(SIZE):
        row = bytearray()
        for i in range(SIZE):
            hit = 0
            for sj in range(SS):
                for si in range(SS):
                    px = (i * SS + si + 0.5) * scale
                    py = (j * SS + sj + 0.5) * scale
                    if any(inside(px, py, r) for r in RECTS):
                        hit += 1
            a = round(255 * hit / (SS * SS))
            row += bytes((0, 0, 0, a))
        rows.append(bytes(row))
    return rows


def png(rows, w, h):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(b'\x00' + r for r in rows)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    rows = render()
    OUT.write_bytes(png(rows, SIZE, SIZE))
    opaque = sum(1 for r in rows for k in range(3, len(r), 4) if r[k] > 0)
    print(f'wrote {OUT} ({SIZE}×{SIZE}, {opaque} opaque px of {SIZE * SIZE})')
