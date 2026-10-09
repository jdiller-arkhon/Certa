'use client';

import { Check } from 'lucide-react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { CertaMark, CertaMarkAnimated } from './brand';
import { EASE, usePointerTilt } from './motion';
import { LEVEL_COLOR } from './ui/status';

/**
 * Sign-in hero: "the record writes itself". A top-down map tilts into a 3D terrain block; a
 * drone flies a survey pattern at altitude above its ground shadow, painting its camera swath.
 * When it lands, the flight record assembles, each check ticks, and the Certa mark draws itself
 * as the seal. The camera follows the pointer. Decorative (aria-hidden); loops, or rests on the
 * final frame under reduced motion. Every value is illustrative sample data.
 */

const W = 540;
const H = 300;
const HOME = { x: 70, y: 238 };
const AREA = '128,52 470,40 504,214 146,232';
const PASSES = [200, 160, 120, 80];
const ROUTE: [number, number][] = [[HOME.x, HOME.y]];
PASSES.forEach((y, i) => {
  const [a, b] = i % 2 ? [450, 168] : [168, 450];
  ROUTE.push([a, y], [b, y]);
});
ROUTE.push([HOME.x, HOME.y]);

const ROUTE_D = 'M' + ROUTE.map(([x, y]) => `${x} ${y}`).join(' L');
const SURVEY_D = 'M' + ROUTE.slice(1, -1).map(([x, y]) => `${x} ${y}`).join(' L');
const SEGS = ROUTE.slice(1).map(([x, y], i) => Math.hypot(x - ROUTE[i]![0], y - ROUTE[i]![1]));
const TOTAL = SEGS.reduce((a, b) => a + b, 0);
const CUM = SEGS.map((_, i) => SEGS.slice(0, i + 1).reduce((a, b) => a + b, 0) / TOTAL);
const TIMES = [0, ...CUM];

/** Terrain: stacked contour rings (a low hill), each lifted a little more. */
const RINGS = [1.25, 1.05, 0.86, 0.68, 0.5, 0.33].map((k, j) => {
  const pts = Array.from({ length: 80 }, (_, i) => {
    const t = (i / 80) * Math.PI * 2;
    const r = k * (1 + 0.08 * Math.sin(3 * t + j * 0.6) + 0.045 * Math.sin(5 * t - j));
    return `${(318 + Math.cos(t) * r * 200).toFixed(1)} ${(140 + Math.sin(t) * r * 104).toFixed(1)}`;
  });
  return { d: 'M' + pts.join(' L') + ' Z', z: j * 5 };
});

const ALT_Z = 56; // px the flight layer floats above the ground
const FLY = 4.6;
const T0 = 0.9;
const LAND = T0 + FLY;
const CYCLE = 12_000;
const TILT = { x: 54, z: -16 };

const ROWS = [
  { k: 'Pilot', v: 'Dana Reyes', s: 'Part 107 · current' },
  { k: 'Aircraft', v: 'Survey quad', s: 'FA3K7P2X9R · current' },
  { k: 'Max altitude', v: '312 ft', s: 'limit 400 ft AGL' },
];
const HASH = '9f2c 41d0 7be3 … a71e';

function Layer({ z, children }: { z: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" style={{ transform: `translateZ(${z}px)` }}>
      {children}
    </svg>
  );
}

function useTelemetry(run: boolean) {
  const [alt, setAlt] = useState(run ? 0 : 312);
  const [secs, setSecs] = useState(run ? 0 : 18 * 60 + 42);
  useEffect(() => {
    if (!run) return;
    const c = [
      animate(0, 312, { delay: T0, duration: 0.9, ease: EASE, onUpdate: (v) => setAlt(Math.round(v)) }),
      animate(312, 0, { delay: LAND - 0.7, duration: 0.7, ease: 'easeIn', onUpdate: (v) => setAlt(Math.round(v)) }),
      animate(0, 18 * 60 + 42, { delay: T0, duration: FLY, ease: 'linear', onUpdate: (v) => setSecs(Math.round(v)) }),
    ];
    return () => c.forEach((x) => x.stop());
  }, [run]);
  return { alt, secs, time: `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}` };
}

