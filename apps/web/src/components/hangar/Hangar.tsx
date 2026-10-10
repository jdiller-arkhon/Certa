'use client';

import type { ReadinessRowViewModel } from '@certa/contract';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ChevronLeft, ChevronRight, Fan, Layers, RotateCcw } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { Button } from '../ui/button';
import { LevelDot, LevelIcon, StatusBadge } from '../ui/status';
import { DroneModel, PART_LABELS, type DroneState, type Palette } from './models';

/**
 * Today hero: the organization's aircraft on a 3D turntable. Drag to orbit the selected
 * aircraft; click one (or use ← →) to bring it to the front; spin it up, or pull it apart to
 * inspect. Readiness shows as a ring under each aircraft. Grounded or not-current aircraft
 * can't be spun up. Purely presentational: data in, `onOpen(href)` out.
 */

export interface HangarProps {
  aircraft: ReadinessRowViewModel[];
  onOpen: (href: string) => void;
}

/** Turntable radius: grows with the fleet so aircraft never overlap. */
const radiusFor = (n: number) => Math.max(2.2, (n * 1.25) / (Math.PI * 2) + 1.1);
const VARS = ['--certa-current', '--certa-warning', '--certa-expired', '--certa-inset', '--certa-border', '--certa-text', '--certa-canvas'] as const;
type Vars = Record<(typeof VARS)[number], string>;

/** Reads Certa's theme tokens and re-reads them when the theme changes. */
function useThemeVars(ref: RefObject<HTMLElement | null>): Vars | null {
  const [vars, setVars] = useState<Vars | null>(null);
  useEffect(() => {
    const read = () => {
      if (!ref.current) return;
      const cs = getComputedStyle(ref.current);
      setVars(Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(v).trim() || '#888'])) as Vars);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-theme', 'class'] });
    return () => mo.disconnect();
  }, [ref]);
  return vars;
}

const damp = (a: number, b: number, k: number, dt: number) => THREE.MathUtils.damp(a, b, k, dt);
const statusColor = (row: ReadinessRowViewModel, v: Vars) => (row.status.level === 'green' ? v['--certa-current'] : row.status.level === 'amber' ? v['--certa-warning'] : v['--certa-expired']);

function Slot({
  row,
  index,
  count,
  selected,
  spinning,
  exploded,
  vars,
  reduce,
  radius: R,
  onSelect,
}: {
  radius: number;
  row: ReadinessRowViewModel;
  index: number;
  count: number;
  selected: boolean;
  spinning: boolean;
  exploded: boolean;
  vars: Vars;
  reduce: boolean;
  onSelect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const state = useRef<DroneState>({ spin: 0, explode: 0 });
  const [hover, setHover] = useState(false);
  const theta = (index / count) * Math.PI * 2;
  const color = statusColor(row, vars);
  const palette: Palette = useMemo(() => ({ body: '#2b2b30', shell: '#d4d4da', metal: '#8d8d95', prop: '#1b1b1e', status: color }), [color]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false }), [color]);

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const k = reduce ? 1000 : 5;
    const t = clock.elapsedTime;
    const s = state.current;
    s.spin = damp(s.spin, selected && spinning ? 1 : 0, reduce ? 1000 : 2.2, dt);
    s.explode = damp(s.explode, selected && exploded ? 1 : 0, reduce ? 1000 : 4, dt);
    const lift = selected && spinning ? 0.36 + (reduce ? 0 : Math.sin(t * 2.2) * 0.025) : 0;
    g.position.y = damp(g.position.y, (selected ? 0.27 : 0.19) + lift * Math.min(1, s.spin * 1.4), k, dt);
    const sc = selected ? 0.62 : hover ? 0.5 : 0.44;
    g.scale.setScalar(damp(g.scale.x, sc, k, dt));
    // Parked aircraft idle-turn slowly; the selected one faces you a little off-axis.
    g.rotation.y = damp(g.rotation.y, selected ? -0.55 : -0.55 + (reduce ? 0 : Math.sin(t * 0.3 + index) * 0.25), 3, dt);
    if (ring.current) {
      const pulse = row.status.level === 'green' || reduce ? 0 : (Math.sin(t * 3) + 1) * 0.5;
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (selected ? 0.95 : hover ? 0.8 : 0.5) - pulse * 0.35;
    }
  });

  return (
    <group position={[Math.sin(theta) * R, 0, Math.cos(theta) * R]} rotation={[0, theta, 0]}>
      <mesh ref={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[selected ? 0.66 : 0.5, selected ? 0.69 : 0.52, 96]} />
      </mesh>
      <group
        ref={group}
        position={[0, 0.19, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <DroneModel airframe={row.airframe} palette={palette} state={state} />
        {selected && exploded && (
          <PartLabels airframe={row.airframe ?? 'quad'} state={state} />
        )}
      </group>
    </group>
  );
}

function PartLabels({ airframe, state }: { airframe: NonNullable<ReadinessRowViewModel['airframe']>; state: RefObject<DroneState> }) {
  const [show, setShow] = useState(false);
  useFrame(() => {
    const v = (state.current?.explode ?? 0) > 0.85;
    if (v !== show) setShow(v);
  });
  if (!show) return null;
  return (
    <>
      {PART_LABELS[airframe].map(([label, pos]) => (
        <Html key={label} position={pos} center zIndexRange={[20, 0]}>
          <span className="pointer-events-none rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-[var(--certa-text)] shadow-[var(--certa-shadow)]">
            {label}
          </span>
        </Html>
      ))}
    </>
  );
}

/** Rotates the turntable so the selected aircraft comes to the front (shortest way round). */
function Carousel({ selected, count, reduce, children }: { selected: number; count: number; reduce: boolean; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(0);
  const last = useRef(selected);
  useEffect(() => {
    const step = (Math.PI * 2) / count;
    let d = selected - last.current;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    target.current -= d * step;
    last.current = selected;
  }, [selected, count]);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y = damp(group.current.rotation.y, target.current, reduce ? 1000 : 3.2, dt);
  });
  return <group ref={group}>{children}</group>;
}

