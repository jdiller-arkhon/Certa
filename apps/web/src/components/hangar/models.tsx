'use client';

import type { Airframe } from '@certa/contract';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useGLTF } from '@react-three/drei';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural drone models for the Today hangar. One unit ≈ 30 cm; +x is the nose, +z the
 * right side. Every part sits in a <Part> that slides outward along `dir` as `explode` goes
 * 0 → 1, for the inspect view.
 *
 * Generic airframes on purpose: proportions follow the common layouts (folding quad, heavy-
 * lift hex/octo, quadplane VTOL) but no manufacturer's design, trade dress, or marking is
 * reproduced, and nothing carries a logo.
 */

export interface DroneState {
  /** 0 = parked, 1 = full hover rpm. */
  spin: number;
  /** 0 = assembled, 1 = parts pulled apart. */
  explode: number;
}

export interface Palette {
  body: string;
  shell: string;
  metal: string;
  prop: string;
  status: string;
}

type V3 = [number, number, number];
type StateRef = React.RefObject<DroneState>;

// ---------------------------------------------------------------------------------------
// Geometry. Built once per shape and shared by every aircraft in the hangar.
// ---------------------------------------------------------------------------------------

const GEO = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = GEO.get(key);
  if (!g) {
    g = make();
    GEO.set(key, g);
  }
  return g;
}

/** One cross-section of a lofted surface (blade, wing, tail). Distances are absolute. */
interface Station {
  /** Position along the span axis (+x). */
  s: number;
  chord: number;
  /** Maximum thickness. */
  thick: number;
  /** Nose-up rotation about the quarter chord, radians. */
  twist: number;
  /** Shift toward the trailing edge (sweep back). */
  sweep?: number;
  /** Shift along +y (dihedral, blade coning). */
  lift?: number;
}

/**
 * Lofts a cambered, NACA-style airfoil through the stations along +x. Chord runs along z
 * with the leading edge at +z (`mirror` puts it at −z, for the opposite rotation), thickness
 * along y. Both ends are capped.
 */
function loft(stations: Station[], { camber = 0.04, mirror = false, samples = 11 } = {}) {
  const us = Array.from({ length: samples }, (_, k) => (1 - Math.cos((Math.PI * k) / (samples - 1))) / 2);
  const half = (u: number) => 5 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  // Closed ring: upper surface trailing edge → leading edge, then lower surface back.
  const ring: [number, number][] = [];
  for (let k = samples - 1; k >= 0; k--) ring.push([us[k]!, 1]);
  for (let k = 1; k < samples - 1; k++) ring.push([us[k]!, -1]);
  const n = ring.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const zs = mirror ? -1 : 1;
  for (const st of stations) {
    const c = Math.cos(st.twist), sn = Math.sin(st.twist);
    for (const [u, side] of ring) {
      const cam = camber * st.chord * 4 * u * (1 - u);
      const t = st.thick * half(u) * (side > 0 ? 1 : 0.7);
      const y0 = cam + side * t;
      const z0 = -(u - 0.25) * st.chord;
      const z = z0 * c - y0 * sn - (st.sweep ?? 0);
      const y = z0 * sn + y0 * c + (st.lift ?? 0);
      pos.push(st.s, y, z * zs);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), cc = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
      idx.push(a, b, cc, a, cc, d);
    }
  }
  // End caps: a fan to each end's centroid.
  for (const [i, flip] of [[0, true], [stations.length - 1, false]] as const) {
    const centre = pos.length / 3;
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < n; j++) {
      x += pos[(i * n + j) * 3]!;
      y += pos[(i * n + j) * 3 + 1]!;
      z += pos[(i * n + j) * 3 + 2]!;
    }
    pos.push(x / n, y / n, z / n);
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n);
      if (flip) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  if (mirror) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2]!, idx[k + 1]!];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tapered, twisted two-blade propeller blade of radius `r` (one blade, along +x). */
function bladeGeo(r: number, mirror: boolean) {
  return geo(`blade:${r}:${mirror}`, () => {
    const f = [0.06, 0.12, 0.2, 0.32, 0.46, 0.6, 0.74, 0.86, 0.94, 0.985, 1];
    const chord = [0.075, 0.12, 0.15, 0.158, 0.15, 0.134, 0.114, 0.092, 0.07, 0.045, 0.012];
    const twist = [26, 25, 22, 18.5, 15.5, 13, 11, 9.8, 9.2, 9, 9];
    const thick = [0.4, 0.2, 0.13, 0.105, 0.095, 0.09, 0.085, 0.085, 0.085, 0.09, 0.2];
    const sweep = [0, 0, 0, 0, 0, 0.004, 0.01, 0.018, 0.025, 0.03, 0.034];
    return loft(
      f.map((k, i) => ({ s: k * r, chord: chord[i]! * r, thick: thick[i]! * chord[i]! * r, twist: (twist[i]! * Math.PI) / 180, sweep: sweep[i]! * r, lift: k * r * 0.025 })),
      { camber: 0.045, mirror },
    );
  });
}

/**
 * A rounded, tapered hull: a superellipsoid (boxy but soft) that narrows toward the nose and
 * is flatter underneath. `a`, `b`, `c` are the half-length, half-height and half-width.
 */