function Typed({ text, delay, run }: { text: string; delay: number; run: boolean }) {
  const [n, setN] = useState(run ? 0 : text.length);
  useEffect(() => {
    if (!run) return;
    const c = animate(0, text.length, { delay, duration: 0.9, ease: 'linear', onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [run, text, delay]);
  return <>{text.slice(0, n)}</>;
}

/** Something that rides the route in sync with the drawn track. */
function Rider({ run, children }: { run: boolean; children: ReactNode }) {
  if (!run) return null;
  return (
    <motion.g
      initial={{ x: HOME.x, y: HOME.y, opacity: 0 }}
      animate={{ x: ROUTE.map((p) => p[0]), y: ROUTE.map((p) => p[1]), opacity: [0, 1, 1, 1, 1, 1, 1, 1, 1, 0] }}
      transition={{ duration: FLY, delay: T0, ease: 'linear', times: TIMES }}
    >
      {children}
    </motion.g>
  );
}

function Scene({ run, rx, rz }: { run: boolean; rx: MotionValue<number>; rz: MotionValue<number> }) {
  const { alt, secs, time } = useTelemetry(run);
  const at = (d: number) => (run ? d : 0);
  const airborne = run && alt > 0;
  const green = LEVEL_COLOR.green;
  // The camera swath paints from the first pass to the last.
  const surveyStart = T0 + CUM[0]! * FLY;
  const surveyDur = (CUM[CUM.length - 2]! - CUM[0]!) * FLY;

  return (
    <motion.div className="relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}>
      {/* 3D stage */}
      <div className="relative h-[288px]" style={{ perspective: 1000 }}>
        <motion.div
          className="absolute top-1/2 left-1/2 w-[108%]"
          style={{ x: '-50%', y: '-40%', rotateX: rx, rotateZ: rz, transformStyle: 'preserve-3d', aspectRatio: `${W} / ${H}` }}
        >
          {/* Ground */}
          <Layer z={0}>
            <defs>
              <pattern id="rh-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0 H0 V20" fill="none" stroke="var(--certa-border)" strokeOpacity={0.45} strokeWidth={0.6} />
              </pattern>
              <radialGradient id="rh-fade" cx="50%" cy="50%" r="58%">
                <stop offset="50%" stopColor="#fff" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <mask id="rh-mask">
                <rect x={-40} y={-40} width={W + 80} height={H + 80} fill="url(#rh-fade)" />
              </mask>
              <filter id="rh-blur">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            <rect x={-40} y={-40} width={W + 80} height={H + 80} fill="url(#rh-grid)" mask="url(#rh-mask)" />
            <polygon points={AREA} fill="var(--certa-text)" fillOpacity={0.03} stroke="var(--certa-muted)" strokeOpacity={0.7} strokeDasharray="5 5" />
            <text x={132} y={40} className="fill-[var(--certa-muted)] text-[11px] font-semibold tracking-[0.12em]">
              OPERATING AREA · CLASS G
            </text>
            {/* Camera coverage swath */}
            <motion.path
              d={SURVEY_D}
              fill="none"
              stroke={green}
              strokeOpacity={0.16}
              strokeWidth={34}
              strokeLinejoin="round"
              initial={{ pathLength: run ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: surveyDur, delay: surveyStart, ease: 'linear' }}
            />
            {/* Home pad */}
            <circle cx={HOME.x} cy={HOME.y} r={13} fill="var(--certa-surface)" stroke="var(--certa-text)" strokeWidth={1.5} />
            <text x={HOME.x} y={HOME.y + 4} textAnchor="middle" className="fill-[var(--certa-text)] text-[11px] font-bold">
              H
            </text>
            {/* The drone's shadow */}
            <Rider run={run}>
              <ellipse rx={9} ry={9} fill="var(--certa-text)" fillOpacity={0.28} filter="url(#rh-blur)" />
            </Rider>
          </Layer>

          {/* Terrain */}
          {RINGS.map((r, i) => (
            <Layer key={i} z={r.z}>
              <path d={r.d} fill="var(--certa-text)" fillOpacity={0.022} stroke="var(--certa-muted)" strokeOpacity={0.22 + i * 0.07} strokeWidth={0.9} />
            </Layer>
          ))}

          {/* Climb / descent column over the home pad */}
          <div
            className="absolute"
            style={{ left: `${(HOME.x / W) * 100}%`, top: `${(HOME.y / H) * 100}%`, width: 0, height: ALT_Z, borderLeft: '1.5px dashed var(--certa-muted)', transformOrigin: 'top', transform: 'rotateX(90deg)' }}
          />

          {/* Flight level */}
          <Layer z={ALT_Z}>
            <defs>
              <radialGradient id="rh-glow">
                <stop offset="0%" stopColor={green} stopOpacity={0.55} />
                <stop offset="100%" stopColor={green} stopOpacity={0} />
              </radialGradient>
            </defs>
            <path d={ROUTE_D} fill="none" stroke="var(--certa-muted)" strokeOpacity={0.7} strokeWidth={1.2} strokeDasharray="1 5" strokeLinecap="round" />
            <motion.path
              d={ROUTE_D}
              fill="none"
              stroke="var(--certa-text)"
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: run ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: FLY, delay: T0, ease: 'linear' }}
            />
            <Rider run={run}>
              <circle r={26} fill="url(#rh-glow)" />
              <g stroke="var(--certa-text)" strokeWidth={1.6}>
                <line x1={-7} y1={-7} x2={7} y2={7} />
                <line x1={7} y1={-7} x2={-7} y2={7} />
              </g>
              {[[-7, -7], [7, -7], [7, 7], [-7, 7]].map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <circle r={3.8} fill="var(--certa-surface)" stroke="var(--certa-text)" strokeWidth={1.2} />
                  <motion.line x1={-3} x2={3} y1={0} y2={0} stroke="var(--certa-text)" strokeWidth={0.9} animate={{ rotate: 360 }} transition={{ duration: 0.25, repeat: Infinity, ease: 'linear' }} />
                </g>
              ))}
              <circle r={3} fill="var(--certa-text)" />
            </Rider>
          </Layer>
        </motion.div>

        {/* Telemetry */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: at(0.4) }}
          className="tabular absolute top-0 right-0 flex items-center gap-3 rounded-full border border-[var(--certa-border)] bg-[color-mix(in_srgb,var(--certa-surface)_85%,transparent)] px-3 py-1.5 text-[11px] shadow-[var(--certa-shadow)] backdrop-blur"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="relative flex size-1.5">
              {airborne && <span className="ping absolute inset-0 rounded-full" style={{ background: green }} />}
              <span className="relative size-1.5 rounded-full" style={{ background: airborne ? green : 'var(--certa-muted)' }} />
            </span>
            {airborne ? 'In flight' : run && secs === 0 ? 'Ready' : 'Landed'}
          </span>
          <span className="flex items-center gap-1.5 text-[var(--certa-muted)]">
            AGL
            <span className="relative h-1 w-10 overflow-hidden rounded-full bg-[var(--certa-inset)]">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(alt / 400) * 100}%`, background: green }} />
            </span>
            <span className="inline-block w-[42px] font-semibold text-[var(--certa-text)]">{alt} ft</span>
          </span>
          <span className="text-[var(--certa-muted)]">
            T+ <span className="font-semibold text-[var(--certa-text)]">{time}</span>
          </span>
        </motion.div>
      </div>

      {/* The record */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97, rotateX: 18 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: at(LAND + 0.1) }}
        style={{ transformPerspective: 900 }}
        className="relative -mt-9 ml-auto w-[80%] overflow-hidden rounded-[20px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--certa-border)] px-4 py-2.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--certa-muted)]">FLIGHT RECORD · #0418</span>
          <span className="tabular text-[11px] text-[var(--certa-muted)]">Today · 18 min · B-07</span>
        </div>
        <ul className="divide-y divide-[var(--certa-border)] px-4">
          {ROWS.map((r, i) => (
            <li key={r.k} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 py-[7px] text-[12.5px]">
              <span className="text-[var(--certa-muted)]">{r.k}</span>
              <span className="min-w-0 truncate">
                <span className="font-semibold">{r.v}</span> <span className="text-[var(--certa-muted)]">· {r.s}</span>
              </span>
              <motion.span
                initial={{ scale: 0, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 14, delay: at(LAND + 0.55 + i * 0.22) }}
                className="flex size-[18px] items-center justify-center rounded-full"
                style={{ background: green, color: 'var(--certa-surface)' }}
              >
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            </li>
          ))}
        </ul>
        <div className="relative flex items-center gap-3 border-t border-[var(--certa-border)] bg-[var(--certa-inset)] px-4 py-3">
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--certa-surface)] text-[22px] text-[var(--certa-text)] shadow-[var(--certa-shadow-sm)]">
            {run && (
              <motion.span
                className="absolute inset-0 rounded-[11px] border-2"
                style={{ borderColor: green }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 1, 1.7], opacity: [0, 0.8, 0] }}
                transition={{ duration: 0.9, delay: LAND + 2.5, ease: 'easeOut', times: [0, 0.01, 1] }}
              />
            )}
            {run ? <CertaMarkAnimated delay={LAND + 1.4} duration={1.1} /> : <CertaMark />}
          </span>
          <span className="min-w-0 flex-1">
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: at(LAND + 2.4) }}
              className="block text-[13px] font-semibold"
            >
              Verified record
            </motion.span>
            <span className="tabular block font-mono text-[11px] text-[var(--certa-muted)]">
              sha-256 <Typed text={HASH} delay={LAND + 1.6} run={run} />
            </span>
          </span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: at(LAND + 2.6) }}
            className="text-[11px] font-medium text-[var(--certa-muted)]"
          >
            Sealed · audit-ready
          </motion.span>
        </div>
        {/* Sheen when sealed */}
        {run && (
          <motion.span
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12"
            style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${green} 22%, transparent), transparent)` }}
            initial={{ x: '-120%' }}
            animate={{ x: '420%' }}
            transition={{ duration: 1.1, delay: LAND + 2.5, ease: [0.4, 0, 0.2, 1] }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

export function RecordHero({ className }: { className?: string }) {
  const reduce = !!useReducedMotion();
  const [cycle, setCycle] = useState(0);
  // Decorative and pointer/time driven: render on the client only (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const tilt = usePointerTilt();
  // Camera: starts top-down, tilts into 3D once, then follows the pointer.
  const baseX = useMotionValue(reduce ? TILT.x : 0);
  const baseZ = useMotionValue(reduce ? TILT.z : 0);
  const rx = useTransform(() => baseX.get() + tilt.y.get() * 7);
  const rz = useTransform(() => baseZ.get() + tilt.x.get() * 10);

  useEffect(() => {
    if (reduce) return;
    const c = [animate(baseX, TILT.x, { duration: 1.8, ease: EASE, delay: 0.2 }), animate(baseZ, TILT.z, { duration: 1.8, ease: EASE, delay: 0.2 })];
    return () => c.forEach((x) => x.stop());
  }, [reduce, baseX, baseZ]);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setCycle((c) => c + 1), CYCLE);
    return () => clearTimeout(t);
  }, [cycle, reduce]);

  return (
    <div aria-hidden className={`min-h-[460px] ${className ?? ''}`}>
      <AnimatePresence mode="wait">
        {mounted && <Scene key={cycle} run={!reduce} rx={rx} rz={rz} />}
      </AnimatePresence>
    </div>
  );
}
