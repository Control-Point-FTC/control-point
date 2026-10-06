// Modern reactions (phase 10b): the chip bar under a message and the emoji
// picker, over the shared useReactionToggle / useEmojiPicker (same optimistic
// toggle, rollback, search, categories and custom reactions as Classic).
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, SmilePlus, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui-kit';
import { assetUrl } from '../../../services/api';
import { isCustomReaction, useReactionToggle, type Reaction } from '../../../components/MessageReactions';
import { QUICK_REACTIONS, useEmojiPicker } from '../../../components/ReactionPicker';

function Face({ r, big }: { r: Reaction; big?: boolean }) {
  if (isCustomReaction(r.emoji) && r.image_url) {
    return <img src={assetUrl(r.image_url) ?? undefined} alt="custom reaction" draggable={false} className={cn('rounded-sm object-contain', big ? 'size-10' : 'size-4')} />;
  }
  return <span className={cn('select-none leading-none', big ? 'text-4xl' : 'text-sm')}>{r.emoji}</span>;
}

export function ReactionBar({ messageId, reactions, memberId, onReactionsChange, memberNames, onAdd }: {
  messageId: number;
  reactions: Reaction[];
  memberId: number;
  onReactionsChange: (messageId: number, reactions: Reaction[]) => void;
  memberNames?: Record<number, string>;
  /** Opens the emoji picker for this message. */
  onAdd: () => void;
}) {
  const t = useReactionToggle({ messageId, reactions, memberId, onReactionsChange, memberNames });
  if (!reactions?.length) return null;
  return (
    <TooltipProvider>
      <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label="Message reactions">
        <AnimatePresence initial={false}>
          {reactions.map((r) => {
            const names = t.namesFor(r);
            const shown = names.slice(0, 6);
            const rest = names.length - shown.length;
            return (
              <motion.span key={r.emoji} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void t.handleToggle(r.emoji); }}
                      aria-pressed={r.reacted_by_me}
                      aria-label={`${r.count} ${isCustomReaction(r.emoji) ? 'custom' : r.emoji} reactions${r.reacted_by_me ? ', including you' : ''}`}
                      className={cn(
                        'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-medium tabular-nums transition-colors max-sm:h-9',
                        r.reacted_by_me ? 'border-accent/60 bg-accent/15 text-foreground' : 'border-border bg-muted/60 text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                      )}
                    >
                      <Face r={r} />
                      <motion.span key={r.count} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{r.count}</motion.span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60 text-center">
                    <span className="mb-1 flex justify-center"><Face r={r} big /></span>
                    <span className="block font-medium">{shown.join(', ')}{rest > 0 && `, and ${rest} other${rest === 1 ? '' : 's'}`}</span>
                    <span className="block text-muted-foreground">reacted with {isCustomReaction(r.emoji) ? 'a custom emoji' : r.emoji}</span>
                  </TooltipContent>
                </Tooltip>
              </motion.span>
            );
          })}
        </AnimatePresence>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          aria-label="Add a reaction"
          className="inline-flex h-7 w-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground max-sm:h-9 max-sm:w-10"
        >
          <SmilePlus className="size-3.5" />
        </button>
      </div>
    </TooltipProvider>
  );
}

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const p = useEmojiPicker();
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Escape or a click outside closes it.
  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onDown, true); };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Pick a reaction"
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16 }}
      onClick={(e) => e.stopPropagation()}
      className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
    >
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5" aria-label="Quick reactions">
        {QUICK_REACTIONS.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} aria-label={`React ${e}`} className="flex size-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-muted">{e}</button>
        ))}
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} value={p.query} onChange={(e) => p.setQuery(e.target.value)} placeholder="Search emojis" aria-label="Search emojis" className="h-9 pl-8 pr-8" />
          {p.query && (
            <button type="button" onClick={() => p.setQuery('')} aria-label="Clear search" className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          )}
        </div>
      </div>
      {!p.filtered && (
        <div role="tablist" aria-label="Emoji categories" className="flex gap-0.5 px-2 pb-1.5">
          {p.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={p.tab === c.id}
              aria-label={c.label}
              onClick={() => p.setTab(c.id)}
              className={cn('relative flex size-9 items-center justify-center rounded-lg text-lg transition-opacity', p.tab === c.id ? 'opacity-100' : 'opacity-60 hover:opacity-100')}
            >
              {p.tab === c.id && <motion.span layoutId="emoji-tab" className="absolute inset-0 rounded-lg bg-muted" transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }} />}
              <span className="relative">{c.icon}</span>
            </button>
          ))}
        </div>
      )}
      <div className="max-h-52 overflow-y-auto border-t border-border p-1.5">
        {p.grid && p.grid.length > 0 ? (
          <div className="grid grid-cols-8 gap-0.5">
            {p.grid.map((em, i) => (
              <button key={`${em.e}-${i}`} type="button" onClick={() => onPick(em.e)} title={em.n} aria-label={em.n} className="flex aspect-square items-center justify-center rounded-md text-xl transition-transform hover:scale-110 hover:bg-muted">{em.e}</button>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No emojis match “{p.query}”.</p>
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <p className="mb-1.5 text-xs text-muted-foreground">My custom reactions{p.custom.length > 0 ? ` · ${p.custom.length}/25` : ''}</p>
        {p.custom.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.custom.map((c) => (
              <button key={c.id} type="button" onClick={() => onPick(`custom:${c.id}`)} title={`:${c.name}: (only you can use this)`} aria-label={`Custom reaction ${c.name}`} className="rounded-lg border border-border p-1 transition-transform hover:scale-110 hover:bg-muted">
                <img src={assetUrl(c.image_url) ?? undefined} alt={c.name} draggable={false} className="size-7 rounded object-contain" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">You have no custom reactions yet.</p>
        )}
      </div>
    </motion.div>
  );
}
