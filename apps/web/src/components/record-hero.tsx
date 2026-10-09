'use client';

import { Check } from 'lucide-react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTime, useTransform, type MotionValue } from 'motion/react';
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
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

/** Heading per leg (degrees, unwrapped) with quick turns at each waypoint. */
const HEADINGS = (() => {
  const raw = ROUTE.slice(1).map(([x, y], i) => (Math.atan2(y - ROUTE[i]![1], x - ROUTE[i]![0]) * 180) / Math.PI);
  const out = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    let d = raw[i]! - raw[i - 1]!;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    out.push(out[i - 1]! + d);
  }
  return out;
})();
const TURN = 0.012;
const HEADING_KEYS = (() => {
  const v = [HEADINGS[0]!];
  const t = [0];
  HEADINGS.forEach((h, i) => {
    if (i === 0) return;
    v.push(HEADINGS[i - 1]!, h);
    t.push(Math.max(TIMES[i]! - TURN, t.at(-1)!), Math.min(TIMES[i]! + TURN, 1));
  });
  v.push(HEADINGS.at(-1)!);
  t.push(1);
  return { v, t };
})();
const SURVEY_A = CUM[0]!;
const SURVEY_B = CUM[CUM.length - 2]!;

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
const SEAL = LAND + 1.95; // the mark stamps onto the record
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
function Rider({ run, children, turn }: { run: boolean; children: ReactNode; turn?: boolean }) {
  if (!run) return null;
  return (
    <motion.g
      initial={{ x: HOME.x, y: HOME.y, opacity: 0 }}
      animate={{ x: ROUTE.map((p) => p[0]), y: ROUTE.map((p) => p[1]), opacity: [0, 1, 1, 1, 1, 1, 1, 1, 1, 0] }}
      transition={{ duration: FLY, delay: T0, ease: 'linear', times: TIMES }}
    >
      {turn ? (
        <motion.g initial={{ rotate: HEADINGS[0] }} animate={{ rotate: HEADING_KEYS.v }} transition={{ duration: FLY, delay: T0, ease: 'easeInOut', times: HEADING_KEYS.t }}>
          {children}
        </motion.g>
      ) : (
        children
      )}
    </motion.g>
  );
}

/** The camera's field of view: a sheet of light from the drone to the ground, across the track. */
function ScanCurtain({ run }: { run: boolean }) {
  const green = LEVEL_COLOR.green;
  if (!run) return null;
  const t = { duration: FLY, delay: T0, ease: 'linear' as const, times: TIMES };
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        width: 38,
        height: ALT_Z,
        marginLeft: -19,
        transformOrigin: 'top center',
        transform: 'rotateZ(90deg) rotateX(90deg)',
        clipPath: 'polygon(0 0, 100% 0, 58% 100%, 42% 100%)',
        background: `linear-gradient(to bottom, color-mix(in srgb, ${green} 34%, transparent), color-mix(in srgb, ${green} 70%, transparent))`,
      }}
      initial={{ left: pctX(HOME.x), top: pctY(HOME.y), opacity: 0 }}
      animate={{ left: ROUTE.map((p) => pctX(p[0])), top: ROUTE.map((p) => pctY(p[1])), opacity: [0, 0, 1, 1, 0, 0] }}
      transition={{ left: t, top: t, opacity: { duration: FLY, delay: T0, ease: 'linear', times: [0, SURVEY_A, SURVEY_A + 0.02, SURVEY_B - 0.02, SURVEY_B, 1] } }}
    />
  );
}

/** Flight data streaming from the landed drone into the record. */
const STREAM = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => (Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
  const f = Math.abs(r(1));
  return { tx: 30 + f * 55, ty: 330 + Math.abs(r(2)) * 70, d: i * 0.045, s: 3 + Math.abs(r(3)) * 2.5 };
});

