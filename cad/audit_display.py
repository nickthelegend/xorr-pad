"""audit_display.py — do the display pods fit the pad, and each module its pod?
Read-only. Prints PASS/FAIL per item; exits non-zero on any FAIL."""
from __future__ import annotations
import math
import os
import sys
import zipfile

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
USB_WIN_Z = (pl.USB_WIN[1], pl.USB_WIN[2])     # the pad's side windows, Z 17.0..23.5

print("\n=== shared: the lip on the plate ===")
chk("lip clears the back-row caps", d.LIP_Y0 - cap_back >= 1.0, f"{d.LIP_Y0 - cap_back:.2f} mm")
chk("lip clears the knob", d.LIP_Y0 - knob_back >= 1.0, f"{d.LIP_Y0 - knob_back:.2f} mm")
chk("lip clears the M3 button heads", head_in - d.LIP_HALF >= 1.0, f"{head_in - d.LIP_HALF:.2f} mm")
chk("lip rests on the plate top", abs(d.LIP_Z0 - pl.PLATE_Z1) < 1e-9, f"Z {d.LIP_Z0}")

for key in d.MODULES:
    pod = d.Pod(key)
    m = pod.m
    print(f"\n=== {key} — {m['label']} ===")
    items = pod.build()
    (_, body, _), (_, cap, _) = items
    for name, mesh in (("body", body), ("cap", cap)):
        rep = pl.validate(mesh)
        chk(f"{name} is watertight", rep["watertight"], f"{rep['shells']} shells")
    inside = [v for v in body.V if v[2] < pl.PLATE_Z1 - 1e-6
              and v[1] < d._case_back_y(min(abs(v[0]), h)) + 0.1]
    chk("no vertex within 0.1 mm of the case below the plate", not inside, f"{len(inside)} vertices")
    bx = [v[0] for v in body.V]
    chk("exactly the pad's width", abs(max(bx) - min(bx) - pl.CASE_W) < 1e-6, f"{max(bx) - min(bx):.3f} mm")

    # the cap is the body's own back: flush, same height, same width
    cy = [v[1] for v in cap.V]; cz = [v[2] for v in cap.V]; cx = [v[0] for v in cap.V]
    chk("cap is flush: it IS the back of the pod", abs(max(cy) - pod.BACK_Y) < 1e-6
        and abs(max(cz) - pod.TOP_Z) < 1e-6 and abs(min(cz)) < 1e-6,
        f"back Y {max(cy):.2f}, Z 0..{max(cz):.1f} — body Z 0..{pod.TOP_Z:.1f}")
    chk("cap carries the body's full width into the R8 corners", max(cx) - min(cx) > 88.5,
        f"{max(cx) - min(cx):.2f} mm at the seam")
    body_shell = [v for v in body.V if v[2] < d.WALL - 0.01 or abs(v[0]) > h - d.WALL + 0.01]
    chk("body's floor and sides end at the seam", max(v[1] for v in body_shell) <= pod.Y_S + 1e-6,
        f"Y {max(v[1] for v in body_shell):.2f} = seam {pod.Y_S:.2f}")
    cap_floor = [v[1] for v in cap.V if v[2] < d.WALL - 0.5]
    chk("seam gap", abs(min(cap_floor) - (pod.Y_S + d.CAP_CLR)) < 1e-6, f"{d.CAP_CLR} mm")

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
    chk("headers + connectors clear the body's walls", pod.pins.intersection(pod.prof["shell"]).area < 0.5,
        f"{pod.pins.intersection(pod.prof['shell']).area:.2f} mm2 in a {m['pin_depth']:.0f} mm path")
    chk("headers + connectors end in front of the cap's back wall",
        pod.pin_y + d.PIN_CLEAR <= pod.BACK_Y - d.WALL + 1e-9,
        f"they reach Y {pod.pin_y:.1f}; the back wall starts at {pod.BACK_Y - d.WALL:.1f}")
    hit = pod.pins.intersection(pod.boss_region(False).union(pod.tongue_region())).area
    chk("screw bosses and cap tongues clear the headers", hit == 0.0, f"{hit:.2f} mm2")
    envl = pod.quad(pod.U_PCB0, pod.U_PCB1, d.SKIN, nb)
    over = pod.X_HI > d.BOSS_X - d.BOSS_W / 2 or pod.X_LO < -(d.BOSS_X - d.BOSS_W / 2)
    ehit = envl.intersection(pod.boss_region(False)).area if over else 0.0
    chk("screw bosses clear the module", ehit == 0.0, f"{ehit:.2f} mm2")
    st0, st1, _ = pod.side_tongue_x()
    pcb_edge = max(abs(-m["aa_dx"] - m["pcb_x"] / 2), abs(-m["aa_dx"] + m["pcb_x"] / 2))
    chk("side tongues clear the PCB and its headers", pcb_edge + 1.0 <= st0,
        f"PCB edge |X| {pcb_edge:.1f}; tongues from {st0:.1f}")
    chk("side tongues clear the body's walls", (h - d.WALL) - st1 >= 0.25, f"{(h - d.WALL) - st1:.2f} mm")

    zb, zt = d.WALL + d.BOSS_H / 2, pod.TOP_Z - d.WALL - d.BOSS_H / 2
    chk("screw holes line up with the pilots", abs(zb - 5.5) < 1e-9 and abs((pod.TOP_Z - zt) - 5.5) < 1e-9,
        f"Z {zb:.1f} and {zt:.1f} at X +-{d.BOSS_X}")
    so = pod.side_opening()
    y0, z0, y1, z1 = so.bounds
    overlap = min(z1, USB_WIN_Z[1]) - max(z0, USB_WIN_Z[0])
    chk("cable opening on the right wall, level with the pad's USB window", overlap >= 6.0,
        f"Z {z0:.2f}..{z1:.2f} vs window {USB_WIN_Z[0]}..{USB_WIN_Z[1]}")
    chk("cable opening sits in the body, clear of the floor and seam",
        z0 > d.WALL + 2.0 and y0 > d.FRONT_Y + d.WALL and y1 < pod.Y_S - 2.0,
        f"Y {y0:.1f}..{y1:.1f}, seam at {pod.Y_S:.1f}")
    chk("coupon is watertight", pl.validate(pod.build_coupon()[0][1])["watertight"])
    (_, bp), (_, cp) = d.plate_layout(pod, items)
    bxs = [v[0] for v in bp.V]; cxs = [v[0] for v in cp.V]
    allx, ally = bxs + cxs, [v[1] for v in bp.V] + [v[1] for v in cp.V]
    chk("one plate: both parts sit flat on it",
        abs(min(v[2] for v in bp.V)) < 1e-6 and abs(min(v[2] for v in cp.V)) < 1e-6, "Z min 0 for both")
    chk("one plate: the parts don't touch", max(bxs) + d.PLATE_GAP - 1e-6 <= min(cxs),
        f"{min(cxs) - max(bxs):.1f} mm apart")
    pw, pd = max(allx) - min(allx), max(ally) - min(ally)
    chk("one plate: fits a 180 mm bed", pw <= d.PLATE_BED and pd <= d.PLATE_BED, f"{pw:.1f} x {pd:.1f} mm")
    f3 = os.path.join("..", "exports", "print", f"display-plate{m['suffix']}.3mf")
    n_obj = 0
    if os.path.exists(f3):
        with zipfile.ZipFile(f3) as z:
            n_obj = z.read("3D/3dmodel.model").decode().count("<object id=")
    chk("one plate: the 3MF holds the body and the cap", n_obj == 2, f"{n_obj} objects in {os.path.basename(f3)}")
    bd = [max(c) - min(c) for c in zip(*d.print_orientation(body).V)]
    cd = [max(c) - min(c) for c in zip(*d.print_on_back(cap).V)]
    chk("body fits a 180 mm bed on its side; cap lies on its back", max(bd) <= 180 and max(cd) <= 180,
        f"body {' x '.join(f'{v:.1f}' for v in bd)} · cap {' x '.join(f'{v:.1f}' for v in cd)} mm")

print(f"\nAUDIT-DISPLAY: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else " -> ALL CLEAR"))
sys.exit(1 if FAILS else 0)