function hullGeo(a: number, b: number, c: number, { taper = 0.28, belly = 0.72, power = 0.55 } = {}) {
  return geo(`hull:${a}:${b}:${c}:${taper}:${belly}:${power}`, () => {
    const g = new THREE.SphereGeometry(1, 56, 32);
    const p = g.attributes.position as THREE.BufferAttribute;
    const f = (v: number) => Math.sign(v) * Math.abs(v) ** power;
    for (let i = 0; i < p.count; i++) {
      const x = f(p.getX(i)), y = f(p.getY(i)), z = f(p.getZ(i));
      const narrow = 1 - taper * Math.max(0, x) ** 1.5;
      const drop = 1 - 0.18 * Math.max(0, x) ** 2; // the nose sits a little lower
      p.setXYZ(i, x * a, (y < 0 ? y * belly : y * drop) * b, z * c * narrow);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** A lathe (profile [radius, y]) laid along +x when `alongX`, else upright. */
function latheGeo(key: string, profile: [number, number][], { segments = 40, alongX = false } = {}) {
  return geo(`lathe:${key}`, () => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
    if (alongX) g.rotateZ(-Math.PI / 2);
    return g;
  });
}

/** Outrunner motor bell with radial cooling vanes on the cap and a chamfered rim, merged. */
function bellGeo(r: number) {
  return geo(`bell:${r}`, () => {
    const h = r * 0.95;
    const bell = new THREE.LatheGeometry(
      ([[r * 0.88, 0], [r * 0.95, 0], [r, h * 0.12], [r, h * 0.8], [r * 0.96, h * 0.93], [r * 0.82, h], [r * 0.38, h * 1.04], [r * 0.35, h], [0, h]] as [number, number][]).map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    );
    const vanes = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const v = new THREE.BoxGeometry(r * 0.42, r * 0.09, r * 0.07);
      v.translate(r * 0.6, h + r * 0.03, 0);
      v.rotateY(a);
      return v;
    });
    bell.deleteAttribute('uv');
    for (const v of vanes) v.deleteAttribute('uv');
    return mergeGeometries([bell.toNonIndexed(), ...vanes.map((v) => v.toNonIndexed())])!;
  });
}

/** A tube along a smooth path (landing legs, antenna leads). */
function tubeGeo(key: string, pts: V3[], radius: number) {
  return geo(`tube:${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, radius, 10, false));
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------

let carbonTex: THREE.Texture | null = null;
/** A small 2×2 twill weave, tiled across arms and plates. */
function carbon() {
  if (carbonTex || typeof document === 'undefined') return carbonTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const s = 16;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const along = (x + y) % 4 < 2;
      const grad = along ? g.createLinearGradient(x * s, 0, x * s + s, 0) : g.createLinearGradient(0, y * s, 0, y * s + s);
      grad.addColorStop(0, '#141416');
      grad.addColorStop(0.5, along ? '#3a3a40' : '#2a2a2f');
      grad.addColorStop(1, '#141416');
      g.fillStyle = grad;
      g.fillRect(x * s, y * s, s, s);
    }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(6, 1.5);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  return carbonTex;
}

const emissive = (c: string, i = 2.4) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: i, toneMapped: false });

function useMats(p: Palette) {
  return useMemo(
    () => ({
      /** Moulded chassis plastic: satin, slightly textured. */
      body: new THREE.MeshPhysicalMaterial({ color: p.body, roughness: 0.55, metalness: 0.05, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
      /** Painted shell panels: glossy clearcoat. */
      shell: new THREE.MeshPhysicalMaterial({ color: p.shell, roughness: 0.34, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.08 }),
      carbon: new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: carbon(), roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.18 }),
      metal: new THREE.MeshPhysicalMaterial({ color: p.metal, roughness: 0.26, metalness: 0.95 }),
      dark: new THREE.MeshPhysicalMaterial({ color: '#26262b', roughness: 0.38, metalness: 0.8 }),
      copper: new THREE.MeshStandardMaterial({ color: '#b5703f', roughness: 0.35, metalness: 0.9 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.92, metalness: 0 }),
      prop: new THREE.MeshPhysicalMaterial({ color: p.prop, roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
      /** Cover glass over lenses and vision sensors. */
      glass: new THREE.MeshPhysicalMaterial({ color: '#06080b', roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0 }),
      /** The coated front element: a faint blue-violet sheen. */
      coat: new THREE.MeshPhysicalMaterial({ color: '#1d2440', roughness: 0.06, metalness: 0.9, iridescence: 0.8, iridescenceIOR: 1.6 }),
      led: emissive(p.status),
      red: emissive('#ff2a1f', 2),
      green: emissive('#19e05a', 2),
      white: emissive('#f4f6ff', 1.6),
      blur: new THREE.MeshBasicMaterial({ color: p.prop, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [p.body, p.shell, p.metal, p.prop, p.status],
  );
}
type Mats = ReturnType<typeof useMats>;

// ---------------------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------------------

/** A part that slides out along `dir` (scaled by `dist`) when the drone is exploded. */
function Part({ state, dir, dist = 0.6, children, position = [0, 0, 0] }: { state: StateRef; dir: V3; dist?: number; children: ReactNode; position?: V3 }) {
  const ref = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(...dir).normalize().multiplyScalar(dist), [dir, dist]);
  useFrame(() => {
    const e = state.current?.explode ?? 0;
    ref.current?.position.set(position[0] + v.x * e, position[1] + v.y * e, position[2] + v.z * e);
  });
  return <group ref={ref} position={position}>{children}</group>;
}

/**
 * Two-blade folding propeller: lofted airfoil blades on a hub with a spinner cap. A
 * translucent disc and tip ring fade in as it spins up. Alternate rotors turn opposite ways
 * and carry mirrored blades, as on a real airframe.
 */
function Rotor({ state, mats, radius, ccw, phase }: { state: StateRef; mats: Mats; radius: number; ccw: boolean; phase: number }) {
  const blades = useRef<THREE.Group>(null);
  const blur = useMemo(() => [mats.blur.clone(), mats.blur.clone()] as const, [mats]);
  const blade = bladeGeo(radius, ccw);
  const hub = Math.max(0.022, radius * 0.07);
  useFrame((_, dt) => {
    const s = state.current?.spin ?? 0;
    if (blades.current && s > 0.01) blades.current.rotation.y += (ccw ? 1 : -1) * (0.15 + s * 55) * dt;
    const o = Math.max(0, s - 0.35);
    blur[0].opacity = o * 0.22;
    blur[1].opacity = o * 0.4;
  });
  return (
    <group>
      <group ref={blades} rotation={[0, phase, 0]}>
        <mesh geometry={blade} material={mats.prop} />
        <mesh geometry={blade} material={mats.prop} rotation={[0, Math.PI, 0]} />
        <mesh material={mats.dark} position={[0, -0.004, 0]}>
          <cylinderGeometry args={[hub, hub * 1.1, 0.026, 20]} />
        </mesh>
        <mesh geometry={latheGeo(`spinner:${hub}`, [[hub * 0.85, 0], [hub * 0.75, hub * 0.5], [hub * 0.45, hub * 0.8], [0, hub * 0.9]], { segments: 20 })} material={mats.prop} position={[0, 0.009, 0]} />
      </group>
      <mesh material={blur[0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 48]} />
      </mesh>
      <mesh material={blur[1]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[radius * 0.86, radius * 0.995, 64]} />
      </mesh>
    </group>
  );
}

/** Outrunner motor: dark mount, a band of copper windings, finned bell, then the rotor. */
function Motor({ state, mats, r, propR, ccw, phase }: { state: StateRef; mats: Mats; r: number; propR: number; ccw: boolean; phase: number }) {
  const h = r * 0.95;
  return (
    <group>
      <mesh material={mats.dark} position={[0, r * 0.18, 0]}>
        <cylinderGeometry args={[r * 0.92, r * 1.0, r * 0.36, 32]} />
      </mesh>
      <mesh material={mats.copper} position={[0, r * 0.43, 0]}>
        <cylinderGeometry args={[r * 0.86, r * 0.86, r * 0.14, 32]} />
      </mesh>
      <mesh geometry={bellGeo(r)} material={mats.metal} position={[0, r * 0.5, 0]} />
      <group position={[0, r * 0.5 + h + r * 0.2, 0]}>
        <Rotor state={state} mats={mats} radius={propR} ccw={ccw} phase={phase} />
      </group>
    </group>
  );
}

/** Camera on a three-axis gimbal: yaw motor, roll arm, pitch motor, then the camera head. */
function Gimbal({ mats, size = 1 }: { mats: Mats; size?: number }) {
  const s = size;
  return (
    <group scale={s}>
      {/* Damped mount plate and yaw motor */}
      <RoundedBox args={[0.1, 0.014, 0.09]} radius={0.006} smoothness={3} material={mats.body} position={[0, 0.03, 0]} />
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <mesh key={`${x}${z}`} material={mats.rubber} position={[x * 0.036, 0.016, z * 0.03]}>
          <sphereGeometry args={[0.011, 12, 10]} />
        </mesh>
      )))}
      <mesh material={mats.dark} position={[0, -0.002, 0]}>
        <cylinderGeometry args={[0.026, 0.028, 0.026, 24]} />
      </mesh>
      {/* Roll arm: down the left side to the pitch motor */}
      <RoundedBox args={[0.03, 0.012, 0.07]} radius={0.004} smoothness={3} material={mats.body} position={[0, -0.02, -0.03]} />
      <RoundedBox args={[0.03, 0.07, 0.012]} radius={0.004} smoothness={3} material={mats.body} position={[0, -0.05, -0.062]} />
      <mesh material={mats.dark} position={[0, -0.08, -0.052]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.016, 20]} />
      </mesh>
      {/* Camera head */}
      <group position={[0.004, -0.08, 0]}>
        <RoundedBox args={[0.085, 0.072, 0.085]} radius={0.016} smoothness={4} material={mats.shell} />
        <RoundedBox args={[0.012, 0.05, 0.05]} radius={0.004} smoothness={2} material={mats.body} position={[-0.044, 0, 0]} />
        <group position={[0.043, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh material={mats.body} position={[0, 0.006, 0]}>
            <cylinderGeometry args={[0.03, 0.032, 0.012, 32]} />
          </mesh>
          <mesh material={mats.dark} position={[0, 0.016, 0]}>
            <cylinderGeometry args={[0.027, 0.03, 0.01, 32]} />
          </mesh>
          <mesh material={mats.coat} position={[0, 0.0215, 0]}>
            <sphereGeometry args={[0.022, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3]} />
          </mesh>
          <mesh material={mats.glass} position={[0, 0.019, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.002, 32]} />
          </mesh>
        </group>
        {/* Secondary sensor (zoom / thermal) window */}
        <mesh material={mats.glass} position={[0.043, -0.02, 0.026]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.004, 16]} />
        </mesh>
      </group>
    </group>
  );
}

/** A pair of stereo vision sensors behind a dark bezel, facing +x of its own frame. */
function VisionPair({ mats, spread = 0.06 }: { mats: Mats; spread?: number }) {
  return (
    <group>
      <RoundedBox args={[0.02, 0.026, spread + 0.04]} radius={0.008} smoothness={3} material={mats.glass} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0.011, 0, (s * spread) / 2]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh material={mats.dark}>
            <cylinderGeometry args={[0.009, 0.009, 0.003, 16]} />
          </mesh>
          <mesh material={mats.coat} position={[0, 0.002, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.002, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Smart battery: moulded case, grip ridges, side latches, and a charge gauge in status color. */
function Battery({ mats, len, width, height }: { mats: Mats; len: number; width: number; height: number }) {
  return (
    <group>
      <RoundedBox args={[len, height, width]} radius={Math.min(height, width) * 0.3} smoothness={4} material={mats.body} />
      <RoundedBox args={[len * 0.9, height * 0.12, width * 0.9]} radius={height * 0.05} smoothness={2} material={mats.shell} position={[0, height * 0.46, 0]} />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[len * 0.16, height * 0.42, 0.01]} radius={0.004} smoothness={2} material={mats.dark} position={[len * 0.28, 0, (s * width) / 2]} />
      ))}
      {/* Rear face: power button and four-segment gauge */}
      <group position={[-len / 2 - 0.002, 0, 0]}>
        <mesh material={mats.dark} rotation={[0, 0, Math.PI / 2]} position={[0, 0, width * 0.28]}>
          <cylinderGeometry args={[0.009, 0.009, 0.004, 16]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} material={i < 3 ? mats.led : mats.dark} position={[0, 0, -width * 0.3 + i * width * 0.1]}>
            <boxGeometry args={[0.003, height * 0.12, width * 0.06]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------
// Airframes
// ---------------------------------------------------------------------------------------

/** Folding quad: sculpted hull, staggered folding arms, arched landing legs, front gimbal. */
function Quad({ palette, state }: { palette: Palette; state: StateRef }) {
  const mats = useMats(palette);
  const armLen = 0.78, propR = 0.42, motorR = 0.058;
  // Front arms ride high, rear arms low: the usual stagger so folded props clear each other.
  const arms = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((a, i) => ({ a, i, front: Math.cos(a) > 0 }));
  return (
    <group>
      {/* Chassis hull, vision sensors, nav lights */}
      <Part state={state} dir={[0, 0, 0]} dist={0}>
        <mesh geometry={hullGeo(0.33, 0.085, 0.17)} material={mats.body} />
        <group position={[0.3, 0.008, 0]}>
          <VisionPair mats={mats} spread={0.1} />
        </group>
        <group position={[-0.325, 0.012, 0]} rotation={[0, Math.PI, 0]}>
          <VisionPair mats={mats} spread={0.08} />
        </group>
        {/* Downward vision and the ranging sensor between them */}
        <group position={[0.02, -0.058, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <VisionPair mats={mats} spread={0.07} />
        </group>
        <mesh material={mats.glass} position={[-0.09, -0.059, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.006, 16]} />
        </mesh>
        {/* Rear status light: the slot's readiness color */}
        <mesh material={mats.led} position={[-0.33, 0.04, 0]}>
          <boxGeometry args={[0.008, 0.01, 0.07]} />
        </mesh>
      </Part>
      {/* Top canopy over the flight controller, with the GNSS dome */}
      <Part state={state} dir={[0, 1, 0]} dist={0.45} position={[0.02, 0.055, 0]}>
        <mesh geometry={hullGeo(0.27, 0.05, 0.13, { taper: 0.32, belly: 0.4 })} material={mats.shell} />
        <mesh geometry={latheGeo('gnss-q', [[0.044, 0], [0.04, 0.008], [0.025, 0.018], [0, 0.022]])} material={mats.shell} position={[0.12, 0.038, 0]} />
        <mesh material={mats.dark} position={[0.12, 0.039, 0]}>
          <cylinderGeometry args={[0.046, 0.046, 0.004, 32]} />
        </mesh>
      </Part>
      {/* Battery, slotted into the back of the canopy */}
      <Part state={state} dir={[0, 1, 0]} dist={0.95} position={[-0.12, 0.11, 0]}>
        <Battery mats={mats} len={0.27} width={0.15} height={0.06} />
      </Part>
      {/* Gimbal camera under the nose */}
      <Part state={state} dir={[1, -0.3, 0]} dist={0.55} position={[0.26, -0.06, 0]}>
        <Gimbal mats={mats} size={1.15} />
      </Part>
      {/* Arched landing legs with skids */}
      <Part state={state} dir={[0, -1, 0]} dist={0.28}>
        {[-1, 1].map((s) => (
          <group key={s}>
            {[-1, 1].map((f) => (
              <mesh key={f} geometry={tubeGeo(`qleg:${s}:${f}`, [[f * 0.1, -0.05, s * 0.07], [f * 0.13, -0.16, s * 0.15], [f * 0.15, -0.28, s * 0.19]], 0.011)} material={mats.body} />
            ))}
            <mesh material={mats.body} position={[0, -0.29, s * 0.19]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.014, 0.44, 6, 14]} />
            </mesh>
            {[-1, 1].map((f) => (
              <mesh key={f} material={mats.rubber} position={[f * 0.2, -0.295, s * 0.19]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.018, 0.05, 6, 12]} />
              </mesh>
            ))}
            {/* Antenna blade inside the rear leg */}
            <RoundedBox args={[0.05, 0.1, 0.006]} radius={0.003} smoothness={2} material={mats.dark} position={[-0.13, -0.18, s * 0.16]} rotation={[s * 0.45, 0, 0]} />
          </group>
        ))}
      </Part>
      {/* Folding arms, motors, rotors */}
      {arms.map(({ a, i, front }) => {
        const x = Math.cos(a), z = Math.sin(a);
        const y = front ? 0.035 : -0.025;
        const r0 = 0.16;
        const len = armLen - r0;
        return (
          <Part key={i} state={state} dir={[x, 0.15, z]} dist={0.55}>
            <group rotation={[0, -a, 0]}>
              {/* Hinge knuckle and pin */}
              <mesh material={mats.body} position={[r0, y, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.05, 20]} />
              </mesh>
              <mesh material={mats.metal} position={[r0, y + 0.028, 0]}>
                <cylinderGeometry args={[0.012, 0.012, 0.008, 16]} />
              </mesh>
              {/* Flattened arm, slightly thinner toward the motor */}
              <mesh material={mats.body} position={[r0 + len / 2, y, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.72]}>
                <cylinderGeometry args={[0.022, 0.03, len, 16]} />
              </mesh>
              {/* Motor pod */}
              <group position={[armLen, y, 0]}>
                <mesh material={mats.body} position={[0, -0.005, 0]}>
                  <cylinderGeometry args={[motorR * 1.12, motorR * 0.9, 0.05, 28]} />
                </mesh>
                {/* Nav lights under the pods: red left, green right in front, white strobes behind */}
                <mesh material={front ? (z > 0 ? mats.green : mats.red) : mats.white} position={[0, -0.033, 0]}>
                  <sphereGeometry args={[0.012, 12, 8]} />
                </mesh>
                <group position={[0, 0.02, 0]}>
                  <Motor state={state} mats={mats} r={motorR} propR={propR} ccw={i % 2 === 0} phase={i * 0.7} />
                </group>
              </group>
            </group>
          </Part>
        );
      })}
    </group>
  );
}

/**
 * Heavy-lift hex or octo: round electronics hub on a carbon centre plate, carbon tube arms
 * with mid-arm folding sleeves and motor clamps, dual batteries, a GNSS mast, and a skid
 * landing gear.
 */
function HeavyLift({ arms, palette, state }: { arms: 6 | 8; palette: Palette; state: StateRef }) {
  const mats = useMats(palette);
  const armLen = arms === 6 ? 0.92 : 1.02;
  const propR = arms === 6 ? 0.36 : 0.3;
  const motorR = arms === 6 ? 0.056 : 0.05;
  const offset = arms === 6 ? Math.PI / 6 : Math.PI / 8;
  const angles = Array.from({ length: arms }, (_, i) => offset + (i / arms) * Math.PI * 2);
  return (
    <group>
      {/* Centre plates and electronics hub */}
      <Part state={state} dir={[0, 0, 0]} dist={0}>
        {[-0.045, 0.045].map((y) => (
          <mesh key={y} material={mats.carbon} position={[0, y, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.008, arms * 2]} />
          </mesh>
        ))}
        <mesh geometry={latheGeo('hub', [[0, -0.04], [0.2, -0.04], [0.23, -0.025], [0.235, 0.02], [0.215, 0.04], [0, 0.04]], { segments: 48 })} material={mats.body} />
        {/* Standoffs between the plates */}
        {angles.map((a, i) => (
          <mesh key={i} material={mats.metal} position={[Math.cos(a + Math.PI / arms) * 0.25, 0, Math.sin(a + Math.PI / arms) * 0.25]}>
            <cylinderGeometry args={[0.007, 0.007, 0.09, 8]} />
          </mesh>
        ))}
        <group position={[0.235, 0.0, 0]}>
          <VisionPair mats={mats} spread={0.09} />
        </group>
        <mesh material={mats.led} position={[-0.236, 0.0, 0]}>
          <boxGeometry args={[0.008, 0.012, 0.08]} />
        </mesh>
      </Part>
      {/* Canopy, flight controller, GNSS mast */}
      <Part state={state} dir={[0, 1, 0]} dist={0.45} position={[0, 0.05, 0]}>
        <mesh geometry={latheGeo('canopy', [[0, 0], [0.215, 0], [0.205, 0.045], [0.18, 0.075], [0.15, 0.085], [0, 0.085]], { segments: 48 })} material={mats.shell} />
        <mesh material={mats.carbon} position={[-0.16, 0.16, 0]}>
          <cylinderGeometry args={[0.009, 0.009, 0.16, 12]} />
        </mesh>
        <mesh material={mats.dark} position={[-0.16, 0.085, 0]}>
          <cylinderGeometry args={[0.016, 0.02, 0.02, 16]} />
        </mesh>
        <group position={[-0.16, 0.24, 0]}>
          <mesh material={mats.dark}>
            <cylinderGeometry args={[0.042, 0.042, 0.006, 32]} />
          </mesh>
          <mesh geometry={latheGeo('gnss-h', [[0.045, 0], [0.042, 0.01], [0.03, 0.022], [0, 0.028]])} material={mats.shell} position={[0, 0.003, 0]} />
        </group>
        {/* Telemetry antennas at the rear */}
        {[-1, 1].map((s) => (
          <group key={s} position={[-0.17, 0.05, s * 0.1]} rotation={[s * 0.35, 0, 0.25]}>
            <mesh material={mats.dark} position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.006, 0.008, 0.12, 10]} />
            </mesh>
            <mesh material={mats.dark} position={[0, 0.123, 0]}>
              <sphereGeometry args={[0.007, 10, 8]} />
            </mesh>
          </group>
        ))}
      </Part>
      {/* Dual batteries on the canopy deck */}
      <Part state={state} dir={[0, 1, 0]} dist={0.95} position={[0.03, 0.172, 0]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 0, s * 0.058]}>
            <Battery mats={mats} len={0.24} width={0.1} height={0.07} />
          </group>
        ))}
      </Part>
      {/* Gimbal under the hub, slightly forward */}
      <Part state={state} dir={[1, -0.3, 0]} dist={0.55} position={[0.12, -0.06, 0]}>
        <Gimbal mats={mats} size={1.45} />
      </Part>
      {/* Skid landing gear */}
      <Part state={state} dir={[0, -1, 0]} dist={0.28}>
        {[-1, 1].map((s) => (
          <group key={s}>
            {[-1, 1].map((f) => (
              <group key={f}>
                <mesh geometry={tubeGeo(`hleg:${s}:${f}`, [[f * 0.11, -0.05, s * 0.11], [f * 0.13, -0.17, s * 0.19], [f * 0.14, -0.29, s * 0.24]], 0.012)} material={mats.carbon} />
                <mesh material={mats.dark} position={[f * 0.11, -0.055, s * 0.11]}>
                  <boxGeometry args={[0.04, 0.02, 0.04]} />
                </mesh>
                <mesh material={mats.dark} position={[f * 0.14, -0.295, s * 0.24]}>
                  <cylinderGeometry args={[0.02, 0.02, 0.026, 14]} />
                </mesh>
              </group>
            ))}
            <mesh material={mats.carbon} position={[0, -0.3, s * 0.24]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.011, 0.011, 0.56, 12]} />
            </mesh>
            {[-1, 1].map((f) => (
              <mesh key={f} material={mats.rubber} position={[f * 0.285, -0.3, s * 0.24]} rotation={[0, 0, Math.PI / 2]}>
                <capsuleGeometry args={[0.015, 0.02, 6, 12]} />
              </mesh>
            ))}
            {/* Cross brace */}
            <mesh material={mats.carbon} position={[0, -0.17, s * 0.19]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.006, 0.006, 0.26, 8]} />
            </mesh>
          </group>
        ))}
      </Part>
      {/* Arms */}
      {angles.map((a, i) => {
        const x = Math.cos(a), z = Math.sin(a);
        const r0 = 0.2;
        const len = armLen - r0;
        const fold = r0 + 0.17;
        const front = x > 0.3;
        return (
          <Part key={i} state={state} dir={[x, 0.15, z]} dist={0.55}>
            <group rotation={[0, -a, 0]}>
              {/* Root clamp */}
              <RoundedBox args={[0.06, 0.05, 0.05]} radius={0.008} smoothness={2} material={mats.dark} position={[r0 + 0.03, 0, 0]} />
              <mesh material={mats.carbon} position={[r0 + len / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.017, 0.017, len, 14]} />
              </mesh>
              {/* Folding sleeve with its lock lever */}
              <mesh material={mats.dark} position={[fold, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.025, 0.025, 0.07, 18]} />
              </mesh>
              <RoundedBox args={[0.05, 0.01, 0.014]} radius={0.004} smoothness={2} material={mats.metal} position={[fold + 0.01, 0.028, 0]} />
              {/* Motor clamp */}
              <group position={[armLen, 0, 0]}>
                <mesh material={mats.dark} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.024, 0.024, 0.05, 16]} />
                </mesh>
                <mesh material={mats.dark} position={[0, 0.024, 0]}>
                  <cylinderGeometry args={[motorR * 1.05, motorR * 1.05, 0.012, 24]} />
                </mesh>
                <mesh material={front ? (z > 0 ? mats.green : mats.red) : mats.white} position={[0, -0.028, 0]}>
                  <sphereGeometry args={[0.01, 12, 8]} />
                </mesh>
                <group position={[0, 0.03, 0]}>
                  <Motor state={state} mats={mats} r={motorR} propR={propR} ccw={i % 2 === 0} phase={i * 0.7} />
                </group>
              </group>
            </group>
          </Part>
        );
      })}
    </group>
  );
}

const WING_SPAN = 1.32;

/** Quadplane VTOL: lofted wing with winglets, faired fuselage, booms with lift rotors, V-tail, pusher. */
function FixedWingVtol({ palette, state }: { palette: Palette; state: StateRef }) {
  const mats = useMats(palette);
  const wing = useMemo(() => {
    // Half wing along +x, leading edge at −z; laid out to either side below.
    const st = (f: number): Station => ({
      s: f * WING_SPAN,
      chord: 0.36 - 0.16 * f,
      thick: (0.36 - 0.16 * f) * 0.12,
      twist: (-2 * f * Math.PI) / 180,
      sweep: 0.05 * f,
      lift: f * f * 0.04,
    });
    return [false, true].map((m) => geo(`wing:${m}`, () => loft([0, 0.2, 0.4, 0.6, 0.8, 0.95, 1].map(st), { camber: 0.035, mirror: m })));
  }, []);
  const winglet = useMemo(() => geo('winglet', () => loft([0, 0.5, 1].map((f) => ({ s: f * 0.16, chord: 0.2 - 0.09 * f, thick: 0.018 - 0.008 * f, twist: 0, sweep: 0.06 * f })), { camber: 0, mirror: true })), []);
  const tail = useMemo(() => geo('vtail', () => loft([0, 0.5, 1].map((f) => ({ s: f * 0.34, chord: 0.18 - 0.07 * f, thick: 0.016 - 0.006 * f, twist: 0, sweep: 0.07 * f })), { camber: 0, mirror: true })), []);
  const fuselage = useMemo(() => {
    const L = 1.32;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 28; k++) {
      const t = k / 28;
      // Blunt rounded nose at t = 1, fat cabin just behind it, long taper to the tail.
      const r = t > 0.8 ? 0.122 * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 0.04 + 0.082 * Math.sin(((t / 0.8) * Math.PI) / 2) ** 0.8;
      pts.push([Math.max(r, 0), -0.64 + t * L]);
    }
    pts.unshift([0, -0.64]);
    return latheGeo('fuse', pts, { segments: 40, alongX: true });
  }, []);
  return (
    <group scale={0.82}>
      <Part state={state} dir={[0, 0, 0]} dist={0}>
        <mesh geometry={fuselage} material={mats.shell} scale={[1, 0.86, 1]} />
        {/* Hatch seam and dorsal intake */}
        <mesh geometry={hullGeo(0.22, 0.03, 0.07, { taper: 0.4, belly: 0.2 })} material={mats.body} position={[0.28, 0.092, 0]} />
        <group position={[0.66, 0.01, 0]}>
          <VisionPair mats={mats} spread={0.06} />
        </group>
        <mesh material={mats.led} position={[-0.6, 0.04, 0]}>
          <sphereGeometry args={[0.016, 16, 12]} />
        </mesh>
        {/* Pitot probe */}
        <mesh material={mats.metal} position={[0.62, -0.05, 0.06]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.006, 0.18, 8]} />
        </mesh>
      </Part>
      {/* Wing */}
      <Part state={state} dir={[0, 1, 0]} dist={0.55} position={[0.12, 0.09, 0]}>
        <mesh geometry={wing[1]} material={mats.shell} rotation={[0, -Math.PI / 2, 0]} />
        <mesh geometry={wing[0]} material={mats.shell} rotation={[0, Math.PI / 2, 0]} />
        {[-1, 1].map((s) => (
          <group key={s}>
            {/* Winglet */}
            <group position={[-0.08, 0.035, s * WING_SPAN]} rotation={[0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
              <mesh geometry={winglet} material={mats.shell} rotation={[0, 0, Math.PI / 2 - 0.25]} scale={[1, 1, s > 0 ? 1 : -1]} />
            </group>
            {/* Wingtip nav light and aileron line */}
            <mesh material={s > 0 ? mats.green : mats.red} position={[-0.03, 0.03, s * (WING_SPAN - 0.01)]}>
              <sphereGeometry args={[0.012, 12, 8]} />
            </mesh>
            <mesh material={mats.body} position={[-0.165, 0.012, s * 0.95]}>
              <boxGeometry args={[0.004, 0.012, 0.5]} />
            </mesh>
          </group>
        ))}
      </Part>
      {/* V-tail */}
      <Part state={state} dir={[-1, 1, 0]} dist={0.45} position={[-0.56, 0.06, 0]}>
        {[-1, 1].map((s) => (
          <group key={s} rotation={[0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
            <mesh geometry={tail} material={mats.shell} rotation={[0, 0, 0.62]} scale={[1, 1, s > 0 ? 1 : -1]} />
          </group>
        ))}
      </Part>
      {/* Booms with lift rotors */}
      {[-1, 1].map((s) => (
        <Part key={s} state={state} dir={[0, -0.2, s]} dist={0.6} position={[0.1, 0.07, s * 0.6]}>
          <mesh material={mats.carbon} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.026, 0.026, 1.2, 14]} />
          </mesh>
          {[-1, 1].map((e) => (
            <mesh key={e} geometry={latheGeo('boomcap', [[0.027, 0], [0.026, 0.02], [0.015, 0.042], [0, 0.05]], { segments: 14 })} material={mats.body} position={[e * 0.6, 0, 0]} rotation={[0, 0, -e * Math.PI / 2]} />
          ))}
          {/* Wing junction fairing */}
          <mesh geometry={hullGeo(0.2, 0.035, 0.04, { taper: 0.2, belly: 0.9 })} material={mats.shell} position={[0.02, 0.01, 0]} />
          {[0.56, -0.56].map((x, j) => (
            <group key={x} position={[x, 0.024, 0]}>
              <Motor state={state} mats={mats} r={0.046} propR={0.3} ccw={(j + (s > 0 ? 1 : 0)) % 2 === 0} phase={j} />
            </group>
          ))}
        </Part>
      ))}
      {/* Pusher motor and prop at the tail */}
      <Part state={state} dir={[-1, 0, 0]} dist={0.5} position={[-0.66, 0, 0]}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <Motor state={state} mats={mats} r={0.046} propR={0.22} ccw phase={0.3} />
        </group>
      </Part>
      {/* Stabilised belly turret */}
      <Part state={state} dir={[0, -1, 0]} dist={0.45} position={[0.34, -0.1, 0]}>
        <mesh material={mats.body} position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.055, 0.06, 0.03, 32]} />
        </mesh>
        <mesh material={mats.shell} position={[0, -0.02, 0]}>
          <sphereGeometry args={[0.06, 32, 20]} />
        </mesh>
        <mesh material={mats.glass} position={[0.04, -0.04, 0]} rotation={[0, 0, -Math.PI / 3]}>
          <cylinderGeometry args={[0.025, 0.025, 0.04, 24]} />
        </mesh>
        <mesh material={mats.coat} position={[0.058, -0.051, 0]} rotation={[0, 0, -Math.PI / 3]}>
          <cylinderGeometry args={[0.018, 0.018, 0.004, 24]} />
        </mesh>
      </Part>
      {/* Belly skids */}
      <Part state={state} dir={[0, -1, 0]} dist={0.3}>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh geometry={tubeGeo(`vskid:${s}`, [[0.08, -0.08, s * 0.05], [0.08, -0.17, s * 0.1], [0.08, -0.22, s * 0.12]], 0.008)} material={mats.dark} />
            <mesh material={mats.rubber} position={[0.08, -0.225, s * 0.12]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.012, 0.2, 6, 12]} />
            </mesh>
          </group>
        ))}
      </Part>
    </group>
  );
}

export function DroneModel({ airframe = 'quad', palette, state }: { airframe?: Airframe; palette: Palette; state: StateRef }) {
  if (airframe === 'fixed_wing_vtol') return <FixedWingVtol palette={palette} state={state} />;
  if (airframe === 'hex' || airframe === 'octo') return <HeavyLift arms={airframe === 'hex' ? 6 : 8} palette={palette} state={state} />;
  return <Quad palette={palette} state={state} />;
}

/** Labels for the inspect view, per airframe: [label, local position]. */
export const PART_LABELS: Record<Airframe, [string, [number, number, number]][]> = {
  quad: [['Battery', [-0.1, 1.2, 0]], ['Flight controller', [0, 0.62, 0]], ['Gimbal camera', [0.85, -0.35, 0]], ['Motors and rotors', [0.95, 0.2, 0.95]], ['Landing gear', [0, -0.68, 0.3]]],
  hex: [['Dual batteries', [0, 1.25, 0]], ['Flight controller and GNSS', [-0.1, 0.72, 0]], ['Gimbal camera', [0.75, -0.4, 0]], ['Six motors', [1.05, 0.2, 0.6]], ['Landing gear', [0, -0.68, 0.35]]],
  octo: [['Dual batteries', [0, 1.25, 0]], ['Flight controller and GNSS', [-0.1, 0.72, 0]], ['Gimbal camera', [0.75, -0.4, 0]], ['Eight motors', [1.1, 0.2, 0.5]], ['Landing gear', [0, -0.68, 0.35]]],
  fixed_wing_vtol: [['Wing', [0, 0.65, 1.0]], ['Lift rotors', [0.5, 0.0, 0.95]], ['Pusher prop', [-1.0, 0.1, 0]], ['Camera turret', [0.3, -0.55, 0]]],
};

/**
 * The customer's own GLB, fitted to the same footprint as the drawn models (about 2 units
 * across, resting on the slot) so it sits on the turntable like the rest of the fleet.
 * Suspends while loading; the caller supplies the fallback and an error boundary.
 */
export function CustomModel({ url, state }: { url: string; state: StateRef }) {
  const { scene } = useGLTF(url);
  const group = useRef<THREE.Group>(null);
  const fitted = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.z, size.y * 1.5, 1e-6);
    root.position.set(-center.x * scale, -box.min.y * scale - 0.15, -center.z * scale);
    root.scale.setScalar(scale);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    return root;
  }, [scene]);
  // No rotors to spin on an arbitrary model: lift it a touch and turn it slowly instead.
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += (state.current?.spin ?? 0) * dt * 1.2;
  });
  return (
    <group ref={group}>
      <primitive object={fitted} />
    </group>
  );
}
