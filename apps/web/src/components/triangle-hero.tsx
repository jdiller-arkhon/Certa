'use client';

import { Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useTime, useTransform } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { CERTA_MARK_LINES, MARK_STROKE } from './brand-marks';
import { EASE, usePointerTilt } from './motion';
import { LEVEL_COLOR } from './ui/status';

/**
 * First-run hero: "close the triangle". The three setup steps sit on the Certa mark, in the order
 * the mark is drawn — the check rises to the certificate, the side runs down to the aircraft, the
 * base runs back to the first flight. A glowing tip draws each finished step, the corner sparks,
 * and the closed mark means ready to fly. The mark floats in 3D and follows the pointer.
 * Decorative (aria-hidden); loops, or shows the finished mark under reduced motion.
 */

type Pt = [number, number];
const [P] = CERTA_MARK_LINES as unknown as [Pt[]];
const [c0, c1, peak, right, left] = P as [Pt, Pt, Pt, Pt, Pt];
const line = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L');
const FULL = line(P);
const CENTER: Pt = [(peak[0] + right[0] + left[0]) / 3, (peak[1] + right[1] + left[1]) / 3];

const VB = { w: 68, h: 64 };
const pct = ([x, y]: Pt) => ({ left: `${(x / VB.w) * 100}%`, top: `${(y / VB.h) * 100}%` });
const STROKE = MARK_STROKE * 0.24;

const STEPS = [
  { pts: [c0, c1, peak], n: 1, label: 'Certificate', done: 'Part 107 · current', place: '-translate-x-1/2 -translate-y-[calc(100%+16px)]' },
  { pts: [peak, right], n: 2, label: 'Aircraft', done: 'Registered · airworthy', place: '-translate-x-[70%] translate-y-[16px]' },
  { pts: [right, left], n: 3, label: 'First flight', done: 'Logged · 18 min', place: '-translate-x-[30%] translate-y-[16px]' },
] satisfies { pts: Pt[]; n: number; label: string; done: string; place: string }[];

const SEG = 0.9;
const GAP = 0.6;
const CYCLE = 9_500;
const start = (i: number) => 0.6 + i * (SEG + GAP);
const CLOSED = start(3) - GAP;

function times(pts: Pt[]) {
  const d = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i]![0], y - pts[i]![1]));
  const total = d.reduce((a, b) => a + b, 0);
  return [0, ...d.map((_, i) => d.slice(0, i + 1).reduce((a, b) => a + b, 0) / total)];
}

/** One depth plane of the stage; fades with the scene. */
function Plane({ z, children, className }: { z: number; children: ReactNode; className?: string }) {
  return (
    <motion.div className={`absolute inset-0 ${className ?? ''}`} style={{ z }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.45 } }}>
      {children}
    </motion.div>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 size-full overflow-visible">
      {children}
    </svg>
  );
}

function Strokes({ run, stroke, width, opacity = 1 }: { run: boolean; stroke: string; width: number; opacity?: number }) {
  return (
    <>
      {STEPS.map((s, i) => (
        <motion.path
          key={i}
          d={line(s.pts)}
          fill="none"
          stroke={stroke}
          strokeOpacity={opacity}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: run ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: SEG, delay: run ? start(i) : 0, ease: 'linear' }}
        />
      ))}
    </>
  );
}

