'use client';

import type { Airframe } from '@certa/contract';
import { Bounds, ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Fan, Layers, Plane } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { withBase } from '@/lib/base-path';
import { cn } from '../cn';
import { CustomModel, DroneModel, type DroneState, type Palette } from './models';

export interface AircraftViewerProps {
  airframe: Airframe;
  /** The customer's own GLB, when uploaded. */
  modelUrl: string | null;
  /** Accessible name, e.g. "Falcon 1, 3D model". */
  label: string;
  className?: string;
}

/** A studio finish: white shell over a graphite chassis, dark props. */
const PALETTE: Palette = { body: '#34343a', shell: '#f3f3f5', metal: '#a2a2aa', prop: '#26262b', status: '#2fbf71' };

function canUseWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Eases the shared drone state toward the toggles so props spool and parts glide. */
function Driver({ state, spin, explode, reduce }: { state: React.RefObject<DroneState>; spin: boolean; explode: boolean; reduce: boolean }) {
  useFrame((_, dt) => {
    const s = state.current;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 3);
    s.spin += ((spin ? 1 : 0) - s.spin) * k;
    s.explode += ((explode ? 1 : 0) - s.explode) * k;
  });
  return null;
}

/**
 * One aircraft on a clean studio sweep: soft area lights, a contact shadow, and a slow
 * turntable you can grab and orbit. Shows the uploaded model when there is one, otherwise the
 * drawn airframe. Spin and inspect toggles mirror the hangar's.
 */
export default function AircraftViewer({ airframe, modelUrl, label, className }: AircraftViewerProps) {
  const reduce = !!useReducedMotion();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [spin, setSpin] = useState(false);
  const [explode, setExplode] = useState(false);
  const [touched, setTouched] = useState(false);
  const state = useRef<DroneState>({ spin: 0, explode: 0 });
  useEffect(() => setWebgl(canUseWebGL()), []);
  const drawn = useMemo(() => <DroneModel airframe={airframe} palette={PALETTE} state={state} />, [airframe]);

  const fallback = (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[14px] text-[var(--certa-muted)]">
      <Plane className="size-6" aria-hidden />
      3D view isn’t available in this browser.
    </div>
  );

  return (
    <figure
      className={cn('relative h-[320px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#ffffff,var(--certa-canvas)_75%)] sm:h-[380px]', className)}
    >
      <div role="img" aria-label={label} className="absolute inset-0">
      {webgl === false && fallback}
      {webgl && (
        <Boundary fallback={fallback}>
          <Canvas
            aria-hidden
            dpr={[1, 2]}
            camera={{ position: [2.4, 1.35, 2.8], fov: 28 }}
            gl={{ antialias: true, alpha: true }}
            className="absolute inset-0"
            onPointerDown={() => setTouched(true)}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 6, 4]} intensity={1.6} />
            <directionalLight position={[-4, 2.5, -3]} intensity={0.5} />
            <Environment resolution={128}>
              <Lightformer form="rect" intensity={2.4} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
              <Lightformer form="rect" intensity={1.5} position={[-5, 2, 3]} rotation={[0, Math.PI / 2.5, 0]} scale={[3, 5, 1]} />
              <Lightformer form="rect" intensity={1.2} position={[5, 2, -2]} rotation={[0, -Math.PI / 2.5, 0]} scale={[3, 5, 1]} />
            </Environment>
            <Driver state={state} spin={spin} explode={explode} reduce={reduce} />
            <Bounds fit clip margin={0.78}>
              <group position={[0, 0.05, 0]}>
                {modelUrl ? (
                  <Boundary fallback={drawn}>
                    <Suspense fallback={drawn}>
                      <CustomModel url={withBase(modelUrl)} state={state} />
                    </Suspense>
                  </Boundary>
                ) : (
                  drawn
                )}
              </group>
            </Bounds>
            <ContactShadows position={[0, -0.32, 0]} opacity={0.42} scale={5} blur={2.6} far={1.4} resolution={512} />
            <OrbitControls makeDefault enablePan={false} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.05} autoRotate={!reduce && !touched} autoRotateSpeed={0.7} enableDamping />
          </Canvas>
        </Boundary>
      )}
      </div>
      <figcaption className="absolute bottom-3 left-3 flex gap-2">
        {!modelUrl && (
          <>
            <ToggleChip on={spin} onClick={() => setSpin((v) => !v)} icon={<Fan className={cn('size-4', spin && !reduce && 'animate-spin')} aria-hidden />}>
              {spin ? 'Stop rotors' : 'Spin rotors'}
            </ToggleChip>
            <ToggleChip on={explode} onClick={() => setExplode((v) => !v)} icon={<Layers className="size-4" aria-hidden />}>
              Exploded view
            </ToggleChip>
          </>
        )}
      </figcaption>
      <span className="pointer-events-none absolute top-3 right-4 text-[12px] text-[var(--certa-muted)] max-sm:hidden">Drag to orbit · scroll to zoom</span>
    </figure>
  );
}

function ToggleChip({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap shadow-[var(--certa-shadow-sm)] transition-colors focus-visible:outline-3 focus-visible:outline-[var(--certa-focus)]',
        on ? 'border-[var(--certa-text)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] bg-[var(--certa-surface)] hover:bg-[var(--certa-inset)]',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
