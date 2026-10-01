/**
 * FeedbackIcon — the feedback mark: a beetle (bug) inside a chat bubble.
 * Bug reports live here: the header feedback launcher and anywhere else
 * users send feedback. (Bruno's own mark is BrunoIcon — don't swap them.)
 */
export default function FeedbackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Send feedback"
    >
      {/* chat bubble */}
      <path d="M3.5 4.5h17a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1h-8.6L7 19.5v-4.5H3.5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
      {/* beetle body */}
      <ellipse cx="12" cy="10.4" rx="2.6" ry="3.1" />
      {/* elytra split */}
      <path d="M12 7.6v5.6" />
      {/* head */}
      <circle cx="12" cy="7.3" r="1" fill="currentColor" stroke="none" />
      {/* antennae */}
      <path d="M11.4 6.6 10.3 5.7M12.6 6.6l1.1-.9" />
      {/* legs */}
      <path d="M9.5 9.3 8 8.8M9.4 10.9l-1.6.1M9.5 12.4 8 13M14.5 9.3 16 8.8M14.6 10.9l1.6.1M14.5 12.4 16 13" />
    </svg>
  );
}
