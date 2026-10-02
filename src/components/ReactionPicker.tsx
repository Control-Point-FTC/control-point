import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from './ui';
import { apiFetch, assetUrl } from '../services/api';

/** Discord-style quick reactions — our own default set. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥', '👏', '💯'];

interface EmojiEntry {
  e: string;
  n: string;
}

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: EmojiEntry[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: [
      { e: '😀', n: 'grinning' }, { e: '😃', n: 'smiley' }, { e: '😄', n: 'smile' },
      { e: '😁', n: 'grin' }, { e: '😆', n: 'laughing' }, { e: '😅', n: 'sweat smile' },
      { e: '🤣', n: 'rofl rolling laughing' }, { e: '😂', n: 'joy tears' },
      { e: '🙂', n: 'slightly smiling' }, { e: '🙃', n: 'upside down' },
      { e: '😉', n: 'wink' }, { e: '😊', n: 'blush smiling' }, { e: '😇', n: 'innocent halo' },
      { e: '🥰', n: 'smiling hearts' }, { e: '😍', n: 'heart eyes' }, { e: '🤩', n: 'star struck' },
      { e: '😘', n: 'kiss' }, { e: '😋', n: 'yummy tongue' }, { e: '😛', n: 'tongue' },
      { e: '😜', n: 'winking tongue' }, { e: '🤪', n: 'zany crazy' }, { e: '🤗', n: 'hug' },
      { e: '🤭', n: 'giggle hand' }, { e: '🤫', n: 'shush quiet' }, { e: '🤔', n: 'thinking' },
      { e: '😐', n: 'neutral' }, { e: '🙄', n: 'eye roll' }, { e: '😴', n: 'sleeping' },
      { e: '🤤', n: 'drool' }, { e: '😷', n: 'mask sick' }, { e: '🥵', n: 'hot' },
      { e: '🥶', n: 'cold freezing' }, { e: '😵', n: 'dizzy' }, { e: '🤯', n: 'exploding head mind blown' },
      { e: '🥳', n: 'party face' }, { e: '😎', n: 'cool sunglasses' }, { e: '🤓', n: 'nerd' },
      { e: '😕', n: 'confused' }, { e: '😟', n: 'worried' }, { e: '🙁', n: 'slight frown' },
      { e: '😮', n: 'open mouth wow' }, { e: '😲', n: 'astonished' }, { e: '🥺', n: 'pleading puppy' },
      { e: '😢', n: 'cry tear' }, { e: '😭', n: 'sob bawling' }, { e: '😱', n: 'scream fear' },
      { e: '😡', n: 'rage angry red' }, { e: '🤬', n: 'cursing swearing' },
      { e: '👻', n: 'ghost' }, { e: '💀', n: 'skull' }, { e: '🤖', n: 'robot' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '👍',
    emojis: [
      { e: '👋', n: 'wave hello' }, { e: '🤚', n: 'raised hand' }, { e: '✋', n: 'high five raised' },
      { e: '👌', n: 'ok hand perfect' }, { e: '✌️', n: 'victory peace' },
      { e: '🤞', n: 'crossed fingers luck' }, { e: '🤟', n: 'love you ily' },
      { e: '🤘', n: 'rock on horns' }, { e: '👈', n: 'point left' }, { e: '👉', n: 'point right' },
      { e: '👆', n: 'point up' }, { e: '👇', n: 'point down' }, { e: '☝️', n: 'pointing up one' },
      { e: '👍', n: 'thumbs up like yes' }, { e: '👎', n: 'thumbs down dislike no' },
      { e: '✊', n: 'fist bump' }, { e: '👊', n: 'punch fist' }, { e: '👏', n: 'clap applause' },
      { e: '🙌', n: 'praise hands up' }, { e: '👐', n: 'open hands' }, { e: '🤝', n: 'handshake deal' },
      { e: '🙏', n: 'pray please thanks folded' }, { e: '💪', n: 'muscle strong flex' },
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: [
      { e: '❤️', n: 'red heart love' }, { e: '🧡', n: 'orange heart' }, { e: '💛', n: 'yellow heart' },
      { e: '💚', n: 'green heart' }, { e: '💙', n: 'blue heart' }, { e: '💜', n: 'purple heart' },
      { e: '🖤', n: 'black heart' }, { e: '🤍', n: 'white heart' }, { e: '🤎', n: 'brown heart' },
      { e: '💔', n: 'broken heart' }, { e: '💕', n: 'two hearts' }, { e: '💖', n: 'sparkling heart' },
      { e: '💘', n: 'heart arrow cupid' }, { e: '💝', n: 'heart gift box' },
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: '🔥',
    emojis: [
      { e: '🔥', n: 'fire lit' }, { e: '⭐', n: 'star' }, { e: '🌟', n: 'glowing star' },
      { e: '✨', n: 'sparkles shiny' }, { e: '⚡', n: 'lightning zap' }, { e: '💥', n: 'boom explosion' },
      { e: '🎉', n: 'party popper tada' }, { e: '🎊', n: 'confetti ball' }, { e: '🎈', n: 'balloon' },
      { e: '🎁', n: 'gift present' }, { e: '🏆', n: 'trophy winner' }, { e: '🥇', n: 'gold medal first' },
      { e: '🥈', n: 'silver medal second' }, { e: '🥉', n: 'bronze medal third' },
      { e: '💯', n: 'hundred 100 perfect' }, { e: '✅', n: 'check mark yes' }, { e: '❌', n: 'cross no x' },
      { e: '❓', n: 'question' }, { e: '❗', n: 'exclamation' }, { e: '⚠️', n: 'warning' },
      { e: '💡', n: 'idea lightbulb' }, { e: '🚀', n: 'rocket ship' }, { e: '👀', n: 'eyes looking' },
      { e: '💤', n: 'zzz sleep' }, { e: '🎵', n: 'music note' }, { e: '📌', n: 'pin pushpin' },
      { e: '📣', n: 'megaphone announcement' }, { e: '🎯', n: 'target bullseye' },
    ],
  },
];

export interface CustomEmoji {
  id: number;
  name: string;
  image_url: string;
}

interface ReactionPickerProps {
  /** Called with a unicode emoji or `custom:<id>`. */
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Popover reaction picker: quick reactions, a searchable emoji grid, and the
 * viewer's own custom (uploaded) reactions. Render inside a positioned wrapper
 * (see the ChatView integration snippet); the fixed backdrop below dismisses it.
 */
