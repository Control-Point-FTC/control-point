import { useRef, useState } from 'react';
import { cn } from './ui';
import { apiFetch, assetUrl } from '../services/api';
import { notify } from './dialog';

/** One aggregated reaction on a message, as returned by the server. */
export interface Reaction {
  /** Unicode emoji, or `custom:<id>` for a personal custom reaction. */
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  member_ids: number[];
  /** Present for custom reactions — the uploaded image. */
  image_url?: string;
}

/** Is this a custom (uploaded image) reaction rather than a unicode emoji? */
export function isCustomReaction(emoji: string): boolean {
  return emoji.startsWith('custom:');
}

/**
 * Pure optimistic toggle: returns the reaction list as it should look right
 * after `memberId` toggles `emoji`, before the server responds.
 */
export function applyReactionToggle(reactions: Reaction[], emoji: string, memberId: number): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) {
    return [...reactions, { emoji, count: 1, reacted_by_me: true, member_ids: [memberId] }];
  }
  if (existing.reacted_by_me) {
    const memberIds = existing.member_ids.filter((id) => id !== memberId);
    if (memberIds.length === 0) return reactions.filter((r) => r.emoji !== emoji);
    return reactions.map((r) =>
      r.emoji === emoji ? { ...r, count: memberIds.length, reacted_by_me: false, member_ids: memberIds } : r
    );
  }
  const memberIds = [...existing.member_ids, memberId];
  return reactions.map((r) =>
    r.emoji === emoji ? { ...r, count: memberIds.length, reacted_by_me: true, member_ids: memberIds } : r
  );
}

/**
 * POST the toggle to the server. Resolves with the server's canonical
 * reaction list for the message (authoritative — use it to reconcile).
 */
export async function postReactionToggle(messageId: number, emoji: string): Promise<Reaction[]> {
  const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not update reaction');
  return (data.reactions || []) as Reaction[];
}

function ReactionFace({ reaction, size = 'w-4 h-4' }: { reaction: Reaction; size?: string }) {
  if (isCustomReaction(reaction.emoji) && reaction.image_url) {
    return (
      <img
        src={assetUrl(reaction.image_url) ?? undefined}
        alt="custom reaction"
        className={cn(size, 'object-contain rounded-sm')}
        draggable={false}
      />
    );
  }
  return <span className="text-sm leading-none select-none">{reaction.emoji}</span>;
}

interface MessageReactionsProps {
  messageId: number;
  reactions: Reaction[];
  /** Current user's member id — used for the optimistic toggle. */
  memberId: number;
  /** Push the (optimistic or server) reaction list up so ChatView state + socket stay in sync. */
  onReactionsChange: (messageId: number, reactions: Reaction[]) => void;
  /** Optional member-id -> display-name map for the hover tooltip. */
  memberNames?: Record<number, string>;
  /** Fires when the user toggles an emoji (for recent-reactions tracking). */
  onToggleEmoji?: (emoji: string) => void;
}

/**
 * Discord-style reaction chips under a chat message. Clicking a chip toggles
 * that reaction: the UI updates immediately (optimistic), the server confirms,
 * and on failure the previous state is restored.
 */
export default function MessageReactions({
  messageId,
  reactions,
  memberId,
  onReactionsChange,
  memberNames,
  onToggleEmoji,
}: MessageReactionsProps) {
  // Emojis with a request in flight — clicks still queue an optimistic flip;
  // the set just guards against double-posting the same toggle twice.
  const inFlight = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  // Discord-style rich hover card state — declared before the empty early
  // return so hook order stays stable when reactions come and go.
  const [hovered, setHovered] = useState<string | null>(null);

  if (!reactions || reactions.length === 0) return null;

  const handleToggle = async (emoji: string) => {
    if (inFlight.current.has(emoji)) return;
    const prev = reactions;
    onReactionsChange(messageId, applyReactionToggle(prev, emoji, memberId));
    inFlight.current.add(emoji);
    force((n) => n + 1);
    try {
      const server = await postReactionToggle(messageId, emoji);
      onReactionsChange(messageId, server);
    } catch (e: any) {
      onReactionsChange(messageId, prev); // rollback
      notify(e?.message || 'Could not update reaction.', 'error');
    } finally {
      inFlight.current.delete(emoji);
      force((n) => n + 1);
    }
  };

  // Discord-style rich hover card: big emoji + who reacted, instead of the
  // browser's plain native tooltip.
  const namesFor = (r: Reaction): string[] =>
    (r.member_ids || []).map((id) => (id === memberId ? 'You' : memberNames?.[id] || 'Someone'));

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5" aria-label="Message reactions">
      {reactions.map((r) => {
        const names = namesFor(r);
        const shown = names.slice(0, 6);
        const rest = names.length - shown.length;
        return (
        <div
          key={r.emoji}
          className="relative"
          onMouseEnter={() => setHovered(r.emoji)}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggle(r.emoji);
            }}
            aria-pressed={r.reacted_by_me}
            aria-label={`${r.count} ${isCustomReaction(r.emoji) ? 'custom' : r.emoji} reactions${r.reacted_by_me ? ', including you' : ''}`}
            className={cn(
              'flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full border text-xs font-semibold transition-all',
              'hover:scale-105 active:scale-95',
              r.reacted_by_me
                ? 'bg-accent/20 border-accent/50 text-accent shadow-[0_0_8px_rgba(255,199,0,0.15)]'
                : 'bg-text-base/[0.06] border-text-base/15 text-text-base/80 hover:border-text-base/30 hover:bg-text-base/[0.1]'
            )}
          >
            <ReactionFace reaction={r} />
            <span className="tabular-nums leading-none">{r.count}</span>
          </button>
          {hovered === r.emoji && (
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 min-w-[150px] max-w-[240px] rounded-xl border border-white/10 bg-[#111214]/95 px-3 py-2.5 shadow-2xl backdrop-blur text-center">
              <div className="flex justify-center mb-1.5">
                {isCustomReaction(r.emoji) && r.image_url ? (
                  <img
                    src={assetUrl(r.image_url) ?? undefined}
                    alt="custom reaction"
                    className="w-10 h-10 object-contain rounded"
                    draggable={false}
                  />
                ) : (
                  <span className="text-4xl leading-none select-none">{r.emoji}</span>
                )}
              </div>
              <p className="text-xs font-semibold text-zinc-100 leading-snug">
                {shown.join(', ')}{rest > 0 && <>, and {rest} other{rest === 1 ? '' : 's'}</>}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1">
                reacted with {isCustomReaction(r.emoji) ? 'a custom emoji' : r.emoji}
              </p>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
