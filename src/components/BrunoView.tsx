import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BrunoMarkdown } from './BrunoMarkdown';
import {
  Plus, Trash2, Globe, Lock, Pencil, Check, X, Sparkles, ChevronLeft, ImagePlus,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import ChatInput from './ChatInput';
import { streamBuildHelper, stripEventBlocks, applyActionProposals, notifyBrunoDataChanged, type BuildHelperMessage, type ActionProposal } from '../services/aiService';
import { AttachedImageStrip, filesToAttachedImages, imagesFromPaste, MAX_BRUNO_IMAGES, type AttachedImage } from './BrunoImageAttach';
import { type ProposalStatus } from './ActionProposalCard';
import { BrunoMessageRow } from './BrunoMessageRow';
import BrunoIcon from './BrunoIcon';
import { useBatchedStream } from './useBatchedStream';
import { confirmDialog } from './dialog';
import type { BrunoChat, BrunoChatMessage } from '../types/bruno';

/** Lightweight starter categories for the full-page empty state. */
const STARTER_GROUPS: { label: string; prompts: string[] }[] = [
  { label: 'Code', prompts: ['Help me write a TeleOp OpMode in Java', 'How do I use encoders in autonomous?'] },
  { label: 'Build', prompts: ['How should we design an intake for BIOBUZZ pollen?', 'Mecanum vs tank drive — which should we pick?'] },
  { label: 'Strategy', prompts: ['What should our BIOBUZZ match strategy be?', 'How do we prepare for the judges?'] },
  { label: 'Debugging', prompts: ['How do I tune PID for our lift?', 'My robot drifts in autonomous — where do I start?'] },
];

function timeAgo(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function BrunoView({ currentUser, hasScope, botName }: any) {
  const name = botName || 'Bruno';
  const [chats, setChats] = useState<BrunoChat[]>([]);
  const location = useLocation();
  const [activeId, setActiveId] = useState<number | null>(() => {
    // Expanding the sidebar panel passes its chat through location state so
    // the full view lands on the same conversation.
    const s = (location.state as any)?.chatId;
    return typeof s === 'number' && s > 0 ? s : null;
  });
  // Same, for expands that happen while the full view is already mounted.
  useEffect(() => {
    const s = (location.state as any)?.chatId;
    if (typeof s === 'number' && s > 0 && s !== activeId) setActiveId(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Screenshots attached to the next message — cleared on send, never saved.
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const addAttached = (imgs: AttachedImage[]) => {
    if (!imgs.length) return;
    setAttached((prev) => [...prev, ...imgs].slice(0, MAX_BRUNO_IMAGES));
  };
  // NavGPT -> Bruno coding handoff: once the user accepts the switch, this chat
  // stays on the plain Bruno persona (per chat id). Dismissed handoff offers are
  // tracked by message index so "Nah" sticks.
  const [personaByChat, setPersonaByChat] = useState<Record<number, string>>({});
  const [dismissedSwitch, setDismissedSwitch] = useState<number[]>([]);
  // Data-action proposals (```event/```outreach/```tasks/```budget blocks):
  // pending until the user taps the confirm card's "Add all" button.
  const [proposalState, setProposalState] = useState<Record<number, { status: ProposalStatus; error?: string }>>({});
  // Batched streaming: chunks accumulate in a ref and flush to state at most
  // every 40ms, so per-token setState calls don't re-render the whole chat.
  // The in-flight reply renders separately from `messages` below.
  const stream = useBatchedStream(40);

  const confirmProposals = useCallback(async (idx: number, proposals: ActionProposal[]) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'confirming' } }));
    try {
      const applied = await applyActionProposals(proposals);
      // Refresh any views the applied actions touch (calendar, tasks, ...).
      const types = Object.keys(applied).map((k) => (k === 'event' || k === 'delete-event' ? 'calendar' : k));
      notifyBrunoDataChanged(types);
      setProposalState((s) => ({ ...s, [idx]: { status: 'done' } }));
    } catch (e: any) {
      setProposalState((s) => ({ ...s, [idx]: { status: 'error', error: e?.message || 'Something went wrong' } }));
    }
  }, []);

  const dismissProposal = useCallback((idx: number) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'dismissed' } }));
  }, []);

  const dismissSwitch = useCallback((idx: number) => {
    setDismissedSwitch((d) => (d.includes(idx) ? d : [...d, idx]));
  }, []);

  const isAdmin = hasScope ? hasScope('admin') : false;
  const activeChat = chats.find((c) => c.id === activeId) || null;
  const isOwner = activeChat && currentUser && activeChat.member_id === currentUser.id;

  const CHAT_PAGE = 30;
  const [chatsHasMore, setChatsHasMore] = useState(false);

  const fetchChats = async (selectId?: number | null, append = false) => {
    try {
      const offset = append ? chats.length : 0;
      const res = await apiFetch(`/api/bruno/chats?limit=${CHAT_PAGE}&offset=${offset}`);
      const list: BrunoChat[] = res.ok ? await res.json() : [];
      setChats((prev) => (append ? [...prev, ...list] : list));
      setChatsHasMore(list.length === CHAT_PAGE);
      if (selectId !== undefined) {
        setActiveId(selectId);
      } else if (activeId === null && list.length > 0 && !append) {
        setActiveId(list[0].id);
      }
    } catch {
      /* offline — keep empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId === null || busyRef.current) {
      if (activeId === null) setMessages([]);
      return;
    }
    setDismissedSwitch([]);
    setProposalState({});
    (async () => {
      try {
        const res = await apiFetch(`/api/bruno/chats/${activeId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(((data.messages || []) as BrunoChatMessage[]).map((m) => ({ role: m.role, text: m.text })));
        }
      } catch {
        /* keep previous */
      }
    })();
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId, stream.text, stream.active]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if ((!content && !attached.length) || busy) return;
    setInput('');
    const outgoing = attached;
    setAttached([]);
    let chatId = activeId;
    try {
      if (!chatId) {
        const res = await apiFetch('/api/bruno/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) return;
        const created = await res.json();
        chatId = created.id;
        setActiveId(chatId);
      }
      const next: BuildHelperMessage[] = [...messages, { role: 'user', text: content || 'What do you see in this screenshot?', ...(outgoing.length ? { images: outgoing } : {}) }];
      setMessages(next);
      setBusy(true);
      busyRef.current = true;
      // The in-flight reply renders in its own bubble (batched); it only
      // joins `messages` once complete, so memoized rows never re-render
      // per chunk.
      stream.start();
      let agg = '';
      const persona = chatId ? personaByChat[chatId] : undefined;
      try {
        await streamBuildHelper(next, (chunk) => {
          agg += chunk;
          stream.push(chunk);
        }, chatId || undefined, persona ? { persona } : undefined);
        setMessages([...next, { role: 'model', text: agg.trim() ? agg : `${name} hit a snag — please try again in a moment.` }]);
      } finally {
        stream.finish();
      }
      // Note: data-action proposal blocks (```event etc.) are NOT auto-inserted
      // anymore — the confirm card calls applyActionProposals + notify on tap.
      fetchChats(chatId);
    } catch (e: any) {
      const blockedMsg = e?.serverError;
      stream.finish();
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: blockedMsg || `${name} isn't reachable right now. Check your connection and try again.` },
      ]);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  // NavGPT coding handoff: the user accepted the switch. Drop NavGPT's offer
  // message, pin this chat to the plain Bruno persona, and have Bruno answer
  // the pending coding question directly — one fluid switch, no re-asking.
  // Stable identity so the memoized last message row doesn't re-render
  // just because the parent did.
  const switchToBruno = useCallback(async () => {
    const cid = activeId;
    if (!cid || busyRef.current) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return;
    const base = messages.slice(0, lastUserIdx + 1); // ends with the coding question
    setMessages(base);
    setPersonaByChat((m) => ({ ...m, [cid]: 'bruno' }));
    setBusy(true);
    busyRef.current = true;
    stream.start();
    let agg = '';
    try {
      await streamBuildHelper(base, (chunk) => {
        agg += chunk;
        stream.push(chunk);
      }, cid, { persona: 'bruno' });
      setMessages([...base, { role: 'model', text: agg.trim() ? agg : `Bruno hit a snag — please try again in a moment.` }]);
    } catch {
      setMessages([...base, { role: 'model', text: `Bruno isn't reachable right now. Check your connection and try again.` }]);
    } finally {
      stream.finish();
      setBusy(false);
      busyRef.current = false;
    }
    fetchChats(cid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messages, personaByChat]);

  const saveTitle = async () => {
    if (!activeChat || !isOwner) return;
    const t = titleDraft.trim();
    setEditingTitle(false);
    if (!t || t === activeChat.title) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${activeChat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      });
      if (res.ok) fetchChats(activeChat.id);
    } catch { /* ignore */ }
  };

  const togglePublic = async () => {
    if (!activeChat || !isOwner) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${activeChat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !activeChat.is_public }),
      });
      if (res.ok) fetchChats(activeChat.id);
    } catch { /* ignore */ }
  };

  const removeChat = async (chat: any) => {
    if (!chat) return;
    if (!(await confirmDialog({ title: 'Delete chat', message: `Delete "${chat.title || 'Untitled chat'}"? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await apiFetch(`/api/bruno/chats/${chat.id}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = chats.filter((c) => c.id !== chat.id);
        setChats(remaining);
        if (activeId === chat.id) {
          setActiveId(remaining.length ? remaining[0].id : null);
          setMessages([]);
        }
      }
    } catch { /* ignore */ }
  };

  const myChats = chats.filter((c) => currentUser && c.member_id === currentUser.id);
  const teamChats = chats.filter((c) => !(currentUser && c.member_id === currentUser.id));
  const lastModelIdx = messages.map((m) => m.role).lastIndexOf('model');

  const renderRow = (chat: any) => {
    const mine = currentUser && chat.member_id === currentUser.id;
    const canDelete = mine || isAdmin;
    return (
      <div
        key={chat.id}
        onClick={() => setActiveId(chat.id)}
        role="button"
        tabIndex={0}
        aria-current={chat.id === activeId ? 'true' : undefined}
        aria-label={`Open chat: ${chat.title || 'Untitled chat'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(chat.id); } }}
        className={`group w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          chat.id === activeId
            ? 'bg-accent/10 border-accent/40'
            : 'bg-text-base/[0.03] border-text-base/[0.07] hover:border-text-base/20'
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-text-base truncate">{chat.title || 'Untitled chat'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {chat.is_public ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300"><Globe className="w-3 h-3" />Team</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-text-muted"><Lock className="w-3 h-3" />Private</span>
              )}
              {!mine && chat.owner_name && (
                <span className="text-[10px] text-text-muted truncate">· {chat.owner_name}</span>
              )}
              <span className="text-[10px] text-text-muted/70">{timeAgo(chat.updated_at)}</span>
            </div>
          </div>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); removeChat(chat); }}
              aria-label={`Delete chat: ${chat.title || 'Untitled chat'}`}
              title="Delete chat"
              // Hover-only reveal doesn't exist on touch screens — always show there.
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 p-1.5 text-text-muted hover:text-rose-400 transition-all shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)] min-h-[480px]">
      {/* Chat list */}
      <div className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-72 shrink-0 flex-col gap-3 overflow-y-auto custom-scrollbar pr-1`}>
        <button
          onClick={() => { setActiveId(null); setMessages([]); }}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 hover:brightness-110 active:scale-[0.98] transition shadow-[0_4px_16px_rgba(255,199,0,0.25)]"
        >
          <Plus className="w-4 h-4" /> New chat
        </button>
        {loading ? (
          <p className="text-sm text-text-muted px-1">Loading chats…</p>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 px-1 mb-1.5">My chats</p>
              <div className="space-y-1.5">
                {myChats.length === 0 && <p className="text-xs text-text-muted/70 px-1">Nothing yet — start one above.</p>}
                {myChats.map(renderRow)}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 px-1 mb-1.5">Team chats</p>
              <div className="space-y-1.5">
                {teamChats.length === 0 && <p className="text-xs text-text-muted/70 px-1">No shared chats yet.</p>}
                {teamChats.map(renderRow)}
              </div>
            </div>
            {chatsHasMore && (
              <button
                onClick={() => fetchChats(undefined, true)}
                className="w-full mt-2 text-xs font-semibold text-text-muted hover:text-text-base border border-text-base/10 hover:border-text-base/25 rounded-lg py-2 transition-colors"
              >
                Show older chats
              </button>
            )}
          </>
        )}
      </div>

      {/* Active chat */}
      <div className={`${activeId || messages.length ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col rounded-2xl border border-text-base/10 bg-text-base/[0.02] overflow-hidden`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-text-base/10 bg-text-base/[0.03] flex items-center gap-3">
          <button onClick={() => setActiveId(null)} aria-label="Back to chats" className="md:hidden text-text-muted hover:text-text-base">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 flex items-center justify-center shrink-0">
            <BrunoIcon className="w-5 h-5 text-accent-ink" />
          </div>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  autoFocus
                  className="flex-1 min-w-0 bg-primary border border-accent/40 rounded-lg px-2 py-1 text-sm text-text-base focus:outline-none"
                />
                <button onClick={saveTitle} aria-label="Save title" className="text-accent hover:brightness-110"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingTitle(false)} aria-label="Cancel" className="text-text-muted hover:text-text-base"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-text-base font-bold text-sm truncate">{activeChat?.title || 'New chat'}</p>
                {isOwner && (
                  <button
                    onClick={() => { setTitleDraft(activeChat?.title || ''); setEditingTitle(true); }}
                    aria-label="Rename chat"
                    className="text-text-muted hover:text-accent shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-text-muted">
              {activeChat?.is_public
                ? `Shared with the team${activeChat?.owner_name && !isOwner ? ` · by ${activeChat.owner_name}` : ''}`
                : 'Private to you'}
            </p>
          </div>
          {isOwner && (
            <button
              onClick={togglePublic}
              title={activeChat?.is_public ? 'Make private' : 'Share with team'}
              className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors ${
                activeChat?.is_public
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  : 'bg-text-base/[0.04] text-text-muted border-text-base/10 hover:text-text-base hover:border-text-base/25'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {activeChat?.is_public ? 'Shared' : 'Share with team'}
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-4 max-w-lg mx-auto pt-6">
              <div className="rounded-2xl bg-text-base/[0.04] border border-text-base/[0.07] p-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] flex items-center justify-center mb-3">
                  <BrunoIcon className="w-6 h-6 text-accent-ink" />
                </div>
                <p className="text-sm text-text-base/85 leading-relaxed">
                  Hey, I'm <span className="font-bold text-accent">{name}</span> — ask me anything about building
                  your FTC robot: mechanisms, code, strategy, or troubleshooting.
                </p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 text-center">Try one</p>
              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                {STARTER_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-accent/80 mb-1.5">{g.label}</p>
                    <div className="grid gap-1.5">
                      {g.prompts.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          disabled={busy}
                          className="text-left text-[13px] text-text-base/75 hover:text-accent bg-text-base/[0.03] hover:bg-accent/10 border border-text-base/[0.07] hover:border-accent/30 rounded-xl px-3.5 py-2.5 transition-colors disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-accent-ink text-sm font-medium px-4 py-2.5 leading-relaxed">
                  {m.images?.length ? (
                    <div className="flex gap-1.5 mb-2">
                      {m.images.map((img, j) => (
                        <img
                          key={j}
                          src={`data:${img.mimeType};base64,${img.data}`}
                          alt={`Screenshot ${j + 1}`}
                          className="w-20 h-20 rounded-lg object-cover border border-black/10"
                        />
                      ))}
                    </div>
                  ) : null}
                  {m.text}
                </div>
              </div>
            ) : (
              <BrunoMessageRow
                key={i}
                text={m.text}
                index={i}
                isLastModel={i === lastModelIdx}
                busy={busy}
                proposal={proposalState[i]}
                switchDismissed={dismissedSwitch.includes(i)}
                onConfirmProposals={confirmProposals}
                onDismissProposal={dismissProposal}
                onSwitchToBruno={switchToBruno}
                onDismissSwitch={dismissSwitch}
              />
            )
          )}
          {/* In-flight reply: rendered separately and updated at most every
              40ms, so streaming never re-renders the memoized rows above. */}
          {stream.active && (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-text-base/[0.05] border border-text-base/[0.07] px-4 py-2.5 text-sm text-text-base/85 leading-relaxed">
                {stream.text ? (
                  <BrunoMarkdown>{stripEventBlocks(stream.text)}</BrunoMarkdown>
                ) : (
                  <span className="flex gap-1 items-center text-text-muted py-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          onPaste={(e) => {
            imagesFromPaste(e).then((imgs) => {
              if (imgs.length) { e.preventDefault(); addAttached(imgs); }
            });
          }}
          className="p-3 border-t border-text-base/10 bg-text-base/[0.02]"
        >
          <AttachedImageStrip images={attached} onRemove={(idx) => setAttached((p) => p.filter((_, j) => j !== idx))} />
          <div className="flex gap-2 items-end">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                filesToAttachedImages(e.target.files || []).then(addAttached);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || attached.length >= MAX_BRUNO_IMAGES}
              aria-label="Attach a screenshot"
              title="Attach a screenshot"
              className="w-10 h-10 shrink-0 rounded-xl border border-text-base/10 text-text-muted hover:text-accent hover:border-accent/40 flex items-center justify-center transition disabled:opacity-40"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => send()}
                disabled={busy}
                canSend={attached.length > 0}
                placeholder="Ask about mechanisms, code, strategy…"
              />
            </div>
          </div>
          <p className="text-[10px] text-text-muted/60 mt-1.5 px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Grounded in GM0, FTC docs &amp; supplier resources. Screenshots are read once and never saved.
            <span className="ml-auto hidden sm:inline">Shift+Enter for a new line</span>
          </p>
        </form>
      </div>
    </div>
  );
}