export default function ReactionPicker({ onPick, onClose }: ReactionPickerProps) {
  const [tab, setTab] = useState<string>('smileys');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState<CustomEmoji[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/chat/custom-emoji')
      .then((r) => r.json())
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setCustom(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: EmojiEntry[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const em of cat.emojis) {
        if (em.n.includes(q)) out.push(em);
        if (out.length >= 64) return out;
      }
    }
    return out;
  }, [query]);

  const activeCategory = EMOJI_CATEGORIES.find((c) => c.id === tab);
  const grid: EmojiEntry[] | null = filtered ?? activeCategory?.emojis ?? null;

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-40 cursor-default" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Pick a reaction"
        className="relative z-50 w-72 rounded-2xl border border-text-base/10 bg-secondary shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* quick reactions */}
        <div className="px-3 pt-3 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-1.5">Quick reactions</p>
          <div className="flex items-center gap-0.5">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => onPick(e)}
                title={`React ${e}`}
                className="p-1.5 rounded-lg text-xl leading-none hover:bg-text-base/[0.08] hover:scale-125 active:scale-100 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/60" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emojis"
              className="w-full bg-primary border border-text-base/10 rounded-xl pl-8 pr-8 py-1.5 text-xs text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted/60 hover:text-text-base"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* category tabs */}
        {!filtered && (
          <div className="flex items-center gap-1 px-3 pb-2 border-b border-text-base/[0.06]">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setTab(c.id)}
                title={c.label}
                className={cn(
                  'p-1.5 rounded-lg text-lg leading-none transition-colors',
                  tab === c.id ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-text-base/[0.08] opacity-70 hover:opacity-100'
                )}
              >
                {c.icon}
              </button>
            ))}
          </div>
        )}

        {/* emoji grid */}
        <div className="max-h-48 overflow-y-auto custom-scrollbar p-2">
          {grid && grid.length > 0 ? (
            <div className="grid grid-cols-8 gap-0.5">
              {grid.map((em, i) => (
                <button
                  key={`${em.e}-${i}`}
                  onClick={() => onPick(em.e)}
                  title={em.n}
                  className="p-1.5 rounded-lg text-xl leading-none hover:bg-text-base/[0.08] hover:scale-125 active:scale-100 transition-transform"
                >
                  {em.e}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted/70 text-center py-6">No emojis match “{query}”.</p>
          )}
        </div>

        {/* my custom reactions */}
        <div className="border-t border-text-base/[0.06] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 mb-1.5">
            My custom reactions{custom.length > 0 ? ` · ${custom.length}/25` : ''}
          </p>
          {custom.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {custom.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onPick(`custom:${c.id}`)}
                  title={`:${c.name}: (only you can use this)`}
                  className="p-1 rounded-lg hover:bg-text-base/[0.08] hover:scale-110 active:scale-100 transition-transform border border-text-base/10"
                >
                  <img
                    src={assetUrl(c.image_url) ?? undefined}
                    alt={c.name}
                    className="w-7 h-7 object-contain rounded"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-text-muted/70">
              No custom reactions yet — upload your own in <span className="font-semibold text-text-base/80">Settings → Reactions</span>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