function Scene({ run, rx, rz }: { run: boolean; rx: MotionValue<number>; rz: MotionValue<number> }) {
  const { alt, secs, time } = useTelemetry(run);
  const at = (d: number) => (run ? d : 0);
  const airborne = run && alt > 0;
  const green = LEVEL_COLOR.green;
  // The camera swath paints from the first pass to the last.
  const surveyStart = T0 + SURVEY_A * FLY;
  const surveyDur = (SURVEY_B - SURVEY_A) * FLY;

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

          <ScanCurtain run={run} />

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
            {run && (
              <>
                {/* Comet trail just behind the drone */}
                <motion.path
                  d={ROUTE_D}
                  fill="none"
                  stroke={green}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#rh-blur)"
                  initial={{ pathLength: 0.08, pathOffset: -0.08, opacity: 0 }}
                  animate={{ pathOffset: [-0.08, 0.92], opacity: [0, 0.9, 0.9, 0] }}
                  transition={{ pathOffset: { duration: FLY, delay: T0, ease: 'linear' }, opacity: { duration: FLY, delay: T0, times: [0, 0.05, 0.9, 1] } }}
                />
                {/* Waypoint pings as the drone turns */}
                {ROUTE.slice(1, -1).map(([x, y], i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <motion.circle r={2.2} fill={green} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15, delay: T0 + TIMES[i + 1]! * FLY }} />
                    <motion.circle
                      fill="none"
                      stroke={green}
                      strokeWidth={1.2}
                      initial={{ r: 2, opacity: 0 }}
                      animate={{ r: [2, 2, 16], opacity: [0, 0.9, 0] }}
                      transition={{ duration: 0.8, delay: T0 + TIMES[i + 1]! * FLY, times: [0, 0.01, 1], ease: 'easeOut' }}
                    />
                  </g>
                ))}
              </>
            )}
            <Rider run={run} turn>
              <circle r={26} fill="url(#rh-glow)" />
              {/* Nose: camera and a forward light, so the heading reads */}
              <path d="M9 -3.2 L14.5 0 L9 3.2 Z" fill={green} />
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
        animate={{ opacity: 1, y: 0, scale: run ? [0.97, 1, 1, 0.985, 1] : 1, rotateX: 0 }}
        transition={{
          default: { duration: 0.8, ease: EASE, delay: at(LAND + 0.1) },
          scale: { duration: SEAL - LAND + 0.25, delay: at(LAND + 0.1), times: [0, 0.3, 0.88, 0.94, 1] },
        }}
        style={{ transformPerspective: 900 }}
        className="relative -mt-9 ml-auto w-[80%] overflow-hidden rounded-[20px] border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--certa-border)] px-4 py-2.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[var(--certa-muted)]">FLIGHT RECORD · #0418</span>
          <span className="tabular text-[11px] text-[var(--certa-muted)]">Today · 18 min · B-07</span>
        </div>
        <ul className="divide-y divide-[var(--certa-border)] px-4">
          {ROWS.map((r, i) => (
            <motion.li
              key={r.k}
              className="relative grid grid-cols-[92px_1fr_auto] items-center gap-3 py-[7px] text-[12.5px]"
              initial={{ opacity: 0, x: 18, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.5, ease: EASE, delay: at(LAND + 0.35 + i * 0.16) }}
            >
              {/* Verification scan across the row */}
              {run && (
                <motion.span
                  className="pointer-events-none absolute inset-y-0 -left-4 w-16"
                  style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${green} 28%, transparent), transparent)` }}
                  initial={{ x: 0, opacity: 0 }}
                  animate={{ x: [0, 440], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.5, delay: LAND + 0.6 + i * 0.22, ease: 'easeInOut' }}
                />
              )}
              <span className="text-[var(--certa-muted)]">{r.k}</span>
              <span className="min-w-0 truncate">
                <span className="font-semibold">{r.v}</span> <span className="text-[var(--certa-muted)]">· {r.s}</span>
              </span>
              <span className="relative flex size-[18px] items-center justify-center">
                {run && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2"
                    style={{ borderColor: green }}
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{ scale: [1, 1, 2.2], opacity: [0, 0.7, 0] }}
                    transition={{ duration: 0.6, delay: LAND + 1.05 + i * 0.22, times: [0, 0.01, 1], ease: 'easeOut' }}
                  />
                )}
                <motion.span
                  initial={{ scale: 0, opacity: 0, rotate: -45 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 14, delay: at(LAND + 1.05 + i * 0.22) }}
                  className="flex size-[18px] items-center justify-center rounded-full"
                  style={{ background: green, color: 'var(--certa-surface)' }}
                >
                  <Check className="size-3" strokeWidth={3} />
                </motion.span>
              </span>
            </motion.li>
          ))}
        </ul>
        <div className="relative flex items-center gap-3 border-t border-[var(--certa-border)] bg-[var(--certa-inset)] px-4 py-3">
          <motion.span
            className="relative flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--certa-surface)] text-[22px] text-[var(--certa-text)] shadow-[var(--certa-shadow-sm)]"
            initial={{ scale: run ? 1.9 : 1, rotate: run ? -14 : 0, opacity: run ? 0 : 1 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22, delay: at(SEAL - 0.18) }}
          >
            {run && (
              <motion.span
                className="absolute inset-0 rounded-[11px] border-2"
                style={{ borderColor: green }}
                initial={{ scale: 1, opacity: 0 }}
                animate={{ scale: [1, 1, 1.7], opacity: [0, 0.8, 0] }}
                transition={{ duration: 0.9, delay: SEAL, ease: 'easeOut', times: [0, 0.01, 1] }}
              />
            )}
            {run ? <CertaMarkAnimated delay={SEAL - 0.05} duration={0.9} /> : <CertaMark />}
          </motion.span>
          <span className="min-w-0 flex-1">
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: at(SEAL + 0.7) }}
              className="block text-[13px] font-semibold"
            >
              Verified record
            </motion.span>
            <span className="tabular block font-mono text-[11px] text-[var(--certa-muted)]">
              sha-256 <Typed text={HASH} delay={SEAL + 0.1} run={run} />
            </span>
          </span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: at(SEAL + 0.9) }}
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
            transition={{ duration: 1.1, delay: SEAL + 0.8, ease: [0.4, 0, 0.2, 1] }}
          />
        )}
      </motion.div>

      {/* Flight data streaming from the landed drone into the record */}
      {run && (
        <div className="pointer-events-none absolute inset-0">
          {STREAM.map((d, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ width: d.s, height: d.s, left: 0, top: 0, background: green, boxShadow: `0 0 10px 2px color-mix(in srgb, ${green} 60%, transparent)` }}
              initial={{ x: '0%', y: 0, opacity: 0 }}
              animate={{
                left: ['12%', `${(12 + d.tx) / 2}%`, `${d.tx}%`],
                top: [270, 250 + d.d * 200, d.ty],
                opacity: [0, 1, 1, 0],
                scale: [0.6, 1.2, 0.5],
              }}
              transition={{ duration: 0.75, delay: LAND + 0.05 + d.d, ease: [0.5, 0, 0.3, 1], opacity: { duration: 0.75, delay: LAND + 0.05 + d.d, times: [0, 0.15, 0.8, 1] } }}
            />
          ))}
        </div>
      )}
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
  const time = useTime();
  // Pointer plus a slow idle drift, so the scene breathes even when the mouse is still.
  const rx = useTransform(() => baseX.get() + tilt.y.get() * 7 + (reduce ? 0 : Math.sin(time.get() / 3800) * 2.5));
  const rz = useTransform(() => baseZ.get() + tilt.x.get() * 10 + (reduce ? 0 : Math.sin(time.get() / 5200) * 4));

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
