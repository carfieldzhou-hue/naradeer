import sys, os
from PIL import Image

base = r"G:\Git\naradeer\asset\Meshy_quadruped"
files = [
    "Meshy_AI_Whispering_Fawn_quadruped_texture_0.png",
    "Meshy_AI_Whispering_Fawn_quadruped_texture_0_roughness.png",
    "Meshy_AI_Whispering_Fawn_quadruped_texture_0_metallic.png",
]

for fname in files:
    fpath = os.path.join(base, fname)
    if not os.path.exists(fpath):
        print(f"{fname}: FILE NOT FOUND\n")
        continue
    try:
        img = Image.open(fpath)
        print(f"{'='*60}")
        print(f"File: {fname}")
        print(f"Size: {img.size}  (format={img.format}, mode={img.mode})")

        px = img.load()
        w, h = img.size
        total = w * h

        if img.mode in ("L", "I"):
            vals = [px[x, y] for x in range(w) for y in range(h)]
            mean = sum(vals) / total
            mn, mx = min(vals), max(vals)
            pct0 = sum(1 for v in vals if v == 0) / total * 100
            pct255 = sum(1 for v in vals if v == 255) / total * 100
            print(f"  Grayscale: min={mn}, max={mx}, mean={mean:.2f}")
            print(f"  % pixels = 0: {pct0:.2f}%  % =255: {pct255:.2f}%")

        elif img.mode in ("RGB", "RGBA"):
            ch_count = len(img.mode)
            ch_names = list(img.mode)  # e.g. ['R','G','B','A']
            ch_data = [[], [], [], []]
            for x in range(w):
                for y in range(h):
                    for c in range(ch_count):
                        ch_data[c].append(px[x, y][c])
            for c in range(ch_count):
                vals = ch_data[c]
                mean = sum(vals) / total
                mn, mx = min(vals), max(vals)
                pct0 = sum(1 for v in vals if v == 0) / total * 100
                pct255 = sum(1 for v in vals if v == 255) / total * 100
                print(f"  {ch_names[c]}: mean={mean:.2f}, min={mn}, max={mx}, "
                      f"%0={pct0:.2f}%, %255={pct255:.2f}%")

            if ch_count >= 3:
                r_avg = sum(ch_data[0]) / total
                g_avg = sum(ch_data[1]) / total
                b_avg = sum(ch_data[2]) / total
                print(f"  Avg RGB: ({r_avg:.1f}, {g_avg:.1f}, {b_avg:.1f})")

            if ch_count == 4:
                pct_a0 = sum(1 for v in ch_data[3] if v == 0) / total * 100
                pct_a255 = sum(1 for v in ch_data[3] if v == 255) / total * 100
                if pct_a0 < 5:
                    print(f"  => ALPHA OK: only {pct_a0:.2f}% fully transparent")
                else:
                    print(f"  => ALPHA WARNING: {pct_a0:.2f}% fully transparent")

            # Color assessment for base color
            if "texture_0.png" in fname:
                r_avg = sum(ch_data[0]) / total
                g_avg = sum(ch_data[1]) / total
                b_avg = sum(ch_data[2]) / total
                # Natural deer fur: brown/tan ~ R>G>B, ~(100-200, 60-160, 30-120)
                is_brown = (r_avg > g_avg > b_avg and r_avg > 80)
                is_gray = abs(r_avg - g_avg) < 15 and abs(g_avg - b_avg) < 15 and r_avg > 80
                is_debug = mn == 0 and mx == 255 and (pct0 > 5 or pct255 > 5)
                if is_brown:
                    print(f"  => COLOR: Looks like natural brown/tan (deer fur tones)")
                elif is_gray:
                    print(f"  => COLOR: Gray/neutral tones (maybe base gray for tinting?)")
                else:
                    print(f"  => COLOR: Unusual color profile (avg=({r_avg:.0f},{g_avg:.0f},{b_avg:.0f}))")
                if is_debug:
                    print(f"  => NOTE: Contains significant pure black(0) or white(255) pixels - possible debug colors")
        print()
    except Exception as e:
        print(f"{fname}: ERROR - {e}\n")
