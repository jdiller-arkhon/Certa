'use client';

import { animate, motion, MotionConfig, useInView, useReducedMotion, useSpring, type HTMLMotionProps, type Variants } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The Arkhon website's easing curve. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

/** Wrap the app once: every motion component then honors prefers-reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.56, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.56, ease: EASE } },
};

export function Rise({ delay = 0, ...props }: HTMLMotionProps<'div'> & { delay?: number }) {
  return <motion.div initial="hidden" animate="show" variants={riseIn} transition={{ delay }} {...props} />;
}

/** Children using `StaggerItem` reveal one after another. */
export function Stagger({ gap = 0.05, delay = 0, inView = false, ...props }: HTMLMotionProps<'div'> & { gap?: number; delay?: number; inView?: boolean }) {
  const variants: Variants = { hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } };
  return inView ? (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }} variants={variants} {...props} />
  ) : (
    <motion.div initial="hidden" animate="show" variants={variants} {...props} />
  );
}

export function StaggerItem(props: HTMLMotionProps<'div'>) {
  return <motion.div variants={riseIn} {...props} />;
}

export function StaggerLi(props: HTMLMotionProps<'li'>) {
  return <motion.li variants={riseIn} {...props} />;
}

/** Number that counts up from 0 when it scrolls into view. */
export function CountUp({ value, duration = 1.1, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(0, value, { duration, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);
  return (
    <span ref={ref} className={className} aria-label={String(value)}>
      {shown.toLocaleString('en-US')}
    </span>
  );
}

/** Pointer position across the window, -1…1 on each axis, sprung. Stays at 0 under reduced motion. */
export function usePointerTilt() {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 50, damping: 16 });
  const y = useSpring(0, { stiffness: 50, damping: 16 });
  useEffect(() => {
    if (reduce) return;
    const on = (e: PointerEvent) => {
      x.set((e.clientX / window.innerWidth) * 2 - 1);
      y.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', on);
    return () => window.removeEventListener('pointermove', on);
  }, [reduce, x, y]);
  return { x, y };
}

export { motion };
