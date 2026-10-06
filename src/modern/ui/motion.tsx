// Motion primitives for Modern pages (motion/react). Reveal on mount, stagger
// lists, and animate numbers. Everything respects prefers-reduced-motion via
// the MotionConfig in ModernShell.
import { motion, type HTMLMotionProps, type Variants } from 'motion/react';

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Fades + rises in on mount. */
export function Reveal({ delay = 0, y = 8, ...props }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease, delay }}
      {...props}
    />
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

/** Parent that staggers its <StaggerItem> children in. */
export function Stagger({ as = 'div', ...props }: HTMLMotionProps<'div'> & { as?: 'div' | 'ul' | 'ol' }) {
  const C = as === 'ul' ? motion.ul : as === 'ol' ? motion.ol : motion.div;
  return <C variants={container} initial="hidden" animate="show" {...(props as any)} />;
}
export function StaggerItem({ as = 'div', ...props }: HTMLMotionProps<'div'> & { as?: 'div' | 'li' }) {
  const C = as === 'li' ? motion.li : motion.div;
  return <C variants={item} {...(props as any)} />;
}

export { motion };
