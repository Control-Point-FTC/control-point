// Modern Bruno (phase 6): a focused, full-height conversation with a history
// rail. Rebuilt on the shadcn kit over the shared useBrunoConversation (same
// chats API, streaming, proposals, NavGPT handoff as Legacy). Thinking steps,
// a streaming caret and Stop are always on here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Globe, History, Lock, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Switch,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { useBrunoConversation } from '../../../components/bruno/useBrunoConversation';
import { nextStarters } from '../../../components/brunoStarters';
import { BrunoAvatar, BrunoComposer, BrunoReply, LiveReply, UserTurn } from './BrunoParts';

const STARTERS: { label: string; prompts: string[] }[] = [
  { label: 'Do it for me', prompts: [
    'Add a task for build session this Saturday', 'Schedule our next team meeting', 'Log the email I just sent to our sponsor',
    'Create a task to order REV parts', 'Add our qualifier date to the calendar', 'Log the reply I got from the venue',
  ] },
  { label: 'Code', prompts: [
    'Help me write a TeleOp OpMode in Java', 'How do I use encoders in autonomous?', 'How do I tune PID for our lift?',
    'Write a simple autonomous that drives forward and parks', 'How do I use the IMU for field-centric drive?',
  ] },
  { label: 'Build & strategy', prompts: [
    'How should we design an intake for BIOBUZZ pollen?', 'Mecanum vs tank drive — which should we pick?',
    'What should our BIOBUZZ match strategy be?', 'How do we prepare for the judges?', 'My robot drifts in autonomous — where do I start?',
  ] },
];

function timeAgo(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString();
}

