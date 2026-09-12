"""part_display.py — slanted display pods that key onto the back of the pad.

Each pod stands on the desk directly behind the pad at its full 90 mm width,
wraps the tray's R8 back corners, and rests a lip on the plate's back strip —
the one band of the plate top nothing else uses (cap backs end at Y 37.7, the
knob at 37.1, the M3 button heads start at |X| 36.2). No part of the pad changes.

The kernel only extrudes along Z, so a pod is a SIDE PROFILE in (Y, Z) extruded
across X in bands, then mapped (x,y,z) -> (z,x,y) — a cyclic axis permutation,
a proper rotation, so every shell keeps its outward winding. The same fact
makes it print support-free lying on a side wall.

The window is always centred on the pad. Where a module's active area sits off
its PCB centre, the PCB pocket moves instead, so the screen reads centred.

The back closes with a recessed cover on four M2.5 self-tappers (the speaker's
hardware). Each pod is deep enough that its module's headers and their
connectors stay inside, and the wires leave through a cable exit on the face,
right of the screen, low on the slant so they drop toward the pad's side window.

MEASURE YOUR MODULE, then print its coupon (the face alone, printed flat)
before the pod: the module should drop in and show its whole active area.
"""
from __future__ import annotations

import math
import os
import sys

from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

import partlib as pl

OVL = 0.2

# All lengths mm. "u" runs up the slant, "x" across the pad.
MODULES = {
    "st7789_154": dict(
        label='1.54" ST7789 SPI, 240x240', suffix="",
        pcb_x=32.0, pcb_u=44.0,          # one sourced listing: 44 x 32 x 4
        front_t=2.4, pcb_t=1.6,          # glass + backlight above the PCB, the PCB
        aa_x=27.72, aa_u=27.72,
        aa_dx=0.0, aa_du=3.0,            # AA centre vs PCB centre (du: away from the header)
        win_margin=0.6, button_x=0.0, pin_depth=10.0, tilt=55.0),
    "tft24_uno": dict(
        label='2.4" ILI9341 UNO shield, 320x240, resistive touch', suffix="-24",
        pcb_x=72.2, pcb_u=52.7,          # listed PCB 72.20 x 52.7
        front_t=5.0, pcb_t=1.6,          # panel + touch film + tape, estimated
        aa_x=48.96, aa_u=36.72,          # listed active area
        aa_dx=3.6, aa_du=0.0,            # panel sits right of centre, away from the reset button
        win_margin=1.8,                  # generous: the offset is read off a product photo
        button_x=-2.0,                   # the reset button pokes past the PCB's -X edge
        pin_depth=25.0,                  # shield headers (~8.5) + dupont housings behind the PCB
        tilt=50.0),                      # laid back further than the 1.54": this one gets touched
}

# ---- the pod ---------------------------------------------------------------
POD_W = pl.CASE_W   # 90 — the pad's own width, so the two read as one body
WALL = 2.0          # shell + side walls
SKIN = 2.0          # bezel thickness in front of the glass
BEVEL = 1.2         # 45-degree bevel on the window's outer edge, leaving a 0.8 land
BEVEL_STEPS = 3     # across X the bevel is drawn in 0.4-wide steps
BEZEL = 2.0         # solid face margin beyond the stops, along the slant
STOP = 2.0          # end stops that locate the PCB along the slant
RAIL = 2.0          # side rails that locate the PCB across X
CLR = 0.3           # clearance per side around the PCB
FRONT_Y = pl.CASE_W / 2 + 0.2          # 45.2 — 0.2 off the tray's back wall
FACE_Z0 = 46.0      # bottom edge of the face (plate top 41.5, cap tops 54.5)
TOP_FLAT = 4.0      # flat top behind the face's upper edge
FOOT = 10.0         # square recesses for stick-on rubber feet, so a press never slides it
FOOT_DEPTH = 0.6
FOOT_X = (28.0,)    # mirrored to +-28
COVER_T = 2.0       # back cover: a flat plate recessed into the back opening
COVER_RECESS = 3.0  # its outer face sits this far in — clears the R8 back corners
COVER_CLR = 0.25    # per side, around the cover
BOSS_X = 35.5       # four M2.5 x 6 self-tapper bosses at +-X, top and bottom
BOSS_W, BOSS_H, BOSS_D = 7.0, 7.0, 8.0    # across X, up Z, deep in Y
PILOT = 2.2         # square pilot: an M2.5 self-tapper bites on the flats
COVER_HOLE_D = 2.9
PIN_CLEAR = 1.0     # between the headers' connectors and the cover
CABLE_X = (36.0, 41.5)   # cable exit on the face, right of the screen (+X)
CABLE_U = (8.0, 22.0)    # low on the slant, so the wires drop toward the pad's side window

