import { Bot } from "lucide-react";
import { cn } from "./ui";

/**
 * BrunoIcon — Bruno's dedicated mark: the robot.
 * Used by the header launcher, BrunoPanel, BrunoView, and the dashboard
 * Bruno bar. (The bug mark is FeedbackIcon — don't swap them.)
 *
 * `thinking` — pulses/glows while Bruno is generating a reply.
 * `animate` — gentle idle float so the icon feels alive. Respects
 * prefers-reduced-motion (see index.css keyframes).
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
      <Bot className="w-full h-full" />
    </span>
  );
}
