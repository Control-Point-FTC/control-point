import { Bug } from "lucide-react";

/**
 * FeedbackIcon — the feedback mark: a plain bug.
 * Bug reports live here: the header feedback launcher and anywhere else
 * users send feedback. (Bruno's own mark is BrunoIcon — don't swap them.)
 */
export default function FeedbackIcon({ className }: { className?: string }) {
  return <Bug className={className} role="img" aria-label="Send feedback" />;
}
