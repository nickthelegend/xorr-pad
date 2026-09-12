"""audit_display.py — do the display pods fit the pad, and each module its pod?
Read-only. Prints PASS/FAIL per item; exits non-zero on any FAIL."""
from __future__ import annotations
import math
import sys

import partlib as pl
import part_display as d

FAILS = []


def chk(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name:52s} {detail}")
    if not ok:
        FAILS.append(name)


cap_back = pl.ROW_Y[0] + 18.2 / 2
knob_back = pl.ROW_Y[0] + 17.0 / 2
head_in = pl.BOSS_XY - 5.7 / 2                 # M3 button head, ISO 7380 dk 5.7
cap_top = pl.CAP_Z0 + 7.5
h = d.POD_W / 2

print("\n=== shared: the lip on the plate ===")
chk("lip clears the back-row caps", d.LIP_Y0 - cap_back >= 1.0, f"{d.LIP_Y0 - cap_back:.2f} mm")
chk("lip clears the knob", d.LIP_Y0 - knob_back >= 1.0, f"{d.LIP_Y0 - knob_back:.2f} mm")
chk("lip clears the M3 button heads", head_in - d.LIP_HALF >= 1.0, f"{head_in - d.LIP_HALF:.2f} mm")
chk("lip rests on the plate top", abs(d.LIP_Z0 - pl.PLATE_Z1) < 1e-9, f"Z {d.LIP_Z0}")

for key in d.MODULES:
    pod = d.Pod(key)
    m = pod.m
    print(f"\n=== {key} — {m['label']} ===")
    mesh = pod.build()[0][1]
    rep = pl.validate(mesh)
    chk("pod is watertight", rep["watertight"], f"{rep['shells']} shells")
    inside = [v for v in mesh.V if v[2] < pl.PLATE_Z1 - 1e-6
              and v[1] < d._case_back_y(min(abs(v[0]), h)) + 0.1]
    chk("no vertex within 0.1 mm of the case below the plate", not inside, f"{len(inside)} vertices")
    xs = [v[0] for v in mesh.V]
    chk("exactly the pad's width", abs(max(xs) - min(xs) - pl.CASE_W) < 1e-6, f"{max(xs) - min(xs):.3f} mm")
    u0 = pod.U_WIN_C - pod.WIN_U / 2
    yw, zw = pod.p(u0, 0.0)
    for a in (40, 50, 60):
        graze = cap_top - (yw - cap_back) * math.tan(math.radians(a))
        chk(f"window clear over the caps at {a} deg down", zw > graze, f"Z {zw:.1f} > {graze:.1f}")
    chk("PCB pocket inside the side walls",
        pod.X_LO >= -(h - d.WALL) and pod.X_HI <= h - d.WALL,
        f"x {pod.X_LO:.1f}..{pod.X_HI:.1f} within +-{h - d.WALL:.1f}")
    chk("active area centred and inside the pocket",
        pod.X_LO <= -m["aa_x"] / 2 and m["aa_x"] / 2 <= pod.X_HI, f"AA +-{m['aa_x'] / 2:.2f} on x = 0")
    chk("window inside the PCB pocket along the slant",
        pod.U_PCB0 <= u0 and u0 + pod.WIN_U <= pod.U_PCB1,
        f"u {u0:.1f}..{u0 + pod.WIN_U:.1f} in {pod.U_PCB0:.1f}..{pod.U_PCB1:.1f}")
    nb = d.SKIN + pod.env_t + d.CLR
    wall = sum(pod.quad(ua, ub, nb, nb + m["pin_depth"]).intersection(pod.prof["shell"]).area
               for ua, ub in ((pod.U_PCB0, pod.U_PCB0 + 4.0), (pod.U_PCB1 - 4.0, pod.U_PCB1)))
    chk("headers + connectors clear the walls behind the PCB", wall < 0.5,
        f"{wall:.2f} mm2 of wall in a {m['pin_depth']:.0f} mm path")
    chk("coupon is watertight", pl.validate(pod.build_coupon()[0][1])["watertight"])
    dims = [max(c) - min(c) for c in zip(*d.print_orientation(mesh).V)]
    chk("fits a 180 mm bed lying on its side", max(dims) <= 180, " x ".join(f"{v:.1f}" for v in dims) + " mm")

print(f"\nAUDIT-DISPLAY: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else " -> ALL CLEAR"))
sys.exit(1 if FAILS else 0)
