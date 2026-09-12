"""part_display.py — a slanted pod for a 1.54" ST7789 SPI TFT (240x240).

It stands on the desk directly behind the pad and keys onto it with a lip that
rests on the plate's back strip — the one band of the plate top that nothing
else uses (cap backs end at Y 37.7, the knob at 37.1, the M3 button heads start
at |X| 36.2). No existing part changes, no screws.

The kernel only extrudes along Z, so the pod is a SIDE PROFILE in (Y, Z)
extruded across X in bands (the tray's band-split trick, turned sideways),
then mapped (x,y,z) -> (z,x,y). That map is a cyclic axis permutation — a
proper rotation — so every shell keeps its outward winding. The same fact makes
it print support-free: lay it on a side wall and every layer is the profile.

The module drops in through the open back, face-down against the inside of the
bezel, located by side rails and end stops; a strip of foam tape holds it (the
same way the amp and mic are mounted in the tray).

MEASURE YOUR MODULE before printing the pod — or print display-coupon.stl
first (~10 min): it is the pod's face alone, and the module should drop in
and show its whole active area through the window.
"""
from __future__ import annotations

import math
import os
import sys

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

import partlib as pl

OVL = 0.2

# ---- the module (one sourced listing: 44 x 32 x 4, AA 27.72 sq) -- MEASURE --
PCB_L = 44.0        # along the slant (the header strip is on this axis)
PCB_W = 32.0        # across X
MODULE_T = 4.0      # PCB + glass + backlight, front face to back of PCB
AA = 27.72          # active area, square
AA_SHIFT = 3.0      # AA centre offset from PCB centre, away from the header end
CLR = 0.3           # clearance per side around the PCB

# ---- the pod ---------------------------------------------------------------
TILT = 55.0         # face inclination from horizontal (90 = upright)
POD_W = pl.CASE_W   # 90 — the pad's own width, so the two read as one body
WALL = 2.0          # shell + side walls
SKIN = 2.0          # bezel thickness in front of the glass
BEZEL = 2.0         # solid face margin beyond the stops, along the slant
STOP = 2.0          # end stops that locate the PCB along the slant
RAIL = 2.0          # side rails that locate the PCB across X
WIN_MARGIN = 0.6    # window over the AA, per side (hides no pixels at AA_SHIFT +-0.6)
FRONT_Y = pl.CASE_W / 2 + 0.2          # 45.2 — 0.2 off the tray's back wall
FACE_Z0 = 46.0      # bottom edge of the face (plate top 41.5, cap tops 54.5)
TOP_FLAT = 4.0      # flat top behind the face's upper edge

# ---- the lip on the plate's back strip ----------------------------------------
LIP_Y0 = 39.0                          # 1.3 behind the cap backs (37.7)
LIP_Z0 = pl.PLATE_Z1                   # 41.5 — rests on the plate top
LIP_T = 1.6
LIP_HALF = 35.0     # the M3 button heads start at |X| 36.2
CORNER_STEP = 0.5   # plan-corner bands: R8 drawn as 0.5-wide steps

T = math.radians(TILT)
TU = (math.cos(T), math.sin(T))        # up the face (toward +Y, +Z)
TN = (math.sin(T), -math.cos(T))       # into the pod, normal to the face
FACE_L = BEZEL + STOP + CLR + PCB_L + CLR + STOP + BEZEL
U_PCB0 = BEZEL + STOP                  # PCB envelope along the slant
U_PCB1 = U_PCB0 + 2 * CLR + PCB_L
WIN = AA + 2 * WIN_MARGIN
U_WIN_C = U_PCB0 + CLR + PCB_L / 2 + AA_SHIFT

FACE0 = (FRONT_Y, FACE_Z0)
FACE1 = (FRONT_Y + FACE_L * TU[0], FACE_Z0 + FACE_L * TU[1])
BACK_Y = FACE1[0] + TOP_FLAT
TOP_Z = FACE1[1]


