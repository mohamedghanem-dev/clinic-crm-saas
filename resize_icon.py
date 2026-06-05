#!/usr/bin/env python3
"""
resize_icon.py — Clinic CRM Icon Generator
Generates all required icon sizes from icon.png
Usage: python3 resize_icon.py
"""
from PIL import Image
import os, base64

src = 'icon.png'
sizes = [16, 32, 48, 64, 128, 192, 256, 512, 1024]

img = Image.open(src).convert('RGBA')

for size in sizes:
    out = f'icon-{size}.png'
    img.resize((size, size), Image.LANCZOS).save(out)
    print(f'  ✓ {out}')

# Also generate icon_b64.js
with open(src, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
with open('icon_b64.js', 'w') as f:
    f.write(f'// Auto-generated — do not edit\nconst ICON_B64 = "data:image/png;base64,{b64}";\n')

print('\n✅ All icons generated + icon_b64.js updated')