export function BrunoPage(props: any) {
  const c = useBrunoConversation({ currentUser: props.currentUser, hasScope: props.hasScope, botName: props.botName });
  const narrow = useIsNarrow();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [starters, setStarters] = useState(() => Object.fromEntries(STARTERS.map((g) => [g.label, nextStarters({ greeting: '', prompts: g.prompts }, [], 2)])));
  const refreshStarters = () => setStarters((prev) => Object.fromEntries(STARTERS.map((g) => [g.label, nextStarters({ greeting: '', prompts: g.prompts }, prev[g.label]?.seen ?? [], 2)])));

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: c.stream.active ? 'auto' : 'smooth' });
  }, [c.messages, c.activeId, c.stream.text, c.stream.active]);

  const filter = (list: any[]) => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((x) => String(x.title || 'Untitled chat').toLowerCase().includes(q)) : list;
  };
  const mine = useMemo(() => filter(c.myChats), [c.myChats, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = useMemo(() => filter(c.teamChats), [c.teamChats, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: number) => { c.setActiveId(id); setHistoryOpen(false); };
  const empty = c.messages.length === 0 && !c.stream.active;

  const history = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 p-3">
        <Button className="w-full justify-start" onClick={() => { c.newChat(); setHistoryOpen(false); }} disabled={c.busy}><Plus /> New chat</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="h-9 pl-8" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {c.loading ? (
          <div className="space-y-2 p-1">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : (
          <>
            <ChatGroup label="Yours" chats={mine} activeId={c.activeId} onOpen={open} currentUserId={props.currentUser?.id} />
            <ChatGroup label="Shared by the team" chats={team} activeId={c.activeId} onOpen={open} currentUserId={props.currentUser?.id} />
            {!mine.length && !team.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{query ? 'No chats match.' : 'No chats yet.'}</p>}
            {c.chatsHasMore && !query && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void c.fetchChats(undefined, true)}>Show older chats</Button>}
          </>
        )}
      </div>
    </div>
  );

  const chat = c.activeChat;
  const canDelete = !!chat && (c.isOwner || c.isAdmin);

  return (
    <div className="flex h-full min-h-0">
      {!narrow && <aside className="hidden w-64 shrink-0 border-r border-border bg-card/40 lg:block">{history}</aside>}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden max-sm:size-11" aria-label="Chat history" onClick={() => setHistoryOpen(true)}><History /></Button>
          {renaming && chat ? (
            <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setRenaming(false); void c.renameChat(title); }}>
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Chat title" className="h-9" onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} />
              <Button type="submit" size="sm">Save</Button>
            </form>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{chat ? chat.title || 'Untitled chat' : `New chat with ${c.name}`}</p>
              {chat && <p className="flex items-center gap-1 text-xs text-muted-foreground">{chat.is_public ? <><Globe className="size-3" /> Shared with the team</> : <><Lock className="size-3" /> Only you</>}{!c.isOwner && chat.owner_name ? ` · ${chat.owner_name}` : ''}</p>}
            </div>
          )}
          {chat && c.isOwner && !renaming && (
            <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              Share <Switch checked={!!chat.is_public} onCheckedChange={() => void c.togglePublic()} aria-label="Share with the team" />
            </label>
          )}
          {chat && (c.isOwner || canDelete) && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Chat options" className="max-sm:size-11"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {c.isOwner && <DropdownMenuItem onSelect={() => { setTitle(chat.title || ''); setRenaming(true); }}><Pencil /> Rename</DropdownMenuItem>}
                {c.isOwner && <DropdownMenuItem className="sm:hidden" onSelect={() => void c.togglePublic()}>{chat.is_public ? <><Lock /> Make private</> : <><Globe /> Share with the team</>}</DropdownMenuItem>}
                {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => void c.removeChat(chat)}><Trash2 /> Delete chat</DropdownMenuItem></>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            <AnimatePresence mode="wait" initial={false}>
              {empty ? (
                <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center pt-6 text-center sm:pt-14">
                  <BrunoAvatar className="size-12 [&_svg]:size-6" />
                  <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-3xl">What are we working on?</h1>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">{c.name} knows your team’s tasks, calendar and scouting, and can do things for you — it always asks before changing anything.</p>
                  <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-3">
                    {STARTERS.map((g) => (
                      <div key={g.label} className="rounded-xl border border-border bg-card p-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">{g.label}</p>
                        <div className="space-y-1.5">
                          {(starters[g.label]?.batch ?? []).map((s: string) => (
                            <button key={s} type="button" disabled={c.busy} onClick={() => void c.send(s)} className="block min-h-11 w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-3" onClick={refreshStarters}><RefreshCw /> More ideas</Button>
                </motion.div>
              ) : (
                <motion.div key={`chat-${c.activeId ?? 'new'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  {c.messages.map((m, i) => (m.role === 'user'
                    ? <UserTurn key={i} text={m.text} images={(m as any).images?.length} pdfs={(m as any).pdfs?.length} />
                    : <BrunoReply
                        key={i} text={m.text} index={i} isLastModel={i === c.lastModelIdx} busy={c.busy}
                        proposal={c.proposalState[i]} switchDismissed={c.dismissedSwitch.includes(i)}
                        onConfirmProposals={c.confirmProposals} onDismissProposal={c.dismissProposal}
                        onSwitchToBruno={c.switchToBruno} onDismissSwitch={c.dismissSwitch}
                      />))}
                  {c.stream.active && <LiveReply text={c.stream.text} liveThink={c.liveThink} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <BrunoComposer
            value={c.input} onChange={c.setInput} onSend={() => void c.send()} onStop={c.stop} busy={c.busy}
            attached={c.attached} setAttached={c.setAttached} attachedPdfs={c.attachedPdfs} setAttachedPdfs={c.setAttachedPdfs}
            placeholder={`Message ${c.name}…`}
          />
          <p className="mt-1.5 text-center text-xs text-muted-foreground">Grounded in GM0, FTC docs and supplier resources. Screenshots and PDFs are read once and never saved.</p>
        </div>
      </section>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-80 gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Chats</SheetTitle>
            <SheetDescription className="sr-only">Your Bruno conversations</SheetDescription>
          </SheetHeader>
          {history}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChatGroup({ label, chats, activeId, onOpen, currentUserId }: { label: string; chats: any[]; activeId: number | null; onOpen: (id: number) => void; currentUserId?: number }) {
  if (!chats.length) return null;
  return (
    <div className="mt-2">
      <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-0.5">
        {chats.map((chat) => {
          const on = chat.id === activeId;
          return (
            <li key={chat.id}>
              <button
                type="button"
                onClick={() => onOpen(chat.id)}
                aria-current={on ? 'true' : undefined}
                className={cn('relative flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-muted' : 'hover:bg-muted/60')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{chat.title || 'Untitled chat'}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {chat.is_public ? <Globe className="size-3" /> : <Lock className="size-3" />}
                    {chat.member_id !== currentUserId && chat.owner_name ? `${chat.owner_name} · ` : ''}{timeAgo(chat.updated_at)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