def face_quad(u0, u1, n0, n1):
    """A rectangle in face coordinates (u along the slant, n into the pod)."""
    def p(u, n):
        return (FACE0[0] + u * TU[0] + n * TN[0], FACE0[1] + u * TU[1] + n * TN[1])
    return Polygon([p(u0, n0), p(u1, n0), p(u1, n1), p(u0, n1)])


def outer_profile():
    return Polygon([
        (FRONT_Y, 0.0), (BACK_Y, 0.0), (BACK_Y, TOP_Z), FACE1, FACE0,
        (FRONT_Y, LIP_Z0 + LIP_T), (LIP_Y0, LIP_Z0 + LIP_T),
        (LIP_Y0, LIP_Z0), (FRONT_Y, LIP_Z0),
    ])


def profiles():
    outer = outer_profile()
    # hollow, open at the back: the module goes in and the wires come out there
    inner = outer.buffer(-WALL, join_style=2).union(
        box(BACK_Y - WALL - OVL, WALL, BACK_Y + 5.0, TOP_Z - WALL))
    shell = outer.difference(inner)
    n_back = SKIN + MODULE_T + CLR
    cradle = face_quad(BEZEL, FACE_L - BEZEL, SKIN - OVL, n_back)
    envelope = face_quad(U_PCB0, U_PCB1, SKIN, n_back + 1.0)
    window = face_quad(U_WIN_C - WIN / 2, U_WIN_C + WIN / 2, -1.0, SKIN + OVL)
    stops = cradle.difference(envelope)
    return {
        "side": outer,
        "shell": shell,
        "rail": shell.union(cradle.intersection(outer)),
        "pcb": shell.difference(envelope).union(stops.intersection(outer)),
        "win": shell.difference(envelope).difference(window).union(
            stops.intersection(outer)),
    }


def _as_polys(geom, min_area=0.05):
    if geom.is_empty:
        return []
    parts = getattr(geom, "geoms", [geom])
    out = []
    for g in parts:
        if g.geom_type == "Polygon" and g.area > min_area:
            out.append(g)
        elif g.geom_type in ("MultiPolygon", "GeometryCollection"):
            out += _as_polys(g, min_area)
    return out


def _band(profile, x0, x1):
    """Prism the (Y,Z) profile across X in [x0, x1], mapped to world axes."""
    polys = _as_polys(profile)
    if not polys:
        return None
    m = pl.prism(unary_union(polys), x0, x1)
    m.V = [(z, x, y) for x, y, z in m.V]    # cyclic permutation: det +1
    return m


def _case_back_y(ax):
    """The tray/plate outline's back edge at |X| = ax (R8 corners at +-37)."""
    c = pl.CASE_W / 2 - pl.CASE_R
    if ax <= c:
        return pl.CASE_W / 2
    return c + math.sqrt(max(pl.CASE_R ** 2 - (ax - c) ** 2, 0.0))


def _band_profile(prof, key, ax0, ax1):
    """Profile for the band |X| in [ax0, ax1]."""
    base = prof["side" if key == "side" else key if key in prof else "shell"]
    lip = box(LIP_Y0 - 1.0, LIP_Z0 - OVL, FRONT_Y + OVL, LIP_Z0 + LIP_T + OVL)
    if ax0 >= LIP_HALF - 1e-9:
        base = base.difference(lip)
    c = pl.CASE_W / 2 - pl.CASE_R
    if ax1 > c + 1e-9:
        # back corner: the pod's own R8, judged at the band's OUTER edge so no
        # step pokes past the rounded outline
        axo = min(ax1 + OVL / 2, POD_W / 2)          # the band is stretched by OVL/2
        yb = BACK_Y - pl.CASE_R + math.sqrt(max(pl.CASE_R ** 2 - (axo - c) ** 2, 0.0))
        base = base.intersection(box(-1.0, -1.0, yb, TOP_Z + 1.0))
        # front corner: wrap the tray's R8 up to the plate top, judged at the
        # band's INNER edge so the pod never touches the case
        yf = _case_back_y(max(ax0 - OVL / 2, 0.0)) + 0.2
        if yf < FRONT_Y - 0.05:
            base = base.union(box(yf, 0.0, FRONT_Y + OVL, LIP_Z0))
    return base


