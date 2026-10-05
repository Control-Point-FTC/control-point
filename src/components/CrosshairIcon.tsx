import { cn } from "./ui";

/**
 * CrosshairIcon — settings gear replacement in the Control Point aesthetic.
 * A hand-drawn style crosshair (circle + aim lines), no star, matching the
 * brand logo's stroke weight. Used wherever the settings gear appeared.
 */
export default function CrosshairIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={cn("flex-shrink-0", className)}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="12" cy="12" r="7.5" />
      {/* Inner ring */}
      <circle cx="12" cy="12" r="3.5" />
      {/* Aim lines — extend past the outer ring like the logo */}
      <line x1="12" y1="1.5" x2="12" y2="6.5" />
      <line x1="12" y1="17.5" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="6.5" y2="12" />
      <line x1="17.5" y1="12" x2="22.5" y2="12" />
    </svg>
  );
}
