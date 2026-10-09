'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReadinessLevel } from '@certa/contract';
import { CertaMark } from './brand';
import { EASE } from './motion';
import { LEVEL_COLOR } from './ui/status';

export interface HubNode {
  label: string;
  sub?: string;
  level?: ReadinessLevel;
}

const W = 560;
const H = 460;
const C = { x: W / 2, y: H / 2 };

/** Positions for up to 8 satellites on an ellipse, starting top-left, clockwise. */
function place(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI * 0.72 + (i / n) * Math.PI * 2;
    return { x: C.x + Math.cos(a) * 218, y: C.y + Math.sin(a) * 170 };
  });
}

/**
 * Certa's take on the Arkhon homepage hub: a central node, slowly turning dashed orbits, and
 * packets travelling between Certa and each record type. Purely decorative (aria-hidden).
 */
export function Hub({ nodes, centerLabel = 'CERTA', className }: { nodes: HubNode[]; centerLabel?: string; className?: string }) {
  const reduce = useReducedMotion();
  const pts = place(nodes.length);
  return (
    <div aria-hidden className={className} style={{ aspectRatio: `${W} / ${H}`, position: 'relative', width: '100%' }}>
      <div className="dot-grid dot-grid-fade absolute inset-0" />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible">
        <g className="spin-slower" style={{ transformOrigin: `${C.x}px ${C.y}px` }}>
          <ellipse cx={C.x} cy={C.y} rx={218} ry={170} fill="none" stroke="var(--certa-border)" strokeDasharray="2 6" />
        </g>
        <g className="spin-slow" style={{ transformOrigin: `${C.x}px ${C.y}px` }}>
          <circle cx={C.x} cy={C.y} r={110} fill="none" stroke="var(--certa-border)" strokeDasharray="1 5" />
        </g>
        {pts.map((p, i) => (
          <g key={i}>
            <motion.line
              x1={C.x}
              y1={C.y}
              x2={p.x}
              y2={p.y}
              stroke="var(--certa-border)"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.25 + i * 0.08 }}
            />
            {!reduce && (
              <motion.circle
                r={2.6}
                fill="var(--certa-text)"
                initial={{ cx: C.x, cy: C.y, opacity: 0 }}
                animate={{
                  cx: i % 2 ? [p.x, C.x] : [C.x, p.x],
                  cy: i % 2 ? [p.y, C.y] : [C.y, p.y],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{ duration: 3.2 + (i % 3) * 0.4, ease: 'easeInOut', repeat: Infinity, delay: 1.2 + i * 0.45, repeatDelay: 0.6 }}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Center node */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(C.x / W) * 100}%`, top: `${(C.y / H) * 100}%` }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
        className="flex translate-y-[11px] flex-col items-center"
      >
        <div className="relative flex size-24 items-center justify-center rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] shadow-[var(--certa-shadow-lg)]">
          <div className="absolute inset-2 rounded-full border border-dashed border-[var(--certa-border)]" />
          <CertaMark className="size-11 translate-y-[1px] text-[var(--certa-text)]" />
        </div>
        <span className="mt-3 text-[10px] font-semibold tracking-[0.2em] text-[var(--certa-muted)]">{centerLabel}</span>
      </motion.div>
      </div>

      {/* Satellites */}
      {nodes.map((n, i) => (
        <div key={n.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(pts[i]!.x / W) * 100}%`, top: `${(pts[i]!.y / H) * 100}%` }}>
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.56, ease: EASE, delay: 0.5 + i * 0.08 }}
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: 5 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }}
            className={
              n.sub
                ? 'min-w-[150px] rounded-2xl border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3.5 py-2.5 shadow-[var(--certa-shadow)]'
                : 'rounded-full border border-[var(--certa-border)] bg-[var(--certa-surface)] px-3 py-1.5 shadow-[var(--certa-shadow-sm)]'
            }
          >
            <div className="flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap text-[var(--certa-text)]">
              <span className="size-1.5 rounded-full" style={{ background: n.level ? LEVEL_COLOR[n.level] : 'var(--certa-text)' }} />
              {n.label}
            </div>
            {n.sub && <div className="mt-0.5 pl-3.5 text-[11px] whitespace-nowrap text-[var(--certa-muted)]">{n.sub}</div>}
          </motion.div>
        </motion.div>
        </div>
      ))}
    </div>
  );
}