/** Widens the lens on narrow (portrait) canvases so the selected aircraft still fits. */
function Lens() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    camera.fov = aspect < 1 ? 46 : aspect < 1.6 ? 36 : 30;
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

function Turntable({ vars, radius: R }: { vars: Vars; radius: number }) {
  // All tick marks in one geometry: one draw call instead of 72.
  const ticks = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const len = i % 6 === 0 ? 0.16 : 0.07;
      const r0 = R + 1.03 - len / 2, r1 = R + 1.03 + len / 2;
      pts.push(Math.sin(a) * r0, 0.004, Math.cos(a) * r0, Math.sin(a) * r1, 0.004, Math.cos(a) * r1);
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }, [R]);
  return (
    <group>
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[R + 1.25, R + 1.3, 0.06, 128]} />
        <meshStandardMaterial color={vars['--certa-inset']} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[R + 1.12, R + 1.14, 160]} />
        <meshBasicMaterial color={vars['--certa-border']} />
      </mesh>
      <lineSegments geometry={ticks}>
        <lineBasicMaterial color={vars['--certa-border']} />
      </lineSegments>
    </group>
  );
}

export default function Hangar({ aircraft, onOpen }: HangarProps) {
  const root = useRef<HTMLDivElement>(null);
  const vars = useThemeVars(root);
  const reduce = !!useReducedMotion();
  const [selected, setSelected] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [exploded, setExploded] = useState(false);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const count = aircraft.length;
  const R = radiusFor(count);
  const row = aircraft[Math.min(selected, count - 1)]!;
  const canSpin = row.status.level !== 'red';

  const select = useCallback(
    (i: number) => {
      setSelected(((i % count) + count) % count);
      setSpinning(false);
      setExploded(false);
    },
    [count],
  );
  const resetView = () => controls.current?.reset();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') select(selected + 1);
    else if (e.key === 'ArrowLeft') select(selected - 1);
    else if (e.key === 'Enter') onOpen(row.href);
    else if (e.key.toLowerCase() === 's' && canSpin) setSpinning((v) => !v);
    else if (e.key.toLowerCase() === 'i') setExploded((v) => !v);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="3D hangar"
      aria-label={`Hangar: ${count} aircraft. Use left and right arrow keys to switch, Enter to open.`}
      tabIndex={0}
      onKeyDown={onKey}
      data-testid="hangar"
      className="relative h-[420px] overflow-hidden rounded-[28px] border border-[var(--certa-border)] bg-[radial-gradient(ellipse_at_50%_35%,var(--certa-surface),var(--certa-canvas))] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--certa-focus)] sm:h-[480px]"
    >
      {vars && (
        <Canvas
          aria-hidden
          dpr={[1, 2]}
          camera={{ position: [0, 1.25, R + 3.1], fov: 30 }}
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => (document.body.style.cursor = '')}
          className="absolute inset-0"
        >
          <Lens />
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 6, 5]} intensity={1.7} />
          <directionalLight position={[-4, 3, -3]} intensity={0.55} />
          <Environment resolution={128}>
            <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 8, 1]} />
            <Lightformer form="rect" intensity={1.4} position={[-5, 2, 3]} rotation={[0, Math.PI / 2.5, 0]} scale={[3, 5, 1]} />
            <Lightformer form="rect" intensity={1.1} position={[5, 2, -2]} rotation={[0, -Math.PI / 2.5, 0]} scale={[3, 5, 1]} />
          </Environment>
          <Turntable vars={vars} radius={R} />
          <fog attach="fog" args={[vars['--certa-canvas'], R + 3.2, R * 3 + 4.5]} />
          <Carousel selected={selected} count={count} reduce={reduce}>
            {aircraft.map((a, i) => (
              <Slot
                key={a.id}
                row={a}
                index={i}
                count={count}
                selected={i === selected}
                spinning={spinning}
                exploded={exploded}
                vars={vars}
                reduce={reduce}
                radius={R}
                onSelect={() => select(i)}
              />
            ))}
          </Carousel>
          <ContactShadows position={[0, 0.006, 0]} opacity={0.5} scale={R * 2 + 4} blur={2.2} far={1.6} resolution={512} />
          <OrbitControls
            ref={controls}
            target={[0, 0.38, R]}
            enablePan={false}
            enableZoom={false}
            enableDamping
            minPolarAngle={0.75}
            maxPolarAngle={1.42}
            minAzimuthAngle={-1.1}
            maxAzimuthAngle={1.1}
          />
        </Canvas>
      )}

      {/* Soft backdrop so the text stays legible over the scene */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_75%_at_0%_0%,color-mix(in_srgb,var(--certa-canvas)_94%,transparent)_35%,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,color-mix(in_srgb,var(--certa-canvas)_85%,transparent),transparent)]" />

      {/* Selected aircraft */}
      <div className="pointer-events-none absolute top-5 left-5 max-w-[min(360px,70%)] space-y-2 sm:top-6 sm:left-6" aria-live="polite">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--certa-muted)] uppercase">
          Hangar · {count} aircraft
        </span>
        <h2 className="headline text-[26px] leading-tight sm:text-[30px]">{row.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} size="sm" />
          {row.subtitle && <span className="tabular text-[13px] text-[var(--certa-muted)]">{row.subtitle}</span>}
        </div>
        {row.reasons.slice(0, 2).map((r, i) => (
          <p key={i} className="flex items-start gap-1.5 text-[13px] text-[var(--certa-text)]">
            <LevelIcon level={r.level} className="mt-0.5 size-3 shrink-0" />
            <span>
              {r.text}
              {r.due && <span className="text-[var(--certa-muted)]"> · {r.due.display}</span>}
            </span>
          </p>
        ))}
      </div>

      <p className="pointer-events-none absolute top-6 right-6 hidden text-[12px] text-[var(--certa-muted)] md:block">Drag to orbit · ← → to switch · S spin · I inspect</p>

      {/* Prev / next */}
      {count > 1 && (
        <>
          <button type="button" aria-label="Previous aircraft" onClick={() => select(selected - 1)} className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow)] transition-transform hover:scale-105">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Next aircraft" onClick={() => select(selected + 1)} className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow)] transition-transform hover:scale-105">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </>
      )}

      {/* Fleet chips + actions */}
      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 sm:inset-x-6 sm:bottom-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_88%,transparent)]" role="tablist" aria-label="Aircraft">
          {aircraft.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => select(i)}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                i === selected ? 'border-[var(--certa-text)] bg-[var(--certa-action)] text-[var(--certa-onAction)]' : 'border-[var(--certa-border)] bg-[var(--certa-surface)] text-[var(--certa-text)] hover:bg-[var(--certa-inset)]'
              }`}
            >
              <LevelDot level={a.status.level} />
              {a.name}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant={spinning ? 'primary' : 'secondary'}
            disabled={!canSpin}
            title={canSpin ? undefined : `${row.status.label}: can't spin up`}
            onClick={() => setSpinning((v) => !v)}
            icon={<Fan className={`size-4 ${spinning && !reduce ? 'animate-spin' : ''}`} aria-hidden />}
            aria-pressed={spinning}
          >
            {canSpin ? (spinning ? 'Land' : 'Spin up') : row.status.label}
          </Button>
          <Button size="sm" variant={exploded ? 'primary' : 'secondary'} onClick={() => setExploded((v) => !v)} icon={<Layers className="size-4" aria-hidden />} aria-pressed={exploded} aria-label="Inspect" className="max-sm:w-9 max-sm:px-0">
            <span className="max-sm:hidden">Inspect</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={resetView} icon={<RotateCcw className="size-4" aria-hidden />} aria-label="Reset view" className="max-sm:hidden" />
          <Button size="sm" arrow onClick={() => onOpen(row.href)}>
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}
