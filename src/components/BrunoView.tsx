import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import {
  Bot, Plus, Trash2, Send, Globe, Lock, Pencil, Check, X, Sparkles, ChevronLeft,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { streamBuildHelper, stripEventBlocks, type BuildHelperMessage } from '../services/aiService';
import { confirmDialog } from './dialog';

const STARTERS = [
  'How should we design an intake for BIOBUZZ pollen?',
  'Mecanum vs tank drive — which should we pick?',
  'Help me write a TeleOp OpMode in Java',
  'How do I tune PID for our lift?',
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

export default function BrunoView({ currentUser, hasScope }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const isAdmin = hasScope ? hasScope('admin') : false;
  const activeChat = chats.find((c) => c.id === activeId) || null;
  const isOwner = activeChat && currentUser && activeChat.member_id === currentUser.id;

  const fetchChats = async (selectId?: number | null) => {
    try {
      const res = await apiFetch('/api/bruno/chats');
      const list = res.ok ? await res.json() : [];
      setChats(list);
      if (selectId !== undefined) {
        setActiveId(selectId);
      } else if (activeId === null && list.length > 0) {
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
    (async () => {
      try {
        const res = await apiFetch(`/api/bruno/chats/${activeId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages((data.messages || []).map((m: any) => ({ role: m.role, text: m.text })));
        }
      } catch {
        /* keep previous */
      }
    })();
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
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
      const next: BuildHelperMessage[] = [...messages, { role: 'user', text: content }];
      setMessages(next);
      setBusy(true);
      busyRef.current = true;
      let agg = '';
      setMessages([...next, { role: 'model', text: '' }]);
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        setMessages([...next, { role: 'model', text: agg }]);
      }, chatId || undefined);
      if (!agg.trim()) {
        setMessages([...next, { role: 'model', text: 'Bruno hit a snag — please try again in a moment.' }]);
      }
      fetchChats(chatId);
    } catch {
      setMessages((prev) => {
        const base = prev.filter((m) => !(m.role === 'model' && !m.text));
        return [...base, { role: 'model', text: "Bruno isn't reachable right now. Check your connection and try again." }];
      });
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

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

  const renderRow = (chat: any) => {
    const mine = currentUser && chat.member_id === currentUser.id;
    const canDelete = mine || isAdmin;
    return (
      <div
        key={chat.id}
        onClick={() => setActiveId(chat.id)}
        className={`group w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
          chat.id === activeId
            ? 'bg-accent/10 border-accent/40'
            : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white truncate">{chat.title || 'Untitled chat'}</p>
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
              aria-label="Delete chat"
              className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-rose-400 transition-all shrink-0"
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
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent text-primary font-bold text-sm px-4 py-2.5 hover:brightness-110 active:scale-[0.98] transition shadow-[0_4px_16px_rgba(255,199,0,0.25)]"
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
          </>
        )}
      </div>

      {/* Active chat */}
      <div className={`${activeId || messages.length ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03] flex items-center gap-3">
          <button onClick={() => setActiveId(null)} aria-label="Back to chats" className="md:hidden text-text-muted hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  autoFocus
                  className="flex-1 min-w-0 bg-primary border border-accent/40 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
                />
                <button onClick={saveTitle} aria-label="Save title" className="text-accent hover:brightness-110"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingTitle(false)} aria-label="Cancel" className="text-text-muted hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-white font-bold text-sm truncate">{activeChat?.title || 'New chat'}</p>
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
                  : 'bg-white/[0.04] text-text-muted border-white/10 hover:text-white hover:border-white/25'
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
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] flex items-center justify-center mb-3">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-white/85 leading-relaxed">
                  Hey, I'm <span className="font-bold text-accent">Bruno</span> — ask me anything about building
                  your FTC robot: mechanisms, code, strategy, or troubleshooting.
                </p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 text-center">Try one</p>
              <div className="grid gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="text-left text-[13px] text-white/75 hover:text-accent bg-white/[0.03] hover:bg-accent/10 border border-white/[0.07] hover:border-accent/30 rounded-xl px-3.5 py-2.5 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-primary text-sm font-medium px-4 py-2.5 leading-relaxed">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white/[0.05] border border-white/[0.07] px-4 py-2.5 text-sm text-white/85 leading-relaxed">
                  {m.text ? (
                    <Markdown>{stripEventBlocks(m.text)}</Markdown>
                  ) : (
                    <span className="flex gap-1 items-center text-text-muted py-1">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="p-3 border-t border-white/10 bg-white/[0.02]"
        >
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about mechanisms, code, strategy…"
              disabled={busy}
              className="flex-1 min-w-0 bg-primary border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="w-10 h-10 shrink-0 rounded-xl bg-accent text-primary flex items-center justify-center hover:brightness-110 active:scale-95 transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-text-muted/60 mt-1.5 px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Grounded in GM0, FTC docs &amp; supplier resources. Verify rules in the official manual.
          </p>
        </form>
      </div>
    </div>
  );
}