def bands():
    """(|X| inner, |X| outer, key) — mirrored into both halves by build()."""
    h, c = POD_W / 2, pl.CASE_W / 2 - pl.CASE_R
    edges = [(0.0, WIN / 2, "win"),
             (WIN / 2, PCB_W / 2 + CLR, "pcb"),
             (PCB_W / 2 + CLR, PCB_W / 2 + CLR + RAIL, "rail"),
             (PCB_W / 2 + CLR + RAIL, LIP_HALF, "shell"),
             (LIP_HALF, c, "shell")]
    x = c
    while x < h - 1e-9:
        nx = min(x + CORNER_STEP, h)
        edges.append((x, nx, "side" if nx > h - WALL + 1e-9 else "shell"))
        x = nx
    return edges


def build():
    prof = profiles()
    m = pl.Mesh()
    for ax0, ax1, key in bands():
        p = _band_profile(prof, key, ax0, ax1)
        for x0, x1 in ((ax0, ax1), (-ax1, -ax0)):
            h = POD_W / 2                               # never past the pad's sides
            band = _band(p, max(x0 - OVL / 2, -h), min(x1 + OVL / 2, h))
            if band is not None:
                m += band
    return [("display-pod", m, pl.COLORS["plate"])]


def build_coupon():
    """The pod's face alone, printed flat: does the module drop in and does the
    window show its whole active area?"""
    ow = PCB_W + 2 * CLR + 2 * RAIL
    ol = FACE_L
    outline = pl.rounded_rect(ow, ol, 2.0)
    y_env0, y_env1 = -ol / 2 + U_PCB0, -ol / 2 + U_PCB1
    env = box(-(PCB_W / 2 + CLR), y_env0, PCB_W / 2 + CLR, y_env1)
    wy = -ol / 2 + U_WIN_C
    win = box(-WIN / 2, wy - WIN / 2, WIN / 2, wy + WIN / 2)
    m = pl.Mesh()
    m += pl.prism(outline.difference(win), 0.0, SKIN)
    m += pl.prism(outline.difference(env), SKIN - OVL, SKIN + MODULE_T + CLR)
    return [("display-coupon", m, pl.COLORS["plate"])]


def print_orientation(mesh):
    """World -> lying on its -X side wall, min corner at the origin."""
    out = pl.Mesh()
    out.V = [(y, z, x) for x, y, z in mesh.V]   # inverse cyclic map, det +1
    out.F = list(mesh.F)
    xs, ys, zs = zip(*out.V)
    return out.translate(-min(xs), -min(ys), -min(zs))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    exports = os.path.normpath(os.path.join(here, "..", "exports"))
    ok = True
    for name, mesh, color in build() + build_coupon():
        rep = pl.validate(mesh)
        print(f"{name}: shells={rep['shells']} tris={rep['triangles']} "
              f"watertight={rep['watertight']} {rep['problems'][:2]}")
        ok &= rep["watertight"]
    pod = build()[0][1]
    pl.stl_write(os.path.join(exports, "display-pod.stl"), print_orientation(pod))
    pl.stl_write(os.path.join(exports, "display-coupon.stl"), build_coupon()[0][1])
    pl.glb_write(os.path.join(exports, "preview-display-pod.glb"), build())
    print(f"face {FACE_L:.1f} long at {TILT:.0f} deg; pod {POD_W:.0f} W x "
          f"{BACK_Y - LIP_Y0:.1f} D x {TOP_Z:.1f} H (Z0 = desk)")
    sys.exit(0 if ok else 1)
