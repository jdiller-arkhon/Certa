'use client';

import type { Airframe } from '@certa/contract';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * Procedural drone models for the Today hangar. One unit ≈ 30 cm. Every part sits in an
 * <Part> that slides outward along `dir` as `explode` goes 0 → 1, for the inspect view.
 * Generic airframes on purpose: no manufacturer's design is reproduced.
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

const MAT = {
  body: (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.35 }),
  shell: (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.15 }),
  metal: (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.85 }),
  prop: (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.1 }),
};

function useMats(p: Palette) {
  return useMemo(
    () => ({
      body: MAT.body(p.body),
      shell: MAT.shell(p.shell),
      metal: MAT.metal(p.metal),
      prop: MAT.prop(p.prop),
      lens: new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.05, metalness: 0.9 }),
      led: new THREE.MeshStandardMaterial({ color: p.status, emissive: new THREE.Color(p.status), emissiveIntensity: 2.2, toneMapped: false }),
      blur: new THREE.MeshBasicMaterial({ color: p.prop, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [p.body, p.shell, p.metal, p.prop, p.status],
  );
}

/** A part that slides out along `dir` (scaled by `dist`) when the drone is exploded. */
function Part({ state, dir, dist = 0.6, children, position = [0, 0, 0] }: { state: React.RefObject<DroneState>; dir: [number, number, number]; dist?: number; children: ReactNode; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(...dir).normalize().multiplyScalar(dist), [dir, dist]);
  useFrame(() => {
    const e = state.current?.explode ?? 0;
    ref.current?.position.set(position[0] + v.x * e, position[1] + v.y * e, position[2] + v.z * e);
  });
  return <group ref={ref} position={position}>{children}</group>;
}

/** Two-blade propeller; a translucent disc fades in as it spins up. Alternate rotors turn opposite ways. */
function Rotor({ state, mats, radius, ccw, phase }: { state: React.RefObject<DroneState>; mats: ReturnType<typeof useMats>; radius: number; ccw: boolean; phase: number }) {
  const blades = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const blur = useMemo(() => mats.blur.clone(), [mats]);
  useFrame((_, dt) => {
    const s = state.current?.spin ?? 0;
    if (blades.current) blades.current.rotation.y += (ccw ? 1 : -1) * (0.15 + s * 55) * dt * (s > 0.01 ? 1 : 0);
    if (disc.current) (disc.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s - 0.35) * 0.32;
  });
  return (
    <group>
      <group ref={blades} rotation={[0, phase, 0]}>
        {[0, Math.PI].map((r) => (
          <mesh key={r} material={mats.prop} rotation={[0.08, r, 0]} position={[Math.cos(r) * radius * 0.5, 0, -Math.sin(r) * radius * 0.5]}>
            <boxGeometry args={[radius, 0.012, radius * 0.16]} />
          </mesh>
        ))}
        <mesh material={mats.metal}>
          <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
        </mesh>
      </group>
      <mesh ref={disc} material={blur} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 48]} />
      </mesh>
    </group>
  );
}

function Multirotor({ arms, palette, state }: { arms: 4 | 6 | 8; palette: Palette; state: React.RefObject<DroneState> }) {
  const mats = useMats(palette);
  const armLen = arms === 4 ? 0.78 : arms === 6 ? 0.92 : 1.02;
  const propR = arms === 4 ? 0.42 : arms === 6 ? 0.36 : 0.3;
  const offset = arms === 4 ? Math.PI / 4 : arms === 6 ? Math.PI / 6 : Math.PI / 8;
  const angles = Array.from({ length: arms }, (_, i) => offset + (i / arms) * Math.PI * 2);
  return (
    <group>
      {/* Frame core */}
      <Part state={state} dir={[0, 0, 0]} dist={0}>
        <RoundedBox args={[0.62, 0.16, 0.42]} radius={0.06} smoothness={4} material={mats.body} />
        <mesh material={mats.led} position={[-0.32, 0.02, 0]}>
          <sphereGeometry args={[0.025, 16, 16]} />
        </mesh>
      </Part>
      {/* Top shell (flight controller cover) */}
      <Part state={state} dir={[0, 1, 0]} dist={0.45} position={[0, 0.1, 0]}>
        <RoundedBox args={[0.48, 0.06, 0.32]} radius={0.03} smoothness={4} material={mats.shell} />
      </Part>
      {/* Battery */}
      <Part state={state} dir={[0, 1, 0]} dist={0.95} position={[-0.02, 0.18, 0]}>
        <RoundedBox args={[0.36, 0.1, 0.2]} radius={0.025} smoothness={4} material={mats.body} />
        <mesh material={mats.led} position={[0.181, 0, 0]}>
          <boxGeometry args={[0.004, 0.02, 0.1]} />
        </mesh>
      </Part>
      {/* Gimbal camera */}
      <Part state={state} dir={[1, -1, 0]} dist={0.6} position={[0.24, -0.12, 0]}>
        <mesh material={mats.metal} position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.06, 12]} />
        </mesh>
        <RoundedBox args={[0.13, 0.1, 0.12]} radius={0.03} smoothness={4} material={mats.shell} />
        <mesh material={mats.lens} position={[0.066, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.02, 24]} />
        </mesh>
      </Part>
      {/* Landing gear */}
      <Part state={state} dir={[0, -1, 0]} dist={0.4} position={[0, -0.1, 0]}>
        {[-0.16, 0.16].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh material={mats.metal} position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.2, 10]} />
            </mesh>
            <mesh material={mats.body} position={[0, -0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.018, 0.42, 6, 12]} />
            </mesh>
          </group>
        ))}
      </Part>
      {/* Arms, motors, rotors */}
      {angles.map((a, i) => {
        const x = Math.cos(a), z = Math.sin(a);
        return (
          <Part key={i} state={state} dir={[x, 0.15, z]} dist={0.55}>
            <mesh material={mats.body} position={[x * armLen * 0.5, 0, z * armLen * 0.5]} rotation={[0, -a, Math.PI / 2]}>
              <cylinderGeometry args={[0.026, 0.03, armLen, 12]} />
            </mesh>
            <group position={[x * armLen, 0.05, z * armLen]}>
              <mesh material={mats.metal}>
                <cylinderGeometry args={[0.065, 0.07, 0.09, 24]} />
              </mesh>
              <group position={[0, 0.07, 0]}>
                <Rotor state={state} mats={mats} radius={propR} ccw={i % 2 === 0} phase={i * 0.7} />
              </group>
            </group>
          </Part>
        );
      })}
    </group>
  );
}

