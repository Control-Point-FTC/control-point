import { Bot } from "lucide-react";

/**
 * BrunoIcon — Bruno's dedicated mark: the robot.
 * Used by the header launcher, BrunoPanel, BrunoView, and the dashboard
 * Bruno bar. (The bug-in-a-bubble mark is FeedbackIcon — don't swap them.)
 */
export default function BrunoIcon({ className }: { className?: string }) {
  return <Bot className={className} role="img" aria-label="Bruno" />;
}
