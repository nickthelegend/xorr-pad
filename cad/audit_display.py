"""audit_display.py — does the display pod fit the pad, and the module fit the pod?
Read-only. Prints PASS/FAIL per item; exits non-zero on any FAIL."""
from __future__ import annotations
import math, os, sys
import partlib as pl
import part_display as d

FAILS = []
def chk(name, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {name:48s} {detail}")
    if not ok: FAILS.append(name)

cap_back = pl.ROW_Y[0] + 18.2 / 2
knob_back = pl.ROW_Y[0] + 17.0 / 2
head_in = pl.BOSS_XY - 5.7 / 2                 # M3 button head, ISO 7380 dk 5.7
chk("lip clears the back-row caps", d.LIP_Y0 - cap_back >= 1.0, f"{d.LIP_Y0 - cap_back:.2f} mm")
chk("lip clears the knob", d.LIP_Y0 - knob_back >= 1.0, f"{d.LIP_Y0 - knob_back:.2f} mm")
chk("lip clears the M3 button heads", head_in - d.LIP_HALF >= 1.0, f"{head_in - d.LIP_HALF:.2f} mm")
chk("lip rests on the plate top", abs(d.LIP_Z0 - pl.PLATE_Z1) < 1e-9, f"Z {d.LIP_Z0}")

pod = d.build()[0][1]
rep = pl.validate(pod)
chk("pod is watertight", rep["watertight"], f"{rep['shells']} shells")
inside = [v for v in pod.V if v[2] < pl.PLATE_Z1 - 1e-6
          and v[1] < d._case_back_y(min(abs(v[0]), pl.CASE_W / 2)) + 0.1]
chk("no pod vertex within 0.1 mm of the case below the plate", not inside, f"{len(inside)} vertices")
xs = [v[0] for v in pod.V]
chk("pod is exactly the pad's width", abs(max(xs) - min(xs) - pl.CASE_W) < 1e-6, f"{max(xs) - min(xs):.3f} mm")

cap_top = pl.CAP_Z0 + 7.5
u = d.U_WIN_C - d.WIN / 2
yw, zw = d.FACE0[0] + u * d.TU[0], d.FACE0[1] + u * d.TU[1]
for a in (40, 50, 60):
    graze = cap_top - (yw - cap_back) * math.tan(math.radians(a))
    chk(f"window clear over the caps at {a} deg down", zw > graze, f"window Z {zw:.1f} > sight line {graze:.1f}")
chk("module + rails inside the side walls", d.PCB_W / 2 + d.CLR + d.RAIL <= d.POD_W / 2 - d.WALL, "")
chk("window inside the module envelope", d.U_PCB0 <= u and u + d.WIN <= d.U_PCB1, f"u {u:.1f}..{u + d.WIN:.1f}")
coupon = d.build_coupon()[0][1]
chk("coupon is watertight", pl.validate(coupon)["watertight"], "")
dims = [max(c) - min(c) for c in zip(*d.print_orientation(pod).V)]
chk("fits a 180 mm bed lying on its side", max(dims) <= 180, " x ".join(f"{v:.1f}" for v in dims) + " mm")
print(f"\nAUDIT-DISPLAY: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else " -> ALL CLEAR"))
sys.exit(1 if FAILS else 0)
