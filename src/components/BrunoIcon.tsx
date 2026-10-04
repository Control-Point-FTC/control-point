import { cn } from "./ui";

/**
 * BrunoIcon — Bruno's signature logo: a friendly robot face as a live SVG.
 * Eyes blink on their own; the mouth "talks" while Bruno is thinking.
 * `thinking` — talking mouth + pulse glow while generating a reply.
 * `animate` — gentle idle float so the icon feels alive.
 * Respects prefers-reduced-motion (see index.css).
 */
export default function BrunoIcon({
  className,
  thinking = false,
  animate = false,
}: {
  className?: string;
  thinking?: boolean;
  animate?: boolean;
}) {
  return (
    <span
      className={cn(
        "bruno-icon inline-flex items-center justify-center",
        animate && !thinking && "bruno-icon-idle",
        thinking && "bruno-icon-thinking",
        className
      )}
      role="img"
      aria-label={thinking ? "Bruno is thinking" : "Bruno"}
    >
      <svg viewBox="0 0 48 48" className="w-full h-full" aria-hidden="true">
        {/* Head */}
        <rect x="6" y="10" width="36" height="30" rx="10" fill="currentColor" opacity="0.16" />
        <rect x="6" y="10" width="36" height="30" rx="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {/* Antenna */}
        <line x1="24" y1="10" x2="24" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="4" r="2.2" fill="currentColor" className="bruno-antenna-dot" />
        {/* Eyes — blink via scaleY */}
        <g className="bruno-eyes" style={{ transformOrigin: "24px 23px" }}>
          <ellipse cx="17" cy="23" rx="3.4" ry="4.2" fill="currentColor" />
          <ellipse cx="31" cy="23" rx="3.4" ry="4.2" fill="currentColor" />
        </g>
        {/* Mouth — smiles idle, "talks" when thinking */}
        {thinking ? (
          <ellipse cx="24" cy="32" rx="3" ry="2.2" fill="currentColor" className="bruno-mouth-talk" style={{ transformOrigin: "24px 32px" }} />
        ) : (
          <path d="M18 31 Q24 35.5 30 31" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}