function Scene({ run }: { run: boolean }) {
  const green = LEVEL_COLOR.green;
  const at = (d: number) => (run ? d : 0);
  return (
    <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }} exit={{ opacity: 1 }}>
      {/* Cast shadow, deep behind the mark: parallax when the stage tilts */}
      <Plane z={-36}>
        <Svg>
          <defs>
            <filter id="th-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.4" />
            </filter>
          </defs>
          <g filter="url(#th-shadow)" transform="translate(0 2.5)">
            <Strokes run={run} stroke="var(--certa-text)" width={STROKE * 1.4} opacity={0.14} />
          </g>
        </Svg>
      </Plane>

      {/* The mark */}
      <Plane z={0}>
        <Svg>
          <defs>
            <filter id="th-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <filter id="th-soft" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
            <linearGradient id="th-sheen" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={green} stopOpacity={0} />
              <stop offset="0.5" stopColor={green} stopOpacity={1} />
              <stop offset="1" stopColor={green} stopOpacity={0} />
            </linearGradient>
            <mask id="th-mask" maskUnits="userSpaceOnUse" x={-10} y={-10} width={VB.w + 20} height={VB.h + 20}>
              <path d={FULL} fill="none" stroke="#fff" strokeWidth={STROKE + 0.2} strokeLinecap="round" strokeLinejoin="round" />
            </mask>
          </defs>

          {/* Shockwaves when the triangle closes */}
          {run &&
            [0, 0.18].map((d, i) => (
              <motion.circle
                key={i}
                cx={CENTER[0]}
                cy={CENTER[1]}
                fill="none"
                stroke={green}
                strokeWidth={0.35}
                initial={{ r: 4, opacity: 0 }}
                animate={{ r: [4, 4, 40], opacity: [0, 0.7, 0] }}
                transition={{ duration: 1.4, delay: CLOSED + d, ease: 'easeOut', times: [0, 0.01, 1] }}
              />
            ))}

          {/* Glow once closed */}
          <motion.path
            d={FULL}
            fill="none"
            stroke={green}
            strokeWidth={STROKE * 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#th-glow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: run ? [0, 0.5, 0.22] : 0.22 }}
            transition={{ duration: 1.6, delay: at(CLOSED), ease: EASE }}
          />

          <Strokes run={run} stroke="var(--certa-text)" width={STROKE} />

          {/* Green sweep along the closed mark */}
          {run && (
            <g mask="url(#th-mask)">
              <motion.rect y={0} height={VB.h} width={16} fill="url(#th-sheen)" initial={{ x: -20 }} animate={{ x: 76 }} transition={{ duration: 1.1, delay: CLOSED + 0.15, ease: [0.4, 0, 0.2, 1] }} />
            </g>
          )}

          {/* Vertices: ghost dot, then a green one that pops in, with sparks */}
          {STEPS.map((s, i) => {
            const [x, y] = s.pts.at(-1)!;
            return (
              <g key={i} transform={`translate(${x} ${y})`}>
                <circle r={1.7} fill="var(--certa-surface)" stroke="var(--certa-border)" strokeWidth={0.4} />
                <motion.circle r={1.7} fill={green} stroke="var(--certa-surface)" strokeWidth={0.5} initial={{ scale: run ? 0 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14, delay: at(start(i) + SEG) }} />
                {run && (
                  <motion.g initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.6], opacity: [0, 1, 0] }} transition={{ duration: 0.7, delay: start(i) + SEG, ease: 'easeOut' }}>
                    {Array.from({ length: 8 }, (_, k) => {
                      const a = (k / 8) * Math.PI * 2 + 0.2;
                      return <line key={k} x1={Math.cos(a) * 2.6} y1={Math.sin(a) * 2.6} x2={Math.cos(a) * 4.6} y2={Math.sin(a) * 4.6} stroke={green} strokeWidth={0.45} strokeLinecap="round" />;
                    })}
                  </motion.g>
                )}
              </g>
            );
          })}

          {/* Glowing tip that draws each step */}
          {run &&
            STEPS.map((s, i) => (
              <motion.g
                key={i}
                initial={{ x: s.pts[0]![0], y: s.pts[0]![1], opacity: 0 }}
                animate={{ x: s.pts.map((p) => p[0]), y: s.pts.map((p) => p[1]), opacity: [0, 1, 1, 0] }}
                transition={{
                  x: { duration: SEG, delay: start(i), ease: 'linear', times: times(s.pts) },
                  y: { duration: SEG, delay: start(i), ease: 'linear', times: times(s.pts) },
                  opacity: { duration: SEG + 0.25, delay: start(i), times: [0, 0.08, 0.8, 1] },
                }}
              >
                <circle r={3.4} fill={green} opacity={0.55} filter="url(#th-soft)" />
                <circle r={1.1} fill="var(--certa-surface)" />
              </motion.g>
            ))}
        </Svg>
      </Plane>

      {/* Step chips float in front */}
      <Plane z={44}>
        {STEPS.map((s, i) => (
          <div key={s.n} className="absolute" style={pct(s.pts.at(-1)!)}>
            <div className={`absolute whitespace-nowrap ${s.place}`}>
              <div className="rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2 shadow-[var(--certa-shadow-lg)]">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                  <span className="tabular text-[10px] tracking-[0.14em] text-[var(--certa-muted)]">STEP {s.n}</span>
                  {s.label}
                </div>
                <div className="grid h-4 overflow-hidden text-[11.5px] [&>*]:col-start-1 [&>*]:row-start-1">
                  <motion.span
                    className="text-[var(--certa-muted)]"
                    initial={{ y: 0, opacity: run ? 1 : 0 }}
                    animate={{ y: -14, opacity: 0 }}
                    transition={{ duration: 0.35, delay: at(start(i) + SEG), ease: EASE }}
                  >
                    Waiting
                  </motion.span>
                  <motion.span
                    className="flex items-center gap-1 font-medium"
                    style={{ color: green }}
                    initial={{ y: run ? 14 : 0, opacity: run ? 0 : 1 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.35, delay: at(start(i) + SEG), ease: EASE }}
                  >
                    <Check className="size-3" strokeWidth={3} /> {s.done}
                  </motion.span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </Plane>

      {/* Result floats furthest forward */}
      <Plane z={72}>
        <div className="absolute" style={{ left: '56%', top: '74%' }}>
          <motion.div
            className="-translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 16, delay: at(CLOSED + 0.25) }}
          >
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap"
              style={{ background: green, color: 'var(--certa-canvas)', boxShadow: `0 10px 30px -8px ${green}, var(--certa-shadow-lg)` }}
            >
              <Check className="size-4" strokeWidth={3} /> Ready to fly today
            </div>
          </motion.div>
        </div>
      </Plane>
    </motion.div>
  );
}

export function TriangleHero({ className }: { className?: string }) {
  const reduce = !!useReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const tilt = usePointerTilt();
  const time = useTime();
  const rx = useTransform(() => (reduce ? 0 : -tilt.y.get() * 12 + Math.sin(time.get() / 2400) * 3));
  const ry = useTransform(() => (reduce ? 0 : tilt.x.get() * 16 + Math.cos(time.get() / 3100) * 5));

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setCycle((c) => c + 1), CYCLE);
    return () => clearTimeout(t);
  }, [cycle, reduce]);

  return (
    <div aria-hidden className={`relative ${className ?? ''}`} style={{ aspectRatio: `${VB.w} / ${VB.h}`, perspective: 900 }}>
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}>
        <div className="dot-grid dot-grid-fade absolute -inset-12" style={{ transform: 'translateZ(-90px)' }} />
        {/* Ghost of the whole mark: what you're working toward */}
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 size-full overflow-visible">
          <path d={FULL} fill="none" stroke="var(--certa-border)" strokeWidth={0.35} strokeDasharray="0.5 1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <AnimatePresence mode="wait">
          {mounted && <Scene key={cycle} run={!reduce} />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