# ---- the lip on the plate's back strip ----------------------------------------
LIP_Y0 = 39.0                          # 1.3 behind the cap backs (37.7)
LIP_Z0 = pl.PLATE_Z1                   # 41.5 — rests on the plate top
LIP_T = 1.6
LIP_HALF = 35.0     # the M3 button heads start at |X| 36.2
CORNER_STEP = 0.5   # plan-corner bands: R8 drawn as 0.5-wide steps


def _case_back_y(ax):
    """The tray/plate outline's back edge at |X| = ax (R8 corners at +-37)."""
    c = pl.CASE_W / 2 - pl.CASE_R
    if ax <= c:
        return pl.CASE_W / 2
    return c + math.sqrt(max(pl.CASE_R ** 2 - (ax - c) ** 2, 0.0))


def _as_polys(geom, min_area=0.05):
    if geom is None or geom.is_empty:
        return []
    out = []
    for g in getattr(geom, "geoms", [geom]):
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


class Pod:
    def __init__(self, key):
        m = self.m = MODULES[key]
        self.key = key
        t = math.radians(m["tilt"])
        self.TU = (math.cos(t), math.sin(t))        # up the face
        self.TN = (math.sin(t), -math.cos(t))       # into the pod
        self.env_t = m["front_t"] + m["pcb_t"]
        self.FACE_L = BEZEL + STOP + CLR + m["pcb_u"] + CLR + STOP + BEZEL
        self.U_PCB0 = BEZEL + STOP
        self.U_PCB1 = self.U_PCB0 + 2 * CLR + m["pcb_u"]
        self.WIN_U = m["aa_u"] + 2 * m["win_margin"]
        self.WIN_X = m["aa_x"] + 2 * m["win_margin"]
        self.U_WIN_C = self.U_PCB0 + CLR + m["pcb_u"] / 2 + m["aa_du"]
        cx = -m["aa_dx"]                              # the AA lands on x = 0
        self.X_LO = cx - m["pcb_x"] / 2 - CLR + min(m["button_x"], 0.0)
        self.X_HI = cx + m["pcb_x"] / 2 + CLR + max(m["button_x"], 0.0)
        self.FACE0 = (FRONT_Y, FACE_Z0)
        self.FACE1 = self.p(self.FACE_L, 0.0)
        # Deep enough that the headers and their connectors end in front of the cover.
        nb = SKIN + self.env_t + CLR
        pin_y = max(self.p(u, nb + m["pin_depth"])[0] for u in (self.U_PCB0, self.U_PCB1))
        self.BACK_Y = max(self.FACE1[0] + TOP_FLAT, pin_y + PIN_CLEAR + COVER_T + COVER_RECESS)
        self.Y_COVER_IN = self.BACK_Y - COVER_RECESS - COVER_T
        self.TOP_Z = self.FACE1[1]
        # ...and clear of the cover's screw bosses. On a shallow pod the top boss
        # hangs into the top header's connector path, so push the back out until
        # it doesn't.
        pins = unary_union([self.quad(ua, ub, nb, nb + m["pin_depth"])
                            for ua, ub in ((self.U_PCB0, self.U_PCB0 + 4.0), (self.U_PCB1 - 4.0, self.U_PCB1))])
        while pins.intersection(self.boss_region(False)).area > 0.0:
            self.BACK_Y += 0.5
            self.Y_COVER_IN = self.BACK_Y - COVER_RECESS - COVER_T
        self.prof = self._profiles()

    # -- face coordinates -> (Y, Z)
    def p(self, u, n):
        return FRONT_Y + u * self.TU[0] + n * self.TN[0], FACE_Z0 + u * self.TU[1] + n * self.TN[1]

    def poly(self, pts):
        return Polygon([self.p(u, n) for u, n in pts])

    def quad(self, u0, u1, n0, n1):
        return self.poly([(u0, n0), (u1, n0), (u1, n1), (u0, n1)])

    def outer(self):
        return Polygon([
            (FRONT_Y, 0.0), (self.BACK_Y, 0.0), (self.BACK_Y, self.TOP_Z), self.FACE1, self.FACE0,
            (FRONT_Y, LIP_Z0 + LIP_T), (LIP_Y0, LIP_Z0 + LIP_T), (LIP_Y0, LIP_Z0), (FRONT_Y, LIP_Z0),
        ])

    def _profiles(self):
        outer = self.outer()
        inner = outer.buffer(-WALL, join_style=2).union(      # the back opening: module in, then the cover
            box(self.BACK_Y - WALL - OVL, WALL, self.BACK_Y + 5.0, self.TOP_Z - WALL))
        shell = outer.difference(inner)
        n_back = SKIN + self.env_t + CLR
        cradle = self.quad(BEZEL, self.FACE_L - BEZEL, SKIN - OVL, n_back).intersection(outer)
        envelope = self.quad(self.U_PCB0, self.U_PCB1, SKIN, n_back + 1.0)
        return {"side": outer, "shell": shell, "rail": shell.union(cradle),
                "pcb": shell.difference(envelope).union(cradle.difference(envelope))}

    def window_cut(self, d):
        """The window, bevelled 45 deg on its outer BEVEL mm; d = mm beyond its X edge."""
        u0, u1 = self.U_WIN_C - self.WIN_U / 2, self.U_WIN_C + self.WIN_U / 2
        e = BEVEL + 1.0
        if d <= 0:
            return self.poly([(u0 - e, -1.0), (u1 + e, -1.0), (u1, BEVEL), (u1, SKIN + OVL),
                              (u0, SKIN + OVL), (u0, BEVEL)])
        if d >= BEVEL:
            return None
        return self.poly([(u0 - e, -1.0), (u1 + e, -1.0), (u1 + d, BEVEL - d), (u0 - d, BEVEL - d)])

    def lip_box(self):
        return box(LIP_Y0 - 1.0, LIP_Z0 - OVL, FRONT_Y + OVL, LIP_Z0 + LIP_T + OVL)

    def boss_region(self, with_pilot):
        """The cover's screw bosses: one on the floor, one hung from the top."""
        yi, out = self.Y_COVER_IN, []
        for z0, z1 in ((WALL - OVL, WALL + BOSS_H),
                       (self.TOP_Z - WALL - BOSS_H, self.TOP_Z - WALL + OVL)):
            b = box(yi - BOSS_D, z0, yi, z1)
            if with_pilot:
                zc = (max(z0, WALL) + min(z1, self.TOP_Z - WALL)) / 2
                b = b.difference(box(yi - BOSS_D - 1.0, zc - PILOT / 2, yi + 1.0, zc + PILOT / 2))
            out.append(b)
        return unary_union(out)

    def cable_cut(self):
        """The cable exit through the face, bevelled like the window."""
        u0, u1 = CABLE_U
        e = BEVEL + 1.0
        return self.poly([(u0 - e, -1.0), (u1 + e, -1.0), (u1, BEVEL), (u1, SKIN + OVL),
                          (u0, SKIN + OVL), (u0, BEVEL)])

    def edges(self):
        h, c = POD_W / 2, POD_W / 2 - pl.CASE_R
        E = {-h, h, 0.0, -(h - WALL), h - WALL, self.X_LO, self.X_HI,
             self.X_LO - RAIL, self.X_HI + RAIL, -LIP_HALF, LIP_HALF}
        for s in (-1, 1):
            for k in range(BEVEL_STEPS + 1):
                E.add(s * (self.WIN_X / 2 + k * BEVEL / BEVEL_STEPS))
            x = c
            while x < h - 1e-9:
                E.add(s * x)
                x += CORNER_STEP
            for fx in FOOT_X:
                E.add(s * (fx - FOOT / 2)); E.add(s * (fx + FOOT / 2))
            for bx in (BOSS_X - BOSS_W / 2, BOSS_X + BOSS_W / 2, BOSS_X - PILOT / 2, BOSS_X + PILOT / 2):
                E.add(s * bx)
        E.add(CABLE_X[0]); E.add(CABLE_X[1])
        E = sorted(e for e in E if -h - 1e-9 <= e <= h + 1e-9)
        out = [E[0]]
        for e in E[1:]:
            if e - out[-1] > 0.05:
                out.append(e)
        return out

    def band_profile(self, a, b):
        h, c = POD_W / 2, POD_W / 2 - pl.CASE_R
        mid, prof = (a + b) / 2, self.prof
        am, inner, outer_ax = abs(mid), min(abs(a), abs(b)), max(abs(a), abs(b))
        if am > h - WALL:
            p = prof["side"]
        elif self.X_LO < mid < self.X_HI:
            p = prof["pcb"]
            cut = self.window_cut(am - self.WIN_X / 2)
            if cut is not None:
                p = p.difference(cut)
        elif self.X_LO - RAIL <= mid <= self.X_HI + RAIL:
            p = prof["rail"]
        else:
            p = prof["shell"]
        if mid > 0 and CABLE_X[0] < am < CABLE_X[1]:  # cable exit, right of the screen
            p = p.difference(self.cable_cut())
        if BOSS_X - BOSS_W / 2 < am < BOSS_X + BOSS_W / 2:
            p = p.union(self.boss_region(abs(am - BOSS_X) < PILOT / 2))
        if inner >= LIP_HALF - 1e-9:                  # lip only between the screw heads
            p = p.difference(self.lip_box())
        for fx in FOOT_X:                            # rubber-foot recesses under the base
            if fx - FOOT / 2 < am < fx + FOOT / 2:
                for yc in (FRONT_Y + 9.0, self.BACK_Y - 9.0):
                    p = p.difference(box(yc - FOOT / 2, -1.0, yc + FOOT / 2, FOOT_DEPTH))
        if outer_ax > c + 1e-9:
            axo = min(outer_ax + OVL / 2, h)             # the band is stretched by OVL/2
            yb = self.BACK_Y - pl.CASE_R + math.sqrt(max(pl.CASE_R ** 2 - (axo - c) ** 2, 0.0))
            p = p.intersection(box(-1.0, -1.0, yb, self.TOP_Z + 1.0))
            yf = _case_back_y(max(inner - OVL / 2, 0.0)) + 0.2
            if yf < FRONT_Y - 0.05:                     # wrap the tray's R8 up to the plate top
                p = p.union(box(yf, 0.0, FRONT_Y + OVL, LIP_Z0))
        return p

    def build(self):
        h, mesh = POD_W / 2, pl.Mesh()
        E = self.edges()
        for a, b in zip(E, E[1:]):
            band = _band(self.band_profile(a, b), max(a - OVL / 2, -h), min(b + OVL / 2, h))
            if band is not None:
                mesh += band
        return [("display-pod" + self.m["suffix"], mesh, pl.COLORS["plate"])]

    def build_cover(self, world=True):
        """The back cover: a flat plate recessed into the back opening, on four
        M2.5 self-tappers. Drawn in (Z, X) and extruded along Y, so the same
        cyclic remap as the pod puts it in place."""
        hx = POD_W / 2 - WALL - COVER_CLR
        z0, z1 = WALL + COVER_CLR, self.TOP_Z - WALL - COVER_CLR
        plate = affinity.translate(pl.rounded_rect(z1 - z0, 2 * hx, 1.0), (z0 + z1) / 2, 0.0)
        holes = unary_union([affinity.translate(pl.circle(COVER_HOLE_D), zc, sx * BOSS_X)
                             for zc in (WALL + BOSS_H / 2, self.TOP_Z - WALL - BOSS_H / 2)
                             for sx in (-1, 1)])
        m = pl.prism(plate.difference(holes), self.Y_COVER_IN, self.Y_COVER_IN + COVER_T)
        if world:
            m.V = [(y, z, x) for x, y, z in m.V]   # (Z, X, Y) -> (X, Y, Z): cyclic, det +1
        else:
            m.translate(0.0, 0.0, -self.Y_COVER_IN)
        return [("display-cover" + self.m["suffix"], m, pl.COLORS["plate"])]

    def build_coupon(self):
        """The pod's face alone, printed flat: does the module drop in and does the
        window show its whole active area?"""
        x0, x1 = self.X_LO - RAIL, self.X_HI + RAIL
        outline = affinity.translate(pl.rounded_rect(x1 - x0, self.FACE_L, 2.0),
                                     (x0 + x1) / 2, self.FACE_L / 2)
        win = box(-self.WIN_X / 2, self.U_WIN_C - self.WIN_U / 2,
                  self.WIN_X / 2, self.U_WIN_C + self.WIN_U / 2)
        env = box(self.X_LO, self.U_PCB0, self.X_HI, self.U_PCB1)
        m = pl.Mesh()
        m += pl.prism(outline.difference(win), 0.0, SKIN)
        m += pl.prism(outline.difference(env), SKIN - OVL, SKIN + self.env_t + CLR)
        return [("display-coupon" + self.m["suffix"], m, pl.COLORS["plate"])]


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
    for key in MODULES:
        pod = Pod(key)
        items, coupon, cover = pod.build(), pod.build_coupon(), pod.build_cover()
        for name, mesh, _ in items + coupon + cover:
            rep = pl.validate(mesh)
            print(f"{name}: shells={rep['shells']} tris={rep['triangles']} "
                  f"watertight={rep['watertight']} {rep['problems'][:2]}")
            ok &= rep["watertight"]
        sfx = pod.m["suffix"]
        pl.stl_write(os.path.join(exports, f"display-pod{sfx}.stl"), print_orientation(items[0][1]))
        pl.stl_write(os.path.join(exports, f"display-coupon{sfx}.stl"), coupon[0][1])
        pl.stl_write(os.path.join(exports, f"display-cover{sfx}.stl"), pod.build_cover(world=False)[0][1])
        pl.glb_write(os.path.join(exports, f"preview-display-pod{sfx}.glb"), items + cover)
        print(f"  {pod.m['label']}: face {pod.FACE_L:.1f} at {pod.m['tilt']:.0f} deg, "
              f"window {pod.WIN_X:.1f} x {pod.WIN_U:.1f}; pod 90 W x "
              f"{pod.BACK_Y - LIP_Y0:.1f} D x {pod.TOP_Z:.1f} H")
    sys.exit(0 if ok else 1)
