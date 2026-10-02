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

  const tooltipFor = (r: Reaction): string => {
    const names = (r.member_ids || [])
      .map((id) => (id === memberId ? 'You' : memberNames?.[id]))
      .filter(Boolean) as string[];
    const who = names.length > 0 ? names.slice(0, 5).join(', ') + (names.length > 5 ? ` +${names.length - 5} more` : '') : `${r.count}`;
    return `${who} reacted with ${isCustomReaction(r.emoji) ? 'a custom reaction' : r.emoji}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5" aria-label="Message reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle(r.emoji);
          }}
          title={tooltipFor(r)}
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
      ))}
    </div>
  );
}