/** Quadplane VTOL: wing, fuselage, two booms with four lift rotors, and a pusher prop. */
function FixedWingVtol({ palette, state }: { palette: Palette; state: React.RefObject<DroneState> }) {
  const mats = useMats(palette);
  return (
    <group scale={0.82}>
      <Part state={state} dir={[0, 0, 0]} dist={0}>
        <mesh material={mats.body} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.11, 0.9, 8, 24]} />
        </mesh>
        <mesh material={mats.lens} position={[0.5, 0.02, 0]}>
          <sphereGeometry args={[0.07, 24, 16]} />
        </mesh>
        <mesh material={mats.led} position={[-0.5, 0.06, 0]}>
          <sphereGeometry args={[0.022, 16, 16]} />
        </mesh>
      </Part>
      {/* Wing */}
      <Part state={state} dir={[0, 1, 0]} dist={0.55} position={[0.02, 0.1, 0]}>
        <RoundedBox args={[0.36, 0.035, 2.6]} radius={0.016} smoothness={3} material={mats.shell} />
        {[-1, 1].map((s) => (
          <mesh key={s} material={mats.shell} position={[-0.05, 0.06, s * 1.3]} rotation={[s * 0.5, 0, 0]}>
            <boxGeometry args={[0.2, 0.12, 0.02]} />
          </mesh>
        ))}
      </Part>
      {/* V-tail */}
      <Part state={state} dir={[-1, 1, 0]} dist={0.45} position={[-0.55, 0.12, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} material={mats.shell} rotation={[s * 0.75, 0, 0]} position={[0, 0.08, s * 0.1]}>
            <boxGeometry args={[0.2, 0.02, 0.42]} />
          </mesh>
        ))}
      </Part>
      {/* Booms with lift rotors */}
      {[-1, 1].map((s) => (
        <Part key={s} state={state} dir={[0, -0.2, s]} dist={0.6} position={[0, 0.06, s * 0.62]}>
          <mesh material={mats.body} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.03, 1.15, 6, 12]} />
          </mesh>
          {[0.58, -0.58].map((x, j) => (
            <group key={x} position={[x, 0.06, 0]}>
              <mesh material={mats.metal}>
                <cylinderGeometry args={[0.05, 0.055, 0.07, 20]} />
              </mesh>
              <group position={[0, 0.05, 0]}>
                <Rotor state={state} mats={mats} radius={0.3} ccw={(j + (s > 0 ? 1 : 0)) % 2 === 0} phase={j} />
              </group>
            </group>
          ))}
        </Part>
      ))}
      {/* Pusher */}
      <Part state={state} dir={[-1, 0, 0]} dist={0.5} position={[-0.68, 0, 0]}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh material={mats.metal}>
            <cylinderGeometry args={[0.05, 0.06, 0.08, 20]} />
          </mesh>
          <group position={[0, -0.06, 0]}>
            <Rotor state={state} mats={mats} radius={0.22} ccw phase={0.3} />
          </group>
        </group>
      </Part>
      {/* Belly camera */}
      <Part state={state} dir={[0, -1, 0]} dist={0.45} position={[0.2, -0.13, 0]}>
        <mesh material={mats.shell}>
          <sphereGeometry args={[0.07, 24, 16]} />
        </mesh>
      </Part>
    </group>
  );
}

export function DroneModel({ airframe = 'quad', palette, state }: { airframe?: Airframe; palette: Palette; state: React.RefObject<DroneState> }) {
  if (airframe === 'fixed_wing_vtol') return <FixedWingVtol palette={palette} state={state} />;
  return <Multirotor arms={airframe === 'hex' ? 6 : airframe === 'octo' ? 8 : 4} palette={palette} state={state} />;
}

/** Labels for the inspect view, per airframe: [label, local position]. */
export const PART_LABELS: Record<Airframe, [string, [number, number, number]][]> = {
  quad: [['Battery', [0, 1.2, 0]], ['Flight controller', [0, 0.62, 0]], ['Gimbal camera', [0.68, -0.55, 0]], ['Motors and rotors', [0.95, 0.2, 0.95]]],
  hex: [['Battery', [0, 1.2, 0]], ['Flight controller', [0, 0.62, 0]], ['Gimbal camera', [0.68, -0.55, 0]], ['Six motors', [1.05, 0.2, 0.6]]],
  octo: [['Battery', [0, 1.2, 0]], ['Flight controller', [0, 0.62, 0]], ['Gimbal camera', [0.68, -0.55, 0]], ['Eight motors', [1.1, 0.2, 0.5]]],
  fixed_wing_vtol: [['Wing', [0, 0.65, 1.0]], ['Lift rotors', [0.5, 0.0, 0.95]], ['Pusher prop', [-1.0, 0.1, 0]], ['Camera', [0.2, -0.55, 0]]],
};
