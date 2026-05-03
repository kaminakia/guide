#!/usr/bin/env python3
import subprocess

svg_icon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1a14"/>
  <circle cx="256" cy="256" r="200" fill="none" stroke="#c9a96e" stroke-width="2" opacity="0.4"/>
  <text x="256" y="320" font-family="serif" font-size="220" fill="#c9a96e" text-anchor="middle" font-style="italic">K</text>
  <text x="256" y="460" font-family="sans-serif" font-size="38" fill="#c9a96e" text-anchor="middle" letter-spacing="12" opacity="0.8">AMINAKIA</text>
</svg>'''

with open('/home/claude/kaminakia-pwa/icons/icon.svg', 'w') as f:
    f.write(svg_icon)

# Convert to PNG using rsvg-convert or inkscape
try:
    subprocess.run(['rsvg-convert', '-w', '192', '-h', '192', 
                    '/home/claude/kaminakia-pwa/icons/icon.svg', 
                    '-o', '/home/claude/kaminakia-pwa/icons/icon-192.png'], check=True)
    subprocess.run(['rsvg-convert', '-w', '512', '-h', '512', 
                    '/home/claude/kaminakia-pwa/icons/icon.svg', 
                    '-o', '/home/claude/kaminakia-pwa/icons/icon-512.png'], check=True)
    print("Icons created with rsvg-convert")
except:
    try:
        subprocess.run(['convert', '-background', 'none', '-resize', '192x192',
                        '/home/claude/kaminakia-pwa/icons/icon.svg',
                        '/home/claude/kaminakia-pwa/icons/icon-192.png'], check=True)
        subprocess.run(['convert', '-background', 'none', '-resize', '512x512',
                        '/home/claude/kaminakia-pwa/icons/icon.svg',
                        '/home/claude/kaminakia-pwa/icons/icon-512.png'], check=True)
        print("Icons created with ImageMagick")
    except Exception as e:
        print(f"Could not convert icons: {e}")
